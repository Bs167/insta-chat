const { Server } = require('socket.io');

// Map: userId -> Set of active socket IDs
const userSockets = new Map();
let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;

    if (userId && userId !== 'undefined') {
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);
      console.log(`[Socket] User ${userId} connected (${socket.id}). Active connections: ${userSockets.get(userId).size}`);
    }

    // Broadcast list of unique online user IDs
    io.emit('getOnlineUsers', Array.from(userSockets.keys()));

    // 1. Join Chat Room
    socket.on('joinChat', (conversationId) => {
      const room = String(conversationId);
      socket.join(room);
      console.log(`[Socket] ${socket.id} joined room: ${room}`);
    });

    // 2. Relay Message
    socket.on('sendMessage', (messagePayload) => {
      if (messagePayload?.conversationId) {
        socket.to(String(messagePayload.conversationId)).emit('newMessage', messagePayload);
      }
    });

    // 3. Typing Indicators
    socket.on('start_typing', (conversationId) => {
      socket.to(String(conversationId)).emit('partner_typing');
    });

    socket.on('stop_typing', (conversationId) => {
      socket.to(String(conversationId)).emit('partner_idle');
    });

    // 4. Read Receipts
    socket.on('mark_seen', (conversationId) => {
      socket.to(String(conversationId)).emit('messages_seen');
    });

    // 5. Safe Disconnect: only mark offline if ALL connections for this user closed
    socket.on('disconnect', () => {
      if (userId && userSockets.has(userId)) {
        const userSocketSet = userSockets.get(userId);
        userSocketSet.delete(socket.id);

        if (userSocketSet.size === 0) {
          userSockets.delete(userId);
          console.log(`[Socket] User completely went offline: ${userId}`);
        } else {
          console.log(`[Socket] User ${userId} closed 1 tab/screen, but still active on ${userSocketSet.size} connection(s).`);
        }

        io.emit('getOnlineUsers', Array.from(userSockets.keys()));
      }
    });
  });

  return io;
};

module.exports = { initSocket };