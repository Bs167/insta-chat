const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  mediaUrl: {
    type: String,
    required: true,
  },
  caption: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // Automatically deleted by MongoDB after 24 hours
  },
});

module.exports = mongoose.model('Story', storySchema);