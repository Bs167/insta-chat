const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create the uploads folder if it doesn't exist
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Save files with a unique timestamp
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({ storage });

// POST /api/upload
router.post('/', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Public URL reachable by any client
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${serverUrl}/uploads/${req.file.filename}`;

    console.log('File successfully uploaded & served at:', fileUrl);
    res.status(200).json({ url: fileUrl });
  } catch (error) {
    console.error('Upload route error:', error);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

module.exports = router;