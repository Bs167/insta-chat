const { Server } = require('socket.io');

const onlineUsers = new Map();
let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    if (userId && userId !== 'undefined') {
      onlineUsers.set(userId, socket.id);
      console.log(`User connected: ${userId} (${socket.id})`);
    }

    io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));

    // 1. Join room
    socket.on('joinChat', (conversationId) => {
      const room = String(conversationId);
      socket.join(room);
      console.log(`[Socket] ${socket.id} joined room: ${room}`);
    });

    // 2. Relay message
    socket.on('sendMessage', (messagePayload) => {
      if (messagePayload?.conversationId) {
        socket.to(String(messagePayload.conversationId)).emit('newMessage', messagePayload);
      }
    });

    // 3. Typing indicators
    socket.on('start_typing', (conversationId) => {
      console.log(`[Socket] Typing started in room: ${conversationId}`);
      socket.to(String(conversationId)).emit('partner_typing');
    });

    socket.on('stop_typing', (conversationId) => {
      console.log(`[Socket] Typing stopped in room: ${conversationId}`);
      socket.to(String(conversationId)).emit('partner_idle');
    });

    // 4. Read receipts
    socket.on('mark_seen', (conversationId) => {
      console.log(`[Socket] Messages marked seen in room: ${conversationId}`);
      socket.to(String(conversationId)).emit('messages_seen');
    });

    socket.on('disconnect', () => {
      if (userId) {
        onlineUsers.delete(userId);
        io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
      }
    });
  });

  return io;
};

module.exports = { initSocket };