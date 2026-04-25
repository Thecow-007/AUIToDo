// Two-phase AI pipeline. Receives the user message + view context, runs a locate
// loop (vector_search / expand_todo until the model commits via confirm_targets
// (one or many ids) or respond_no_target), then runs a single bulk act-tool call.
// SSE events fire as the model progresses so the frontend can render the search
// trail and the row-level preview-then-apply animation across every located row.
// Returns a structured "applied" payload that the client uses to push an entry
// onto its undo stack.

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
    'Your job is to identify which existing todo(s) the user is referring to, OR decide that they want a new todo created, OR decide they are just asking a question.',
    'Tools you may call: vector_search, expand_todo, confirm_targets, respond_no_target.',
    'Always end with confirm_targets (one or more existing todos + intent) or respond_no_target (new top-level todo / question).',
    'Return MULTIPLE ids in confirm_targets only when the user clearly addresses a set — "all important tasks", "every writing subtask", "the items tagged X". For ambiguous singular references, drill down further; do not guess a set.',
    'When ambiguous, expand or search further — do not guess.',
    'Do NOT apply tags unless the user explicitly indicated something tag-worthy. Default behavior is no-tag.',
    '',
    `Current view: ${JSON.stringify(currentView || {})}`,
    `Root-level todos (${rootList.length}): ${JSON.stringify(rootList)}`,
    `Available tags: ${JSON.stringify(tagList)}`,
  ].join('\n');
}

async function buildActSystemPrompt(userId, locatedTargets, intent) {
  const tags = await Tag.find({ userId }).select('_id label').sort({ label: 1 });
  const tagList = tags.map((t) => ({ id: t._id.toString(), label: t.label }));

  if (locatedTargets && locatedTargets.length) {
    return [
      'You are the act phase of a todo assistant.',
      'Call exactly one action tool, then provide a one-sentence confirmation in natural language for the user.',
      'You MAY operate on one or many of the located targets in a single tool call (the bulk tools accept arrays).',
      'Apply the action to ALL located targets unless the user clearly only wants a subset.',
      'Only modify fields the user explicitly asked about.',
      'Do NOT apply tags unless the user explicitly indicated something tag-worthy.',
      'If intent is create_child, call create_todos with each new todo\'s parentId set to the appropriate located target id.',
      '',
      `Predicted intent (from locate phase): ${intent || 'unknown'}`,
      `Target todos (${locatedTargets.length}): ${JSON.stringify(locatedTargets)}`,
      `Available tags: ${JSON.stringify(tagList)}`,
    ].join('\n');
  }
  return [
    'You are the act phase of a todo assistant.',
    'No existing todo was located — the user wants brand new todo(s) created. Call create_todos with one or more entries.',
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
      return { reason: 'no_action', targets: [], intent: null, transcript: messages };
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

      if (name === 'confirm_targets') {
        const ids = Array.isArray(args.ids)
          ? args.ids.filter((x) => typeof x === 'string' && x)
          : [];
        terminal = { reason: 'existing', targetIds: ids, intent: args.intent || null };
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: true }) });
        continue;
      }
      if (name === 'respond_no_target') {
        terminal = { reason: args.reason || 'create_new', targetIds: [], intent: null };
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
      let targets = [];
      if (terminal.reason === 'existing' && terminal.targetIds.length) {
        const docs = await Todo.find({ _id: { $in: terminal.targetIds }, userId });
        const byId = new Map(docs.map((d) => [d._id.toString(), d]));
        // Preserve the order the model specified, drop unknowns silently.
        targets = terminal.targetIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((d) => d.toClientJSON());
      }
      return { reason: terminal.reason, targets, intent: terminal.intent, transcript: messages };
    }
  }
  return { reason: 'no_action', targets: [], intent: null, transcript: [] };
}

async function runActPhase({ userId, message, locatedTargets, intent, sse }) {
  const systemPrompt = await buildActSystemPrompt(userId, locatedTargets, intent);
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

  // Flash a preview on each located row. `create_todos` has no pre-existing rows
  // when there are no targets — the chatbar shows the create through the trail only.
  const previewIds = (locatedTargets || []).map((t) => t.id);
  const previewAction = aiTools.previewActionFor(name);
  for (const id of previewIds) {
    sse.send('preview', { todoId: id, action: previewAction });
  }
  await new Promise((r) => setTimeout(r, PREVIEW_HOLD_MS));

  let result;
  try {
    result = await aiTools.runActTool(userId, name, args);
  } catch (err) {
    sse.send('error', { message: err.message });
    return;
  }

  // Shape `applied` so the client can both refresh the UI and push the inverse on
  // its undo stack. Each branch carries the minimum the inverse needs.
  const applied = buildAppliedPayload(name, args, result, locatedTargets);
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

function buildAppliedPayload(toolName, args, result, locatedTargets) {
  if (toolName === 'create_todos') {
    return {
      mutation: 'create',
      todoIds: result.todos.map((t) => t.id),
      todos: result.todos,
    };
  }
  if (toolName === 'update_todos') {
    return {
      mutation: 'update',
      todoIds: result.results.map((r) => r.id),
      results: result.results, // each entry: { id, before, after, todo } — feeds undo
    };
  }
  if (toolName === 'complete_todos') {
    return {
      mutation: 'complete',
      todoIds: result.results.map((r) => r.id),
      isCompleted: !!result.isCompleted,
      results: result.results, // each entry includes affected[] for cascade undo
    };
  }
  if (toolName === 'delete_todos') {
    const todoIds = (locatedTargets || []).map((t) => t.id);
    const deletedIds = result.results.flatMap((r) => r.deletedIds);
    return {
      mutation: 'delete',
      todoIds,
      deletedIds,
      results: result.results, // each entry carries a snapshot for POST /api/todos/restore
    };
  }
  if (toolName === 'add_tag_to_todos') {
    return {
      mutation: 'tag_add',
      todoIds: result.results.map((r) => r.id),
      tagId: args.tagId,
      results: result.results,
    };
  }
  if (toolName === 'remove_tag_from_todos') {
    return {
      mutation: 'tag_remove',
      todoIds: result.results.map((r) => r.id),
      tagId: args.tagId,
      results: result.results,
    };
  }
  return { mutation: toolName };
}

function summarizeResultForModel(toolName, result) {
  if (toolName === 'create_todos') {
    return { ok: true, count: result.todos.length, ids: result.todos.map((t) => t.id) };
  }
  if (toolName === 'update_todos') {
    return { ok: true, count: result.results.length };
  }
  if (toolName === 'complete_todos') {
    const cascadeAffected = result.results.reduce((acc, r) => acc + (r.affected?.length || 0), 0);
    return { ok: true, count: result.results.length, cascadeAffected };
  }
  if (toolName === 'delete_todos') {
    const deletedCount = result.results.reduce((acc, r) => acc + r.deletedIds.length, 0);
    return { ok: true, count: result.results.length, deletedCount };
  }
  if (toolName === 'add_tag_to_todos' || toolName === 'remove_tag_from_todos') {
    return { ok: true, count: result.results.length };
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
      locatedTargets: locate.targets || [],
      intent: locate.intent || null,
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
