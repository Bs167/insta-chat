const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// Check if Cloudinary is configured
const hasCloudinary =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name';

if (hasCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Prepare local upload directory
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({ storage });

// POST /api/upload
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('Upload error: No file found in request');
      return res.status(400).json({ error: 'No file received' });
    }

    // 1. If Cloudinary keys are set, upload directly to Cloudinary
    if (hasCloudinary) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'instachat',
        resource_type: 'auto',
      });
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      console.log('Uploaded to Cloudinary:', result.secure_url);
      return res.status(200).json({ url: result.secure_url });
    }

    // 2. Otherwise serve from local server (uses HTTPS if behind ngrok)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    console.log('Saved locally and served at:', fileUrl);
    res.status(200).json({ url: fileUrl });
  } catch (error) {
    console.error('Upload processing error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

module.exports = router;