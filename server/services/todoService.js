// Todo domain operations. Controllers and the AI act phase share this module so
// every mutation goes through one set of invariants:
//   - parent.childIds stays in sync with child.parentId
//   - completion cascades down the subtree only on check (never on uncheck)
//   - delete returns a subtree snapshot that can recreate the exact same _ids
//   - update returns { before, after } over only the fields that actually changed
// Returning these "pre-image" payloads is what powers undo on the client.

const mongoose = require('mongoose');

const Todo = require('../models/Todo');
const Tag = require('../models/Tag');
const { HttpError } = require('../middleware/errorHandler');
const embeddings = require('./embeddings');

const { ObjectId } = mongoose.Types;

const PATCHABLE_FIELDS = ['title', 'description', 'priority', 'dueAt', 'tagIds', 'parentId'];

function asObjectId(value, label) {
  if (!value) throw new HttpError(400, `${label}_required`);
  if (value instanceof ObjectId) return value;
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, `${label}_invalid`);
  return new ObjectId(value);
}

async function ensureOwnedTodo(userId, id) {
  const todo = await Todo.findOne({ _id: asObjectId(id, 'todo_id'), userId });
  if (!todo) throw new HttpError(404, 'todo_not_found');
  return todo;
}

async function ensureOwnedTag(userId, id) {
  const tag = await Tag.findOne({ _id: asObjectId(id, 'tag_id'), userId });
  if (!tag) throw new HttpError(404, 'tag_not_found');
  return tag;
}

async function listTodos(userId, filters = {}) {
  const q = { userId };

  if (filters.parentId !== undefined) {
    q.parentId = filters.parentId === null || filters.parentId === 'null'
      ? null
      : asObjectId(filters.parentId, 'parent_id');
  }
  if (filters.tag) q.tagIds = asObjectId(filters.tag, 'tag');
  if (filters.status === 'active') q.isCompleted = false;
  else if (filters.status === 'completed') q.isCompleted = true;
  if (filters.dueFrom || filters.dueTo) {
    q.dueAt = {};
    if (filters.dueFrom) q.dueAt.$gte = new Date(filters.dueFrom);
    if (filters.dueTo) q.dueAt.$lte = new Date(filters.dueTo);
  }

  let cursor;
  if (filters.q && filters.q.trim()) {
    cursor = Todo.find({ ...q, $text: { $search: filters.q.trim() } });
  } else {
    cursor = Todo.find(q);
  }
  const docs = await cursor.sort({ createdAt: 1 });
  return docs.map((d) => d.toClientJSON());
}

async function getTodo(userId, id) {
  const todo = await ensureOwnedTodo(userId, id);
  return todo.toClientJSON();
}

async function getChildren(userId, id) {
  await ensureOwnedTodo(userId, id);
  const docs = await Todo.find({ userId, parentId: asObjectId(id, 'todo_id') }).sort({ createdAt: 1 });
  return docs.map((d) => d.toClientJSON());
}

async function createTodo(userId, input = {}) {
  const fields = {
    userId,
    title: (input.title || '').trim(),
    description: (input.description || '').trim(),
    priority: input.priority || 'medium',
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    parentId: null,
    tagIds: [],
  };
  if (!fields.title) throw new HttpError(400, 'title_required');
  if (!Todo.PRIORITIES.includes(fields.priority)) throw new HttpError(400, 'priority_invalid');

  if (input.parentId) {
    const parent = await ensureOwnedTodo(userId, input.parentId);
    fields.parentId = parent._id;
  }
  if (Array.isArray(input.tagIds) && input.tagIds.length) {
    const ids = input.tagIds.map((t) => asObjectId(t, 'tag_id'));
    const found = await Tag.countDocuments({ userId, _id: { $in: ids } });
    if (found !== ids.length) throw new HttpError(400, 'unknown_tag');
    fields.tagIds = ids;
  }

  const todo = await Todo.create(fields);

  if (todo.parentId) {
    await Todo.updateOne({ _id: todo.parentId, userId }, { $addToSet: { childIds: todo._id } });
  }

  embeddings.queueEmbedding(todo._id, todo.title, todo.description);

  return todo.toClientJSON();
}

