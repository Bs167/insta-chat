const express = require('express');
const router = express.Router();
const { Webhook } = require('svix');
const User = require('../models/User');

// POST /api/webhooks/clerk
router.post(
  '/clerk',
  express.raw({ type: 'application/json' }), // Keeps raw body for signature check
  async (req, res) => {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      console.error('Error: CLERK_WEBHOOK_SECRET is missing in .env');
      return res.status(500).json({ error: 'Missing webhook secret' });
    }

    // Extract Svix headers
    const svix_id = req.headers['svix-id'];
    const svix_timestamp = req.headers['svix-timestamp'];
    const svix_signature = req.headers['svix-signature'];

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return res.status(400).json({ error: 'Missing svix verification headers' });
    }

    const wh = new Webhook(WEBHOOK_SECRET);

    // 1. Verify signature
    try {
      wh.verify(req.body, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      });
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    // 2. Parse the verified payload
    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch (err) {
      console.error('Failed to parse webhook JSON:', err.message);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const { type, data } = event;

    try {
      // Handle user.created
      if (type === 'user.created') {
        // Look for primary email, first email, or generate a dummy email for tests
        const email =
        data.email_addresses?.[0]?.email_address ||
        `${data.id}@example.com`;

        const username =
        data.username ||
        email.split('@')[0] ||
        `user_${data.id.slice(-6)}`;
        
        const name =
          `${data.first_name || ''} ${data.last_name || ''}`.trim() || username;
        const avatar = data.image_url || '';

        await User.create({
          clerkId: data.id,
          email,
          username,
          name,
          avatar,
        });

        console.log(`User created in MongoDB: ${username} (${data.id})`);
      }

      // Handle user.updated
      if (type === 'user.updated') {
        const email =
        data.email_addresses?.[0]?.email_address ||
        `${data.id}@example.com`;        
        
        const username = data.username || email.split('@')[0];
        const name =
        `${data.first_name || ''} ${data.last_name || ''}`.trim() || username;

        await User.findOneAndUpdate(
          { clerkId: data.id },
          {
            email,
            username,
            name,
            avatar: data.image_url || '',
          },
          { new: true, upsert: true }
        );

        console.log(`User updated in MongoDB: ${username}`);
      }

      // Handle user.deleted
      if (type === 'user.deleted') {
        await User.findOneAndDelete({ clerkId: data.id });
        console.log(`User deleted from MongoDB: ${data.id}`);
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error updating MongoDB from webhook:', error.message);
      return res.status(500).json({ error: 'Failed to process webhook event' });
    }
  }
);

module.exports = router;