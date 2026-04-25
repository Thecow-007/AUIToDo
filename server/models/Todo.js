const mongoose = require('mongoose');

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const todoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Todo', default: null },
    childIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Todo' }],

    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    dueAt: { type: Date, default: null },

    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },

    tagIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
    recurrenceRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecurrenceRule', default: null },

    // Vector for semantic search. Stored on the doc; indexed via Atlas Vector Search.
    // The index itself must be created in Atlas — see documentation/AtlasVectorSearch.md.
    embedding: { type: [Number], default: undefined, select: false },
  },
  { timestamps: true } // createdAt / updatedAt
);

// Indexes from spec §3
todoSchema.index({ userId: 1, parentId: 1 });
todoSchema.index({ userId: 1, isCompleted: 1, dueAt: 1 });
todoSchema.index({ userId: 1, priority: 1 });
// Text index used as the fallback when no embedding is available.
todoSchema.index({ title: 'text', description: 'text' });

todoSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    parentId: this.parentId ? this.parentId.toString() : null,
    childIds: (this.childIds || []).map((id) => id.toString()),
    title: this.title,
    description: this.description,
    priority: this.priority,
    dueAt: this.dueAt,
    isCompleted: this.isCompleted,
    completedAt: this.completedAt,
    tagIds: (this.tagIds || []).map((id) => id.toString()),
    recurrenceRuleId: this.recurrenceRuleId ? this.recurrenceRuleId.toString() : null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Todo', todoSchema);
module.exports.PRIORITIES = PRIORITIES;