// Returns { before, after, todo } where before/after only contain the fields that
// actually changed. The client uses this to push an inverse onto its undo stack.
async function updateTodo(userId, id, input = {}) {
  const todo = await ensureOwnedTodo(userId, id);

  const before = {};
  const after = {};
  let textChanged = false;

  let oldParentId = null;
  let newParentId;
  let parentChanged = false;

  for (const key of PATCHABLE_FIELDS) {
    if (!(key in input)) continue;
    let next = input[key];

    if (key === 'priority') {
      if (!Todo.PRIORITIES.includes(next)) throw new HttpError(400, 'priority_invalid');
    } else if (key === 'dueAt') {
      next = next === null || next === '' ? null : new Date(next);
    } else if (key === 'tagIds') {
      if (!Array.isArray(next)) throw new HttpError(400, 'tag_ids_invalid');
      const ids = next.map((t) => asObjectId(t, 'tag_id'));
      if (ids.length) {
        const found = await Tag.countDocuments({ userId, _id: { $in: ids } });
        if (found !== ids.length) throw new HttpError(400, 'unknown_tag');
      }
      next = ids;
    } else if (key === 'title') {
      next = (next || '').trim();
      if (!next) throw new HttpError(400, 'title_required');
    } else if (key === 'description') {
      next = (next || '').toString();
    } else if (key === 'parentId') {
      if (next === null || next === '' || next === undefined) {
        next = null;
      } else {
        const parentOid = asObjectId(next, 'parent_id');
        if (parentOid.equals(todo._id)) throw new HttpError(400, 'parent_self');
        // Walk up the new parent's chain — if we hit todo._id, this would create a cycle.
        const newParent = await Todo.findOne({ _id: parentOid, userId });
        if (!newParent) throw new HttpError(400, 'parent_not_found');
        let cursor = newParent;
        const visited = new Set([cursor._id.toString()]);
        while (cursor.parentId) {
          if (cursor.parentId.equals(todo._id)) throw new HttpError(400, 'parent_circular');
          const key2 = cursor.parentId.toString();
          if (visited.has(key2)) break; // defensive against pre-existing cycle
          visited.add(key2);
          cursor = await Todo.findOne({ _id: cursor.parentId, userId });
          if (!cursor) break;
        }
        next = parentOid;
      }
    }

    const prev = todo[key];
    if (!equalish(prev, next)) {
      before[key] = serialize(prev);
      after[key] = serialize(next);
      if (key === 'parentId') {
        oldParentId = prev || null;
        newParentId = next;
        parentChanged = true;
      } else {
        todo[key] = next;
      }
      if (key === 'title' || key === 'description') textChanged = true;
    }
  }

  if (Object.keys(after).length === 0) {
    return { before: {}, after: {}, todo: todo.toClientJSON() };
  }

  if (parentChanged) {
    todo.parentId = newParentId;
    if (oldParentId) {
      await Todo.updateOne({ _id: oldParentId, userId }, { $pull: { childIds: todo._id } });
    }
    if (newParentId) {
      await Todo.updateOne({ _id: newParentId, userId }, { $addToSet: { childIds: todo._id } });
    }
  }

  await todo.save();

  if (textChanged) {
    embeddings.queueEmbedding(todo._id, todo.title, todo.description);
  }

  return { before, after, todo: todo.toClientJSON() };
}

// Toggle completion. When `isCompleted` is true the cascade marks every descendant
// complete; when false only the row itself flips (per spec §3 asymmetry). Returns
// `affected: [{ todoId, prevIsCompleted, prevCompletedAt }]` for every row that
// actually changed — that's the undo payload.
async function completeTodo(userId, id, isCompleted) {
  const todo = await ensureOwnedTodo(userId, id);
  const now = new Date();
  const affected = [];

  const apply = async (doc) => {
    affected.push({
      todoId: doc._id.toString(),
      prevIsCompleted: doc.isCompleted,
      prevCompletedAt: doc.completedAt,
    });
    doc.isCompleted = isCompleted;
    doc.completedAt = isCompleted ? now : null;
    await doc.save();
  };

  if (isCompleted) {
    // Walk the subtree, only marking rows that actually need to flip.
    const stack = [todo];
    const visited = new Set();
    while (stack.length) {
      const node = stack.pop();
      const key = node._id.toString();
      if (visited.has(key)) continue;
      visited.add(key);

      if (!node.isCompleted) await apply(node);

      if (node.childIds && node.childIds.length) {
        const children = await Todo.find({ userId, _id: { $in: node.childIds } });
        for (const child of children) stack.push(child);
      }
    }
  } else if (todo.isCompleted) {
    await apply(todo);
  }

  const updated = await Todo.findById(todo._id);
  return { todo: updated.toClientJSON(), affected };
}

