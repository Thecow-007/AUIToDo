const todoService = require('../services/todoService');
const { HttpError } = require('../middleware/errorHandler');

exports.list = async (req, res) => {
  const { parentId, tag, status, dueFrom, dueTo, q } = req.query;
  const todos = await todoService.listTodos(req.user._id, {
    parentId, tag, status, dueFrom, dueTo, q,
  });
  res.json(todos);
};

exports.getOne = async (req, res) => {
  const todo = await todoService.getTodo(req.user._id, req.params.id);
  res.json(todo);
};

exports.children = async (req, res) => {
  const items = await todoService.getChildren(req.user._id, req.params.id);
  res.json(items);
};

exports.create = async (req, res) => {
  const todo = await todoService.createTodo(req.user._id, req.body);
  res.status(201).json(todo);
};

exports.patch = async (req, res) => {
  if (!req.body || typeof req.body !== 'object') throw new HttpError(400, 'body_required');
  const result = await todoService.updateTodo(req.user._id, req.params.id, req.body);
  res.json(result);
};

exports.remove = async (req, res) => {
  const { snapshot, deletedIds } = await todoService.deleteTodo(req.user._id, req.params.id);
  res.json({ snapshot, deletedIds });
};

exports.complete = async (req, res) => {
  const { isCompleted } = req.body || {};
  if (typeof isCompleted !== 'boolean') throw new HttpError(400, 'is_completed_required');
  const result = await todoService.completeTodo(req.user._id, req.params.id, isCompleted);
  res.json(result);
};

exports.restore = async (req, res) => {
  const restored = await todoService.restoreTodo(req.user._id, req.body?.snapshot);
  res.status(201).json(restored);
};
