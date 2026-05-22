const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);


app.get('/api/agents', (req, res) => {
  const onlineAgents = Array.from(agents.keys());
  res.json({ agents: onlineAgents });
});

const io = new Server(server, {
  cors: {
    origin: '*', // For development
    methods: ['GET', 'POST']
  }
});

// Store mappings of connection codes to socket IDs
const agents = new Map(); // code -> agent socket id
const viewers = new Map(); // viewer socket id -> connected agent code

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // AGENT FLOW
  socket.on('register-agent', (code) => {
    agents.set(code, socket.id);
    socket.join(code);
    console.log(`Agent registered with code: ${code} (Socket: ${socket.id})`);
    socket.emit('agent-registered', { success: true });
  });

  socket.on('screen-frame', ({ code, image }) => {
    // Broadcast the frame to any viewer in the room
    socket.to(code).emit('screen-frame', image);
  });

  socket.on('screen-info', ({ code, width, height }) => {
    socket.to(code).emit('screen-info', { width, height });
  });

  socket.on('displays-info', ({ code, displays }) => {
    socket.to(code).emit('displays-info', displays);
  });

  // VIEWER FLOW
  socket.on('connect-viewer', (code) => {
    if (agents.has(code)) {
      socket.join(code);
      viewers.set(socket.id, code);
      console.log(`Viewer ${socket.id} connected to agent ${code}`);
      
      // Notify agent that a viewer connected
      const agentSocketId = agents.get(code);
      io.to(agentSocketId).emit('viewer-connected', socket.id);
      
      socket.emit('viewer-connected', { success: true });
    } else {
      socket.emit('connection-error', 'Código de agente inválido ou offline.');
    }
  });

  socket.on('request-displays', (code) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('request-displays');
    }
  });

  socket.on('switch-screen', ({ code, displayId }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('switch-screen', { displayId });
    }
  });

  // ADVANCED FEATURES (From Viewer to Agent)
  socket.on('sync-clipboard', ({ code, text }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('sync-clipboard', { text });
    }
  });

  socket.on('reverse-control', ({ code, viewerCode }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('reverse-control', { viewerCode });
    }
  });

  socket.on('file-transfer-start', ({ code, fileName, fileSize }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('file-transfer-start', { fileName, fileSize });
    }
  });

  socket.on('file-chunk', ({ code, chunk }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('file-chunk', { chunk });
    }
  });

  socket.on('file-transfer-end', ({ code, fileName }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('file-transfer-end', { fileName });
    }
  });

  // MOUSE & KEYBOARD COMMANDS (From Viewer to Agent)
  socket.on('mouse-move', ({ code, x, y, displayId }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('mouse-move', { x, y, displayId });
    }
  });

  socket.on('mouse-click', ({ code, button, double }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('mouse-click', { button, double });
    }
  });

  socket.on('keyboard-type', ({ code, key }) => {
    const agentSocketId = agents.get(code);
    if (agentSocketId) {
      io.to(agentSocketId).emit('keyboard-type', { key });
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    
    // Clean up if it was an agent
    for (const [code, id] of agents.entries()) {
      if (id === socket.id) {
        agents.delete(code);
        console.log(`Agent ${code} disconnected`);
        socket.to(code).emit('agent-disconnected');
      }
    }

    // Clean up if it was a viewer
    if (viewers.has(socket.id)) {
      const code = viewers.get(socket.id);
      viewers.delete(socket.id);
      
      const agentSocketId = agents.get(code);
      if (agentSocketId) {
        io.to(agentSocketId).emit('viewer-disconnected', socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling Server running on port ${PORT}`);
});