// Delete a todo and its descendants. Returns a snapshot that `restoreTodo` can
// re-hydrate into the exact same _ids and parent linkage.
async function deleteTodo(userId, id) {
  const root = await ensureOwnedTodo(userId, id);
  const docs = [];
  const stack = [root];
  const visited = new Set();
  while (stack.length) {
    const node = stack.pop();
    const key = node._id.toString();
    if (visited.has(key)) continue;
    visited.add(key);
    docs.push(node);
    if (node.childIds && node.childIds.length) {
      const children = await Todo.find({ userId, _id: { $in: node.childIds } });
      for (const child of children) stack.push(child);
    }
  }

  const ids = docs.map((d) => d._id);
  const snapshot = {
    parentId: root.parentId ? root.parentId.toString() : null,
    docs: docs.map((d) => d.toObject()),
  };

  if (root.parentId) {
    await Todo.updateOne(
      { _id: root.parentId, userId },
      { $pull: { childIds: root._id } }
    );
  }
  await Todo.deleteMany({ _id: { $in: ids }, userId });

  return { snapshot, deletedIds: ids.map((i) => i.toString()) };
}

// Restore a subtree from a snapshot returned by `deleteTodo`. Re-creates docs with
// their original _ids and re-links the root to its prior parent if that parent is
// still alive (otherwise the root becomes a top-level todo).
async function restoreTodo(userId, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.docs) || !snapshot.docs.length) {
    throw new HttpError(400, 'invalid_snapshot');
  }
  // Defensive ownership check — the snapshot rides through the client so trust nothing.
  for (const d of snapshot.docs) {
    if (d.userId.toString() !== userId.toString()) throw new HttpError(403, 'snapshot_not_owned');
  }

  const docs = snapshot.docs.map((d) => ({
    ...d,
    _id: asObjectId(d._id, 'doc_id'),
    userId,
    parentId: d.parentId ? asObjectId(d.parentId, 'parent_id') : null,
    childIds: (d.childIds || []).map((c) => asObjectId(c, 'child_id')),
    tagIds: (d.tagIds || []).map((t) => asObjectId(t, 'tag_id')),
  }));

  const rootId = docs[0]._id;
  const rootParentId = docs[0].parentId;

  await Todo.insertMany(docs);

  if (rootParentId) {
    const parent = await Todo.findOne({ _id: rootParentId, userId });
    if (parent) {
      await Todo.updateOne(
        { _id: rootParentId, userId },
        { $addToSet: { childIds: rootId } }
      );
    } else {
      // Parent no longer exists — promote root.
      await Todo.updateOne({ _id: rootId, userId }, { $set: { parentId: null } });
    }
  }

  const restored = await Todo.find({ _id: { $in: docs.map((d) => d._id) }, userId });
  return restored.map((d) => d.toClientJSON());
}

async function addTagToTodo(userId, todoId, tagId) {
  const todo = await ensureOwnedTodo(userId, todoId);
  await ensureOwnedTag(userId, tagId);
  const tagOid = asObjectId(tagId, 'tag_id');
  if (todo.tagIds.some((t) => t.equals(tagOid))) {
    return { todo: todo.toClientJSON(), changed: false };
  }
  todo.tagIds.push(tagOid);
  await todo.save();
  return { todo: todo.toClientJSON(), changed: true };
}

async function removeTagFromTodo(userId, todoId, tagId) {
  const todo = await ensureOwnedTodo(userId, todoId);
  const tagOid = asObjectId(tagId, 'tag_id');
  const idx = todo.tagIds.findIndex((t) => t.equals(tagOid));
  if (idx === -1) return { todo: todo.toClientJSON(), changed: false };
  todo.tagIds.splice(idx, 1);
  await todo.save();
  return { todo: todo.toClientJSON(), changed: true };
}

// --- helpers ---

function equalish(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date && typeof b === 'string') return a.getTime() === new Date(b).getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => String(v) === String(b[i]));
  }
  return false;
}

function serialize(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => (v && v.toString ? v.toString() : v));
  return value;
}

module.exports = {
  listTodos,
  getTodo,
  getChildren,
  createTodo,
  updateTodo,
  completeTodo,
  deleteTodo,
  restoreTodo,
  addTagToTodo,
  removeTagFromTodo,
};
