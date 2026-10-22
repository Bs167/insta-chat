const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// 1. Find or create a 1-on-1 conversation
router.post('/conversation', async (req, res) => {
  try {
    const { senderId, receiverId, userId1, userId2, participants } = req.body;
    const p1 = senderId || userId1 || (participants && participants[0]);
    const p2 = receiverId || userId2 || (participants && participants[1]);

    if (!p1 || !p2) {
      return res.status(400).json({ error: 'Both participant IDs are required' });
    }

    let conv = await Conversation.findOne({
      isGroup: { $ne: true },
      participants: { $all: [p1, p2], $size: 2 },
    }).populate('participants', 'name username avatar bio clerkId email');

    if (!conv) {
      conv = new Conversation({
        isGroup: false,
        participants: [p1, p2],
      });
      await conv.save();
      conv = await Conversation.findById(conv._id).populate(
        'participants',
        'name username avatar bio clerkId email'
      );
    }

    res.json(conv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Fetch single conversation metadata & participants
router.get('/details/:conversationId', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.conversationId)
      .populate('participants', 'name username avatar bio clerkId email')
      .populate('admins', 'name username avatar');
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json(conv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Fetch all conversations (1-on-1 and Groups) for a user
router.get('/conversations/:userId', async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.params.userId,
    })
      .populate('participants', 'name username avatar clerkId email')
      .populate('admins', 'name username')
      .populate('lastMessage.sender', 'name username')
      .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Fetch all messages in a conversation
router.get('/:conversationId', async (req, res) => {
  try {
    const messages = await Message.find({
      conversationId: req.params.conversationId,
    })
      .populate('sender', 'name username avatar clerkId')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'name username' },
      })
      .populate('reactions.user', 'name username avatar')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Mark messages in a conversation as seen
router.put('/mark-seen/:conversationId', async (req, res) => {
  try {
    const { userId } = req.body;
    await Message.updateMany(
      {
        conversationId: req.params.conversationId,
        sender: { $ne: userId },
        seen: false,
      },
      { $set: { seen: true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Send a message (Text, Photo, Video, or Voice Note + Optional Reply)
router.post('/send', async (req, res) => {
  try {
    const { conversationId, sender, recipient, text, mediaUrl, mediaType, replyTo } = req.body;

    const conv = await Conversation.findById(conversationId);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conv.isGroup && conv.onlyAdminsCanMessage) {
      const isAdmin = conv.admins.some((a) => a.toString() === sender.toString());
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only admins can send messages in this group' });
      }
    }

    const resolvedMediaType = mediaType || (mediaUrl ? 'image' : 'none');

    const message = new Message({
      conversationId,
      sender,
      recipient: conv.isGroup ? null : recipient,
      text: text || '',
      mediaUrl: mediaUrl || '',
      mediaType: resolvedMediaType,
      replyTo: replyTo || null,
      seen: false,
    });
    await message.save();

    let previewText = text;
    if (!previewText) {
      if (resolvedMediaType === 'video') previewText = '🎥 Video';
      else if (resolvedMediaType === 'audio') previewText = '🎤 Voice Note';
      else if (mediaUrl) previewText = '📷 Photo';
    }

    conv.lastMessage = {
      text: previewText || '',
      sender,
      createdAt: new Date(),
    };
    await conv.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name username avatar clerkId')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'name username' },
      });

    res.status(201).json(populatedMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Delete message for everyone (Unsend)
router.put('/delete/:messageId', async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    message.isDeleted = true;
    message.text = '🚫 This message was deleted';
    message.mediaUrl = '';
    message.mediaType = 'none';
    message.reactions = [];
    await message.save();

    const updated = await Message.findById(message._id)
      .populate('sender', 'name username avatar clerkId')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'name username' },
      });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Toggle or update an emoji reaction on a message
router.put('/react/:messageId', async (req, res) => {
  try {
    const { userId, emoji } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ error: 'Message not available' });
    }

    const existingIdx = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString()
    );

    if (existingIdx > -1) {
      if (message.reactions[existingIdx].emoji === emoji) {
        message.reactions.splice(existingIdx, 1);
      } else {
        message.reactions[existingIdx].emoji = emoji;
      }
    } else {
      message.reactions.push({ user: userId, emoji });
    }

    await message.save();

    const updated = await Message.findById(message._id)
      .populate('sender', 'name username avatar clerkId')
      .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'name username' },
      })
      .populate('reactions.user', 'name username avatar');

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Create Group Conversation
router.post('/group/create', async (req, res) => {
  try {
    const { creatorId, participantIds, groupName, groupDescription, groupAvatar } = req.body;
    const allMembers = Array.from(new Set([creatorId, ...(participantIds || [])]));

    const groupConv = new Conversation({
      isGroup: true,
      groupName: groupName.trim(),
      groupDescription: (groupDescription || '').trim(),
      groupAvatar: groupAvatar || '',
      participants: allMembers,
      admins: [creatorId],
      onlyAdminsCanMessage: false,
    });

    await groupConv.save();

    const populated = await Conversation.findById(groupConv._id)
      .populate('participants', 'name username avatar clerkId email')
      .populate('admins', 'name username');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Update group settings (Admin only)
router.put('/group/:conversationId/settings', async (req, res) => {
  try {
    const { userId, onlyAdminsCanMessage, groupName, groupDescription } = req.body;
    const conv = await Conversation.findById(req.params.conversationId);
    if (!conv || !conv.isGroup) {
      return res.status(404).json({ error: 'Group conversation not found' });
    }

    const isAdmin = conv.admins.some((a) => a.toString() === userId.toString());
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only admins can modify group settings' });
    }

    if (onlyAdminsCanMessage !== undefined) conv.onlyAdminsCanMessage = onlyAdminsCanMessage;
    if (groupName !== undefined) conv.groupName = groupName.trim();
    if (groupDescription !== undefined) conv.groupDescription = groupDescription.trim();

    await conv.save();

    const populated = await Conversation.findById(conv._id)
      .populate('participants', 'name username avatar clerkId email')
      .populate('admins', 'name username avatar');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Add/remove group members, promote admins, or leave group
router.put('/group/:conversationId/members', async (req, res) => {
  try {
    const { userId, action, targetUserId, targetUserIds } = req.body;
    const conv = await Conversation.findById(req.params.conversationId);
    if (!conv || !conv.isGroup) {
      return res.status(404).json({ error: 'Group conversation not found' });
    }

    const isAdmin = conv.admins.some((a) => a.toString() === userId.toString());

    if (action === 'leave') {
      conv.participants = conv.participants.filter((p) => p.toString() !== userId.toString());
      conv.admins = conv.admins.filter((a) => a.toString() !== userId.toString());
      if (conv.admins.length === 0 && conv.participants.length > 0) {
        conv.admins.push(conv.participants[0]);
      }
    } else if (action === 'add') {
      if (!isAdmin) return res.status(403).json({ error: 'Only admins can add members' });
      const idsToAdd = Array.isArray(targetUserIds)
        ? targetUserIds
        : targetUserId
        ? [targetUserId]
        : [];

      idsToAdd.forEach((id) => {
        if (!conv.participants.some((p) => p.toString() === id.toString())) {
          conv.participants.push(id);
        }
      });
    } else if (action === 'remove') {
      if (!isAdmin) return res.status(403).json({ error: 'Only admins can remove members' });
      conv.participants = conv.participants.filter((p) => p.toString() !== targetUserId.toString());
      conv.admins = conv.admins.filter((a) => a.toString() !== targetUserId.toString());
    } else if (action === 'make_admin') {
      if (!isAdmin) return res.status(403).json({ error: 'Only admins can promote members' });
      if (!conv.admins.some((a) => a.toString() === targetUserId.toString())) {
        conv.admins.push(targetUserId);
      }
    }

    await conv.save();

    const populated = await Conversation.findById(conv._id)
      .populate('participants', 'name username avatar clerkId email')
      .populate('admins', 'name username avatar');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;