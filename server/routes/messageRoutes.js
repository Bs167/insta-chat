const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// 1. Get conversation details (includes group admins and participants)
router.get('/details/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(404).json({ error: 'Invalid conversation ID' });
    }

    const conversation = await Conversation.findById(conversationId)
      .populate('participants', 'name username avatar clerkId bio')
      .populate('admins', 'name username avatar clerkId');

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get all conversations (both 1-on-1 and Groups) for a user
router.get('/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json([]);
    }

    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'name username avatar clerkId')
      .populate('admins', 'name username avatar clerkId')
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

// 4. Mark messages as seen
router.put('/mark-seen/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { readerId } = req.body;

    if (conversationId && readerId && mongoose.Types.ObjectId.isValid(conversationId)) {
      await Message.updateMany(
        { conversationId, sender: { $ne: readerId }, seen: false },
        { $set: { seen: true } }
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Send message (supports both 1-on-1 and Group chats)
router.post('/send', async (req, res) => {
  try {
    const { conversationId, senderId, recipientId, text, mediaUrl } = req.body;

    let conversation = null;

    if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
      conversation = await Conversation.findById(conversationId);
    }

    if (!conversation && senderId && recipientId) {
      conversation = await Conversation.findOne({
        isGroup: false,
        participants: { $all: [senderId, recipientId] },
      });

      if (!conversation) {
        conversation = await Conversation.create({
          participants: [senderId, recipientId],
          isGroup: false,
        });
      }
    }

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if group is restricted to admins only
    if (
      conversation.isGroup &&
      conversation.onlyAdminsCanMessage &&
      !conversation.admins.some((a) => String(a) === String(senderId))
    ) {
      return res.status(403).json({ error: 'Only admins can send messages in this group' });
    }

    const newMessage = await Message.create({
      conversationId: conversation._id,
      sender: senderId,
      recipient: conversation.isGroup ? null : recipientId || null,
      text: text || '',
      mediaUrl: mediaUrl || '',
      seen: false,
    });

    conversation.lastMessage = newMessage._id;
    await conversation.save();

    await newMessage.populate('sender', 'name username avatar clerkId');
    if (newMessage.recipient) {
      await newMessage.populate('recipient', 'name username avatar clerkId');
    }

    res.status(201).json({ message: newMessage, conversationId: conversation._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Create a new Group Chat
router.post('/group/create', async (req, res) => {
  try {
    const { groupName, groupDescription, groupAvatar, creatorId, memberIds } = req.body;

    if (!groupName || !creatorId || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: 'Group name and at least 1 member are required' });
    }

    const allParticipants = Array.from(new Set([creatorId, ...memberIds]));

    const group = await Conversation.create({
      isGroup: true,
      groupName: groupName.trim(),
      groupDescription: groupDescription || '',
      groupAvatar: groupAvatar || '',
      participants: allParticipants,
      admins: [creatorId],
    });

    // Create initial system greeting message
    const firstMsg = await Message.create({
      conversationId: group._id,
      sender: creatorId,
      text: `Created group "${groupName.trim()}"`,
    });

    group.lastMessage = firstMsg._id;
    await group.save();

    const populated = await Conversation.findById(group._id)
      .populate('participants', 'name username avatar clerkId')
      .populate('admins', 'name username avatar clerkId')
      .populate('lastMessage');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Update Group Info & Admin Settings (Name, Description, Avatar, OnlyAdminsCanMessage)
router.put('/group/:conversationId/settings', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, groupName, groupDescription, groupAvatar, onlyAdminsCanMessage } = req.body;

    const group = await Conversation.findById(conversationId);
    if (!group || !group.isGroup) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const isAdmin = group.admins.some((a) => String(a) === String(userId));
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only group admins can update group settings' });
    }

    if (groupName !== undefined) group.groupName = groupName;
    if (groupDescription !== undefined) group.groupDescription = groupDescription;
    if (groupAvatar !== undefined) group.groupAvatar = groupAvatar;
    if (onlyAdminsCanMessage !== undefined) group.onlyAdminsCanMessage = onlyAdminsCanMessage;

    await group.save();

    const updated = await Conversation.findById(conversationId)
      .populate('participants', 'name username avatar clerkId')
      .populate('admins', 'name username avatar clerkId');

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Manage Group Members (Add, Remove, Make Admin, or Leave Group)
router.put('/group/:conversationId/members', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { actorId, targetUserId, action } = req.body; // action: 'add' | 'remove' | 'make_admin' | 'leave'

    const group = await Conversation.findById(conversationId);
    if (!group || !group.isGroup) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const isAdmin = group.admins.some((a) => String(a) === String(actorId));

    if (action === 'leave') {
      group.participants = group.participants.filter((p) => String(p) !== String(actorId));
      group.admins = group.admins.filter((a) => String(a) !== String(actorId));
      // If no admins remain but members exist, promote the first member
      if (group.admins.length === 0 && group.participants.length > 0) {
        group.admins.push(group.participants[0]);
      }
    } else {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only admins can manage members' });
      }

      if (action === 'add') {
        if (!group.participants.some((p) => String(p) === String(targetUserId))) {
          group.participants.push(targetUserId);
        }
      } else if (action === 'remove') {
        group.participants = group.participants.filter((p) => String(p) !== String(targetUserId));
        group.admins = group.admins.filter((a) => String(a) !== String(targetUserId));
      } else if (action === 'make_admin') {
        if (!group.admins.some((a) => String(a) === String(targetUserId))) {
          group.admins.push(targetUserId);
        }
      }
    }

    await group.save();

    const updated = await Conversation.findById(conversationId)
      .populate('participants', 'name username avatar clerkId')
      .populate('admins', 'name username avatar clerkId');

    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;