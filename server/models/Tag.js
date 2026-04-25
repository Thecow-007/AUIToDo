const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  label: { type: String, required: true, trim: true },
  color: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

tagSchema.index({ userId: 1, label: 1 }, { unique: true });

tagSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    label: this.label,
    color: this.color,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Tag', tagSchema);
