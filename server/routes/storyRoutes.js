const express = require('express');
const router = express.Router();
const Story = require('../models/Story');

// Fetch all active stories (last 24 hours)
router.get('/', async (req, res) => {
  try {
    const stories = await Story.find()
      .populate('user', 'name username avatar')
      .sort({ createdAt: -1 });
    res.json(stories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new story (supports both POST /api/stories/create and POST /api/stories)
const createStoryHandler = async (req, res) => {
  try {
    const { userId, user, mediaUrl, image, caption } = req.body;
    const finalUser = userId || user;
    const finalMedia = mediaUrl || image;

    if (!finalUser || !finalMedia) {
      return res.status(400).json({ error: 'userId and mediaUrl are required' });
    }

    const newStory = new Story({
      user: finalUser,
      mediaUrl: finalMedia,
      caption: caption || '',
    });

    await newStory.save();
    const populatedStory = await Story.findById(newStory._id).populate(
      'user',
      'name username avatar'
    );

    res.status(201).json(populatedStory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

router.post('/create', createStoryHandler);
router.post('/', createStoryHandler);

// Delete a story
router.delete('/:id', async (req, res) => {
  try {
    await Story.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;