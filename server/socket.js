const { Server } = require('socket.io');

const userSocketMap = new Map();
let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    if (userId && userId !== 'undefined') {
      userSocketMap.set(userId, socket.id);
      console.log(`User connected: ${userId} (${socket.id})`);
    }

    io.emit('getOnlineUsers', Array.from(userSocketMap.keys()));

    // 1. Join a specific chat room
    socket.on('joinChat', (conversationId) => {
      socket.join(conversationId);
      console.log(`Socket ${socket.id} joined conversation room: ${conversationId}`);
    });

    // 2. Broadcast message instantly to everyone in that conversation room
    socket.on('sendMessage', (messageData) => {
      if (messageData.conversationId) {
        socket.to(messageData.conversationId).emit('newMessage', messageData);
        console.log(`Message broadcasted to room ${messageData.conversationId}:`, messageData.text);
      }
    });

    socket.on('disconnect', () => {
      if (userId) {
        userSocketMap.delete(userId);
        io.emit('getOnlineUsers', Array.from(userSocketMap.keys()));
      }
    });
  });

  return io;
};

module.exports = { initSocket };