const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      default: '',
      sparse: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      default: 'Anonymous',
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
      maxLength: 160,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);