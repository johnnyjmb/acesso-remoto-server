const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const server = http.createServer(app);

app.get('/', (req, res) => {
  res.send('Servidor de Acesso Remoto Operante.');
});

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
  socket.on('register-agent', (data) => {
    const { code, password } = typeof data === 'object' ? data : { code: data, password: '' };
    agents.set(code, { socketId: socket.id, password });
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
  socket.on('connect-viewer', (data) => {
    const { code, password } = typeof data === 'object' ? data : { code: data, password: '' };
    const agentData = agents.get(code);

    if (agentData) {
      // Validate password if the agent has one set
      if (agentData.password && agentData.password !== password) {
        socket.emit('connection-error', 'Senha incorreta.');
        return;
      }

      socket.join(code);
      viewers.set(socket.id, code);
      console.log(`Viewer ${socket.id} connected to agent ${code}`);
      
      // Notify agent that a viewer connected
      io.to(agentData.socketId).emit('viewer-connected', socket.id);
      
      socket.emit('viewer-connected', { success: true });
    } else {
      socket.emit('connection-error', 'Código de agente inválido ou offline.');
    }
  });

  socket.on('request-displays', (code) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('request-displays');
    }
  });

  socket.on('switch-screen', ({ code, displayId }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('switch-screen', { displayId });
    }
  });

  // ADVANCED FEATURES (From Viewer to Agent)
  socket.on('sync-clipboard', ({ code, text }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('sync-clipboard', { text });
    }
  });

  socket.on('reverse-control', ({ code, viewerCode }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('reverse-control', { viewerCode });
    }
  });

  socket.on('file-transfer-start', ({ code, fileName, fileSize }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('file-transfer-start', { fileName, fileSize });
    }
  });

  socket.on('file-chunk', ({ code, chunk }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('file-chunk', { chunk });
    }
  });

  socket.on('file-transfer-end', ({ code, fileName }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('file-transfer-end', { fileName });
    }
  });

  // MOUSE & KEYBOARD COMMANDS (From Viewer to Agent)
  socket.on('mouse-move', ({ code, x, y, displayId }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('mouse-move', { x, y, displayId });
    }
  });

  socket.on('mouse-click', ({ code, button, double }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('mouse-click', { button, double });
    }
  });

  socket.on('keyboard-type', ({ code, key }) => {
    const agentData = agents.get(code);
    if (agentData) {
      io.to(agentData.socketId).emit('keyboard-type', { key });
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    
    // Clean up if it was an agent
    for (const [code, data] of agents.entries()) {
      if (data.socketId === socket.id) {
        agents.delete(code);
        console.log(`Agent ${code} disconnected`);
        socket.to(code).emit('agent-disconnected');
      }
    }

    // Clean up if it was a viewer
    if (viewers.has(socket.id)) {
      const code = viewers.get(socket.id);
      viewers.delete(socket.id);
      
      const agentData = agents.get(code);
      if (agentData) {
        io.to(agentData.socketId).emit('viewer-disconnected', socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling Server running on port ${PORT}`);
});
