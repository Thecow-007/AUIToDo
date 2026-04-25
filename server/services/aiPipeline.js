// Two-phase AI pipeline. Receives the user message + view context, runs a locate
// loop (vector_search / expand_todo until the model commits via confirm_target or
// respond_no_target), then runs a single act-tool call. SSE events fire as the
// model progresses so the frontend can render the search trail and the row-level
// preview-then-apply animation. Returns a structured "applied" payload that the
// client uses to push an entry onto its undo stack.

const Todo = require('../models/Todo');
const Tag = require('../models/Tag');

const cerebras = require('./cerebrasClient');
const aiTools = require('./aiTools');

const MAX_LOCATE_ITERS = 8;
const PREVIEW_HOLD_MS = 300;

function safeJSON(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

async function buildLocateSystemPrompt(userId, currentView) {
  const [roots, tags] = await Promise.all([
    Todo.find({ userId, parentId: null }).select('_id title tagIds').sort({ createdAt: 1 }),
    Tag.find({ userId }).select('_id label').sort({ label: 1 }),
  ]);
  const rootList = roots.map((r) => ({
    id: r._id.toString(),
    title: r.title,
    tagIds: (r.tagIds || []).map((t) => t.toString()),
  }));
  const tagList = tags.map((t) => ({ id: t._id.toString(), label: t.label }));

  return [
    'You are the locate phase of a todo assistant.',
    'Your job is to identify which existing todo the user is referring to, OR decide that they want a new todo created, OR decide they are just asking a question.',
    'Tools you may call: vector_search, expand_todo, confirm_target, respond_no_target.',
    'Always end with confirm_target (existing todo) or respond_no_target (new todo / question).',
    'When ambiguous, expand or search further — do not guess.',
    'Do NOT apply tags unless the user explicitly indicated something tag-worthy. Default behavior is no-tag.',
    '',
    `Current view: ${JSON.stringify(currentView || {})}`,
    `Root-level todos (${rootList.length}): ${JSON.stringify(rootList)}`,
    `Available tags: ${JSON.stringify(tagList)}`,
  ].join('\n');
}

async function buildActSystemPrompt(userId, locatedTodo) {
  const tags = await Tag.find({ userId }).select('_id label').sort({ label: 1 });
  const tagList = tags.map((t) => ({ id: t._id.toString(), label: t.label }));

  if (locatedTodo) {
    return [
      'You are the act phase of a todo assistant.',
      'Call exactly one action tool, then provide a one-sentence confirmation in natural language for the user.',
      'Only modify fields the user explicitly asked about.',
      'Do NOT apply tags unless the user explicitly indicated something tag-worthy.',
      '',
      `Target todo: ${JSON.stringify(locatedTodo)}`,
      `Available tags: ${JSON.stringify(tagList)}`,
    ].join('\n');
  }
  return [
    'You are the act phase of a todo assistant.',
    'No existing todo was located — the user wants a brand new todo created. Call create_todo.',
    'Provide a one-sentence confirmation after.',
    'Do NOT apply tags unless the user explicitly indicated something tag-worthy.',
    '',
    `Available tags: ${JSON.stringify(tagList)}`,
  ].join('\n');
}

async function runLocatePhase({ userId, message, history, currentView, sse }) {
  const systemPrompt = await buildLocateSystemPrompt(userId, currentView);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(history || []).filter((m) => m.role && m.content),
    { role: 'user', content: message },
  ];

  for (let iter = 0; iter < MAX_LOCATE_ITERS; iter++) {
    const reply = await cerebras.chat({
      messages,
      tools: aiTools.LOCATE_TOOLS,
      toolChoice: 'required',
    });

    const toolCalls = reply?.tool_calls || [];
    if (!toolCalls.length) {
      // Model gave up on tools — treat as no_action.
      return { reason: 'no_action', target: null, transcript: messages };
    }

    // Append the assistant message verbatim so subsequent calls have the tool_call ids in scope.
    messages.push({
      role: 'assistant',
      content: reply.content || '',
      tool_calls: toolCalls,
    });

    let terminal = null;
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      const args = safeJSON(tc.function?.arguments);
      sse.send('trail_step', { label: aiTools.trailLabelForLocate(name, args), toolName: name, args });

      if (name === 'confirm_target') {
        terminal = { reason: 'existing', targetId: args.id };
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: true }) });
        continue;
      }
      if (name === 'respond_no_target') {
        terminal = { reason: args.reason || 'create_new', targetId: null };
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: true }) });
        continue;
      }

      try {
        const result = await aiTools.runLocateTool(userId, name, args);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      } catch (err) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ error: err.message }) });
      }
    }

    if (terminal) {
      let target = null;
      if (terminal.reason === 'existing' && terminal.targetId) {
        const t = await Todo.findOne({ _id: terminal.targetId, userId });
        if (t) target = t.toClientJSON();
      }
      return { reason: terminal.reason, target, transcript: messages };
    }
  }
  return { reason: 'no_action', target: null, transcript: [] };
}

