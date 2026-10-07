const express = require('express');
const router = express.Router();
const Story = require('../models/Story');

// 1. Post a new 24-hour story
router.post('/create', async (req, res) => {
  try {
    const { userId, mediaUrl, caption } = req.body;

    if (!userId || !mediaUrl) {
      return res.status(400).json({ error: 'Missing userId or mediaUrl' });
    }

    const story = await Story.create({
      user: userId,
      mediaUrl,
      caption: caption || '',
    });

    await story.populate('user', 'name username avatar clerkId');
    res.status(201).json(story);
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Get all active stories (grouped by user)
router.get('/', async (req, res) => {
  try {
    const stories = await Story.find({})
      .populate('user', 'name username avatar clerkId')
      .sort({ createdAt: -1 });

    res.status(200).json(stories);
  } catch (error) {
    console.error('Fetch stories error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;