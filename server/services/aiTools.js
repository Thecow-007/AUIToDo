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
      name: 'confirm_targets',
      description: 'End the locate phase by selecting one or more existing todos as targets. Return multiple ids ONLY when the user clearly addresses a set (e.g. "delete all important tasks", "complete all writing subtasks"). For ambiguous singular references, keep drilling instead of guessing a set.',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'ObjectIds of the located todos.',
          },
          intent: {
            type: 'string',
            enum: ['delete', 'update', 'complete', 'tag', 'create_child', 'recurrence'],
            description: 'The action you intend the act phase to perform on these targets.',
          },
          reasoning: { type: 'string', description: 'One-sentence justification visible in the search trail.' },
        },
        required: ['ids', 'intent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'respond_no_target',
      description: 'End the locate phase when the user wants to create a brand-new top-level todo (no existing target). Also use when the user is asking a question rather than an action.',
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

  // confirm_targets / respond_no_target are terminal — handled by the pipeline loop.
  throw new HttpError(500, `unhandled_locate_tool:${name}`);
}

function trailLabelForLocate(name, args) {
  if (name === 'vector_search') return `Searching todos for "${args.query}"…`;
  if (name === 'expand_todo') return `Expanding todo ${args.id?.slice(-6)}…`;
  if (name === 'confirm_targets') {
    const n = Array.isArray(args.ids) ? args.ids.length : 0;
    return n > 1 ? `Targeting ${n} todos.` : 'Target confirmed.';
  }
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
      name: 'create_todos',
      description: 'Create one or more todos. Each entry may specify parentId, so a single call can create a parent plus subtasks atomically. Use this when no existing target was located, OR when intent is create_child (located targets become parents).',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            minItems: 1,
            items: {
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
        required: ['todos'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_todos',
      description: 'Apply per-todo field patches to one or more located todos. Each patch specifies the todo id and the fields to change. Only include fields the user actually asked to change.',
      parameters: {
        type: 'object',
        properties: {
          patches: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'ObjectId of the located todo to update.' },
                fields: {
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
              required: ['id', 'fields'],
            },
          },
        },
        required: ['patches'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_todos',
      description: 'Set isCompleted on one or more located todos. Completing a parent cascades to all descendants; un-completing does not.',
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          isCompleted: { type: 'boolean' },
        },
        required: ['ids', 'isCompleted'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_todos',
      description: 'Delete one or more located todos and all of their descendants.',
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
        required: ['ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_tag_to_todos',
      description: 'Add a tag to one or more located todos by tagId.',
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          tagId: { type: 'string' },
        },
        required: ['ids', 'tagId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_tag_from_todos',
      description: 'Remove a tag from one or more located todos by tagId.',
      parameters: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
          tagId: { type: 'string' },
        },
        required: ['ids', 'tagId'],
      },
    },
  },
];

function previewActionFor(toolName) {
  if (toolName === 'create_todos') return 'create';
  if (toolName === 'delete_todos') return 'delete';
  return 'update'; // update / complete / tag ops all use the yellow preview
}

async function runActTool(userId, name, args) {
  if (name === 'create_todos') {
    const inputs = Array.isArray(args.todos) ? args.todos : [];
    if (!inputs.length) throw new HttpError(400, 'create_empty');
    const todos = [];
    for (const input of inputs) {
      todos.push(await todoService.createTodo(userId, input));
    }
    return { todos };
  }
  if (name === 'update_todos') {
    const patches = Array.isArray(args.patches) ? args.patches : [];
    if (!patches.length) throw new HttpError(400, 'update_empty');
    const results = [];
    for (const p of patches) {
      if (!p || !p.id) throw new HttpError(400, 'patch_id_required');
      const r = await todoService.updateTodo(userId, p.id, p.fields || {});
      results.push({ id: p.id, before: r.before, after: r.after, todo: r.todo });
    }
    return { results };
  }
  if (name === 'complete_todos') {
    const ids = Array.isArray(args.ids) ? args.ids : [];
    if (!ids.length) throw new HttpError(400, 'complete_empty');
    const results = [];
    for (const id of ids) {
      const r = await todoService.completeTodo(userId, id, !!args.isCompleted);
      results.push({ id, todo: r.todo, affected: r.affected });
    }
    return { results, isCompleted: !!args.isCompleted };
  }
  if (name === 'delete_todos') {
    const ids = Array.isArray(args.ids) ? args.ids : [];
    if (!ids.length) throw new HttpError(400, 'delete_empty');
    const results = [];
    const alreadyDeleted = new Set();
    for (const id of ids) {
      // If a previous delete cascaded over this id, skip — avoids 404s when the
      // model includes both a parent and one of its descendants in `ids`.
      if (alreadyDeleted.has(id)) continue;
      try {
        const r = await todoService.deleteTodo(userId, id);
        for (const did of r.deletedIds) alreadyDeleted.add(did);
        results.push({ id, snapshot: r.snapshot, deletedIds: r.deletedIds });
      } catch (err) {
        if (err && err.status === 404) continue;
        throw err;
      }
    }
    return { results };
  }
  if (name === 'add_tag_to_todos') {
    const ids = Array.isArray(args.ids) ? args.ids : [];
    if (!ids.length) throw new HttpError(400, 'tag_empty');
    if (!args.tagId) throw new HttpError(400, 'tag_id_required');
    const results = [];
    for (const id of ids) {
      const r = await todoService.addTagToTodo(userId, id, args.tagId);
      results.push({ id, todo: r.todo, changed: r.changed });
    }
    return { results, tagId: args.tagId };
  }
  if (name === 'remove_tag_from_todos') {
    const ids = Array.isArray(args.ids) ? args.ids : [];
    if (!ids.length) throw new HttpError(400, 'tag_empty');
    if (!args.tagId) throw new HttpError(400, 'tag_id_required');
    const results = [];
    for (const id of ids) {
      const r = await todoService.removeTagFromTodo(userId, id, args.tagId);
      results.push({ id, todo: r.todo, changed: r.changed });
    }
    return { results, tagId: args.tagId };
  }
  throw new HttpError(500, `unhandled_act_tool:${name}`);
}

function trailLabelForAct(name, args) {
  if (name === 'create_todos') {
    const todos = Array.isArray(args.todos) ? args.todos : [];
    if (todos.length > 1) return `Creating ${todos.length} todos…`;
    return `Creating "${todos[0]?.title || ''}"…`;
  }
  if (name === 'update_todos') {
    const n = Array.isArray(args.patches) ? args.patches.length : 0;
    return n > 1 ? `Applying updates to ${n} todos…` : 'Applying updates…';
  }
  if (name === 'complete_todos') {
    const n = Array.isArray(args.ids) ? args.ids.length : 0;
    const verb = args.isCompleted ? 'Marking complete' : 'Reopening';
    return n > 1 ? `${verb} ${n} todos…` : `${verb}…`;
  }
  if (name === 'delete_todos') {
    const n = Array.isArray(args.ids) ? args.ids.length : 0;
    return n > 1 ? `Deleting ${n} todos…` : 'Deleting todo…';
  }
  if (name === 'add_tag_to_todos') {
    const n = Array.isArray(args.ids) ? args.ids.length : 0;
    return n > 1 ? `Adding tag to ${n} todos…` : 'Adding tag…';
  }
  if (name === 'remove_tag_from_todos') {
    const n = Array.isArray(args.ids) ? args.ids.length : 0;
    return n > 1 ? `Removing tag from ${n} todos…` : 'Removing tag…';
  }
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