async function runActPhase({ userId, message, locatedTarget, sse }) {
  const systemPrompt = await buildActSystemPrompt(userId, locatedTarget);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ];

  const reply = await cerebras.chat({
    messages,
    tools: aiTools.ACT_TOOLS,
    toolChoice: 'required',
  });

  const toolCall = reply?.tool_calls?.[0];
  if (!toolCall) {
    sse.send('final', { message: reply?.content || 'I could not act on that.' });
    return;
  }

  const name = toolCall.function?.name;
  const args = safeJSON(toolCall.function?.arguments);
  sse.send('trail_step', { label: aiTools.trailLabelForAct(name, args), toolName: name, args });

  // Decide which row to flash for the preview state. For create_todo we don't have
  // an id yet (no row to flash); we still emit a generic preview the chatbar can show.
  const previewTodoId = locatedTarget?.id || null;
  const previewAction = aiTools.previewActionFor(name);
  if (previewTodoId) {
    sse.send('preview', { todoId: previewTodoId, action: previewAction });
  }
  await new Promise((r) => setTimeout(r, PREVIEW_HOLD_MS));

  let result;
  try {
    result = await aiTools.runActTool(userId, name, args, locatedTarget?.id || null);
  } catch (err) {
    sse.send('error', { message: err.message });
    return;
  }

  // Shape `applied` so the client can both refresh the UI and push the inverse on
  // its undo stack. Each branch carries the minimum the inverse needs.
  const applied = buildAppliedPayload(name, args, result, locatedTarget);
  sse.send('applied', applied);

  // Ask the model for a one-sentence natural-language confirmation. We give it the
  // tool result so its phrasing reflects what actually happened.
  messages.push({
    role: 'assistant',
    content: reply.content || '',
    tool_calls: reply.tool_calls,
  });
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify(summarizeResultForModel(name, result)),
  });
  const finalReply = await cerebras.chat({
    messages,
    tools: aiTools.ACT_TOOLS,
    toolChoice: 'none',
    temperature: 0.4,
  });
  sse.send('final', { message: (finalReply?.content || '').trim() || 'Done.' });
}

function buildAppliedPayload(toolName, args, result, locatedTarget) {
  if (toolName === 'create_todo') {
    return { mutation: 'create', todo: result };
  }
  if (toolName === 'update_todo') {
    return {
      mutation: 'update',
      todoId: result.todo.id,
      before: result.before,
      after: result.after,
      todo: result.todo,
    };
  }
  if (toolName === 'complete_todo') {
    return {
      mutation: 'complete',
      todoId: result.todo.id,
      isCompleted: !!args.isCompleted,
      affected: result.affected, // pre-images for cascade undo
      todo: result.todo,
    };
  }
  if (toolName === 'delete_todo') {
    return {
      mutation: 'delete',
      todoId: locatedTarget?.id,
      deletedIds: result.deletedIds,
      snapshot: result.snapshot, // feeds POST /api/todos/restore for undo
    };
  }
  if (toolName === 'add_tag_to_todo') {
    return { mutation: 'tag_add', todoId: result.todo.id, tagId: args.tagId, todo: result.todo };
  }
  if (toolName === 'remove_tag_from_todo') {
    return { mutation: 'tag_remove', todoId: result.todo.id, tagId: args.tagId, todo: result.todo };
  }
  return { mutation: toolName };
}

function summarizeResultForModel(toolName, result) {
  if (toolName === 'create_todo') return { ok: true, createdId: result.id, title: result.title };
  if (toolName === 'update_todo') return { ok: true, changed: Object.keys(result.after) };
  if (toolName === 'complete_todo') return { ok: true, affectedCount: result.affected.length };
  if (toolName === 'delete_todo') return { ok: true, deletedCount: result.deletedIds.length };
  if (toolName === 'add_tag_to_todo' || toolName === 'remove_tag_from_todo') {
    return { ok: true, changed: result.changed };
  }
  return { ok: true };
}

async function runPipeline({ userId, message, history, currentView, sse }) {
  try {
    const locate = await runLocatePhase({ userId, message, history, currentView, sse });

    if (locate.reason === 'no_action') {
      // Pure conversational answer — single non-tool call to summarize.
      const reply = await cerebras.chat({
        messages: [
          { role: 'system', content: 'You are AUIToDo, a helpful todo assistant. Answer in one or two sentences.' },
          ...(history || []).filter((m) => m.role && m.content),
          { role: 'user', content: message },
        ],
        tools: undefined,
        toolChoice: undefined,
        temperature: 0.4,
      });
      sse.send('final', { message: (reply?.content || '').trim() || 'Got it.' });
      return;
    }

    await runActPhase({
      userId,
      message,
      locatedTarget: locate.target,
      sse,
    });
  } catch (err) {
    console.error('[ai pipeline]', err);
    sse.send('error', { message: err.message || 'pipeline_failed' });
  } finally {
    sse.close();
  }
}

module.exports = { runPipeline };
