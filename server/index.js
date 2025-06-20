const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const onlineUsers = new Set();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  onlineUsers.add(socket.id);
  io.emit('online-users', Array.from(onlineUsers));

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    onlineUsers.delete(socket.id);
    io.emit('online-users', Array.from(onlineUsers));
  });

  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });
});

server.listen(5000, '0.0.0.0', () => {
  console.log('Server running at http://localhost:5000');
});
