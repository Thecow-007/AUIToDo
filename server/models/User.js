const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

userSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    email: this.email,
    displayName: this.displayName,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
