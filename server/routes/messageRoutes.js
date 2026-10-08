const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

// Helper function to send push notifications via Expo service
const dispatchExpoPush = async (token, senderTitle, messageBody, extraData = {}) => {
  if (!token) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title: senderTitle,
        body: messageBody,
        data: extraData,
      }),
    });
  } catch (err) {
    console.error('Expo push dispatch failed:', err.message);
  }
};

// 1. Get conversation details (reliably returns otherUser & participants with clerkId)
router.get('/details/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(404).json({ error: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(conversationId).populate(
      'participants',
      'name username avatar clerkId'
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get all conversations for a user
router.get('/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json([]);
    }

    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'name username avatar clerkId')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.status(200).json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get messages for a specific conversation
router.get('/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(200).json([]);
    }

    const messages = await Message.find({ conversationId })
      .populate('sender', 'name username avatar clerkId')
      .populate('recipient', 'name username avatar clerkId')
      .sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Mark unread messages in conversation as seen (read receipt)
router.put('/mark-seen/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { readerId } = req.body;

    if (conversationId && readerId && mongoose.Types.ObjectId.isValid(conversationId)) {
      await Message.updateMany(
        { conversationId, recipient: readerId, seen: false },
        { $set: { seen: true } }
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Mark seen error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 5. Send message and dispatch notification
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
      seen: false,
    });

    conversation.lastMessage = newMessage._id;
    await conversation.save();

    await newMessage.populate('sender', 'name username avatar clerkId');
    await newMessage.populate('recipient', 'name username avatar clerkId');

    // Notify recipient's device if push token exists
    const recipientRecord = await User.findById(recipientId);
    if (recipientRecord?.pushToken) {
      const senderName = newMessage.sender?.name || 'Someone';
      const bodyPreview = text || 'Sent an image attachment';
      dispatchExpoPush(recipientRecord.pushToken, senderName, bodyPreview, {
        conversationId: conversation._id,
      });
    }

    res.status(201).json({ message: newMessage, conversationId: conversation._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;