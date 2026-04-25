const tagService = require('../services/tagService');

exports.list = async (req, res) => {
  res.json(await tagService.listTags(req.user._id));
};

exports.create = async (req, res) => {
  const tag = await tagService.createTag(req.user._id, req.body || {});
  res.status(201).json(tag);
};

exports.remove = async (req, res) => {
  await tagService.deleteTag(req.user._id, req.params.id);
  res.status(204).end();
};
