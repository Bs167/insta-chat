const express = require('express');
const router = express.Router();
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Get all conversations for a user
router.get('/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'name username avatar clerkId')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.status(200).json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a conversation (populates both sender and recipient)
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = await Message.find({ conversationId })
      .populate('sender', 'name username avatar clerkId')
      .populate('recipient', 'name username avatar clerkId')
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message
router.post('/send', async (req, res) => {
  try {
    const { senderId, recipientId, text, mediaUrl } = req.body;

    let conversation = await Conversation.findOne({
      participants: { $all: [senderId, recipientId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [senderId, recipientId],
      });
    }

    const newMessage = await Message.create({
      conversationId: conversation._id,
      sender: senderId,
      recipient: recipientId,
      text: text || '',
      mediaUrl: mediaUrl || '',
    });

    conversation.lastMessage = newMessage._id;
    await conversation.save();

    await newMessage.populate('sender', 'name username avatar clerkId');
    await newMessage.populate('recipient', 'name username avatar clerkId');

    res.status(201).json({ message: newMessage, conversationId: conversation._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;