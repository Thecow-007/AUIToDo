const mongoose = require('mongoose');

const Tag = require('../models/Tag');
const Todo = require('../models/Todo');
const { HttpError } = require('../middleware/errorHandler');

const HEX_RE = /^#?[0-9a-fA-F]{3,8}$/;

function asObjectId(value, label) {
  if (!value) throw new HttpError(400, `${label}_required`);
  if (!mongoose.isValidObjectId(value)) throw new HttpError(400, `${label}_invalid`);
  return new mongoose.Types.ObjectId(value);
}

async function listTags(userId) {
  const tags = await Tag.find({ userId }).sort({ label: 1 });
  return tags.map((t) => t.toClientJSON());
}

async function createTag(userId, { label, color }) {
  const trimmed = (label || '').trim();
  if (!trimmed) throw new HttpError(400, 'label_required');
  if (!color || !HEX_RE.test(color)) throw new HttpError(400, 'color_invalid');

  const exists = await Tag.findOne({ userId, label: trimmed });
  if (exists) throw new HttpError(409, 'tag_label_taken');

  const tag = await Tag.create({ userId, label: trimmed, color });
  return tag.toClientJSON();
}

async function deleteTag(userId, id) {
  const tagId = asObjectId(id, 'tag_id');
  const tag = await Tag.findOne({ _id: tagId, userId });
  if (!tag) throw new HttpError(404, 'tag_not_found');

  // Removing the tag also drops it from any todo that referenced it.
  await Todo.updateMany({ userId, tagIds: tagId }, { $pull: { tagIds: tagId } });
  await Tag.deleteOne({ _id: tagId, userId });
}

module.exports = { listTags, createTag, deleteTag };
