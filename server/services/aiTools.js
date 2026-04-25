// Tool definitions for the two-phase AI pipeline. Each phase exposes its own set
// of tools so the model can't reach for actions outside its current step. The
// schemas here are passed verbatim to Cerebras's chat-completions endpoint and
// the handlers run server-side when the model calls them.

const Todo = require('../models/Todo');
const Tag = require('../models/Tag');
const todoService = require('./todoService');
const embeddings = require('./embeddings');
const { HttpError } = require('../middleware/errorHandler');

// --- Locate phase ---

const LOCATE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'vector_search',
      description: 'Semantic search over the user\'s todos. Returns the top-K closest matches by meaning, with a breadcrumb showing each result\'s position in the tree.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text query, e.g. "the conclusion paragraph for the AI essay".' },
          k: { type: 'integer', minimum: 1, maximum: 25, default: 10 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'expand_todo',
      description: 'Return the immediate children of a todo. Use this to drill down into a parent when the user\'s reference is ambiguous.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ObjectId of the todo to expand.' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_target',
      description: 'End the locate phase by selecting a single existing todo as the target of the user\'s action. Call this as soon as the target is unambiguous.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ObjectId of the located todo.' },
          reasoning: { type: 'string', description: 'One-sentence justification visible in the search trail.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'respond_no_target',
      description: 'End the locate phase when the user wants to create a brand-new todo (no existing target). Also use when the user is asking a question rather than an action.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', enum: ['create_new', 'no_action'], description: 'create_new for "add task X", no_action for "what tasks do I have today?".' },
        },
        required: ['reason'],
      },
    },
  },
];

async function buildBreadcrumb(userId, todoId) {
  const labels = [];
  let cursor = await Todo.findOne({ _id: todoId, userId }).select('title parentId');
  while (cursor) {
    labels.unshift(cursor.title);
    if (!cursor.parentId) break;
    cursor = await Todo.findOne({ _id: cursor.parentId, userId }).select('title parentId');
  }
  return labels.join(' / ');
}

async function runLocateTool(userId, name, args) {
  if (name === 'vector_search') {
    const k = args.k || 10;
    const vec = await embeddings.vectorSearch(userId, args.query, k);
    if (vec) {
      return Promise.all(vec.map(async (r) => ({
        id: r._id.toString(),
        title: r.title,
        breadcrumb: await buildBreadcrumb(userId, r._id),
        tagIds: (r.tagIds || []).map((t) => t.toString()),
        score: r.score,
      })));
    }
    // Fallback when no embeddings: $text search.
    const docs = await Todo.find(
      { userId, $text: { $search: args.query } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(k);
    return Promise.all(docs.map(async (d) => ({
      id: d._id.toString(),
      title: d.title,
      breadcrumb: await buildBreadcrumb(userId, d._id),
      tagIds: (d.tagIds || []).map((t) => t.toString()),
    })));
  }

  if (name === 'expand_todo') {
    const children = await todoService.getChildren(userId, args.id);
    return children.map((c) => ({
      id: c.id,
      title: c.title,
      tagIds: c.tagIds,
      isCompleted: c.isCompleted,
    }));
  }

  // confirm_target / respond_no_target are terminal — handled by the pipeline loop.
  throw new HttpError(500, `unhandled_locate_tool:${name}`);
}

function trailLabelForLocate(name, args) {
  if (name === 'vector_search') return `Searching todos for "${args.query}"…`;
  if (name === 'expand_todo') return `Expanding todo ${args.id?.slice(-6)}…`;
  if (name === 'confirm_target') return 'Target confirmed.';
  if (name === 'respond_no_target') {
    return args.reason === 'create_new' ? 'Creating new todo…' : 'Answering without acting.';
  }
  return name;
}

// --- Act phase ---

const ACT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_todo',
      description: 'Create a new todo, optionally as a child of `parentId`. Use only when no existing target was located.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          dueAt: { type: 'string', description: 'ISO-8601 datetime. Omit if the user did not specify a due date.' },
          parentId: { type: 'string', description: 'ObjectId of the parent todo, if any.' },
          tagIds: { type: 'array', items: { type: 'string' }, description: 'Tag ObjectIds. Only include if the user explicitly asked for tagging.' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_todo',
      description: 'Modify fields on the located todo. Only include fields the user actually asked to change.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          dueAt: { type: ['string', 'null'], description: 'ISO-8601 datetime, or null to clear.' },
          tagIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_todo',
      description: 'Mark the located todo complete or active. Completing a parent cascades to all descendants; un-completing does not.',
      parameters: {
        type: 'object',
        properties: { isCompleted: { type: 'boolean' } },
        required: ['isCompleted'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_todo',
      description: 'Delete the located todo and all of its descendants.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_tag_to_todo',
      description: 'Add a tag to the located todo by tagId.',
      parameters: {
        type: 'object',
        properties: { tagId: { type: 'string' } },
        required: ['tagId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_tag_from_todo',
      description: 'Remove a tag from the located todo by tagId.',
      parameters: {
        type: 'object',
        properties: { tagId: { type: 'string' } },
        required: ['tagId'],
      },
    },
  },
];

function previewActionFor(toolName) {
  if (toolName === 'create_todo') return 'create';
  if (toolName === 'delete_todo') return 'delete';
  return 'update'; // update / complete / tag ops all use the yellow preview
}

async function runActTool(userId, name, args, locatedTargetId) {
  if (name === 'create_todo') {
    return await todoService.createTodo(userId, args);
  }
  if (name === 'update_todo') {
    if (!locatedTargetId) throw new HttpError(400, 'update_without_target');
    return await todoService.updateTodo(userId, locatedTargetId, args);
  }
  if (name === 'complete_todo') {
    if (!locatedTargetId) throw new HttpError(400, 'complete_without_target');
    return await todoService.completeTodo(userId, locatedTargetId, !!args.isCompleted);
  }
  if (name === 'delete_todo') {
    if (!locatedTargetId) throw new HttpError(400, 'delete_without_target');
    return await todoService.deleteTodo(userId, locatedTargetId);
  }
  if (name === 'add_tag_to_todo') {
    if (!locatedTargetId) throw new HttpError(400, 'tag_without_target');
    return await todoService.addTagToTodo(userId, locatedTargetId, args.tagId);
  }
  if (name === 'remove_tag_from_todo') {
    if (!locatedTargetId) throw new HttpError(400, 'tag_without_target');
    return await todoService.removeTagFromTodo(userId, locatedTargetId, args.tagId);
  }
  throw new HttpError(500, `unhandled_act_tool:${name}`);
}

function trailLabelForAct(name, args) {
  if (name === 'create_todo') return `Creating "${args.title}"…`;
  if (name === 'update_todo') return 'Applying updates…';
  if (name === 'complete_todo') return args.isCompleted ? 'Marking complete…' : 'Reopening todo…';
  if (name === 'delete_todo') return 'Deleting todo…';
  if (name === 'add_tag_to_todo') return 'Adding tag…';
  if (name === 'remove_tag_from_todo') return 'Removing tag…';
  return name;
}

module.exports = {
  LOCATE_TOOLS,
  ACT_TOOLS,
  runLocateTool,
  runActTool,
  trailLabelForLocate,
  trailLabelForAct,
  previewActionFor,
  buildBreadcrumb,
};
