const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Route & Socket imports
const webhookRoutes = require('./routes/webhookRoutes');
const userRoutes = require('./routes/userRoutes');
const messageRoutes = require('./routes/messageRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const storyRoutes = require('./routes/storyRoutes');
const { initSocket } = require('./socket');

dotenv.config();
connectDB();

// 1. Initialize Express and HTTP server (MUST BE HERE FIRST)
const app = express();
const server = http.createServer(app);

// 2. Initialize Socket.io
initSocket(server);

// 3. Middlewares
app.use(cors());

// Clerk webhook route (uses raw body parser internally)
app.use('/api/webhooks', webhookRoutes);

// JSON body parser for normal API routes
app.use(express.json());

// Serve uploads folder statically (AFTER app is initialized)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. API Routes
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/stories', storyRoutes);

// Health check route
app.get('/', (req, res) => {
  res.send('InstaChat server and Socket.io are running');
});

// 5. Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server and Socket.io running on port ${PORT}`);
});