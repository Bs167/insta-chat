const express = require('express');
const router = express.Router();
const User = require('../models/User');

// 1. Auto-sync endpoint with upsert
router.post('/sync', async (req, res) => {
  try {
    const { clerkId, email, name, username, avatar } = req.body;

    if (!clerkId) {
      return res.status(400).json({ error: 'Missing clerkId' });
    }

    const safeUsername = (username || name || `user_${clerkId.slice(-6)}`)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');

    const user = await User.findOneAndUpdate(
      { clerkId },
      {
        $set: {
          clerkId,
          email: email || `${clerkId}@example.com`,
          name: name || username || 'User',
          username: safeUsername,
          handle: safeUsername, // Ensures handle is never null
          avatar: avatar || '',
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    console.log(`User synced to MongoDB: ${user.username} (${user._id})`);
    res.status(200).json(user);
  } catch (error) {
    console.error('User sync error in backend:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. Search users by name or username
router.get('/search', async (req, res) => {
  try {
    const { query, currentUserId } = req.query;
    if (!query) return res.status(200).json([]);

    const filter = {
      $or: [
        { name: { $regex: query,$options: 'i' } },
        { username: { $regex: query,$options: 'i' } },
      ],
    };

    if (currentUserId && currentUserId !== 'undefined') {
      filter._id = { $ne: currentUserId };
    }

    const users = await User.find(filter).select('-__v');
    res.status(200).json(users);
  } catch (error) {
    console.error('Search error in backend:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 3. Get all users
router.get('/', async (req, res) => {
  try {
    const allUsers = await User.find({}).select('-__v');
    res.status(200).json(allUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get single user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Update user profile
router.put('/update', async (req, res) => {
  try {
    const { userId, bio, avatar, username } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { bio, avatar, username },
      { new: true }
    );
    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;