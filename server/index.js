const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const onlineUsers = new Set();

// --- WebSocket handling ---
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

// --- Route to collect and store user info ---
app.post('/track-user', (req, res) => {
  const userData = req.body;

  console.log("Received user tracking data:", userData);

  const filePath = path.join(__dirname, 'user-data.xlsx');

  let workbook;
  let worksheet;

  // Check if file exists
  if (fs.existsSync(filePath)) {
    workbook = xlsx.readFile(filePath);
    worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const existingData = xlsx.utils.sheet_to_json(worksheet);
    existingData.push(userData);
    const updatedSheet = xlsx.utils.json_to_sheet(existingData);
    workbook.Sheets[workbook.SheetNames[0]] = updatedSheet;
  } else {
    const sheet = xlsx.utils.json_to_sheet([userData]);
    workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, 'UserData');
  }

  xlsx.writeFile(workbook, filePath);
  res.status(200).send({ message: "User info stored successfully." });
});

server.listen(5000, '0.0.0.0', () => {
  console.log('Server running at http://localhost:5000');
});
