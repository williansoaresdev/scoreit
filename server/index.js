const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { nanoid } = require('nanoid');
const { RoomManager, MAX_PLAYERS_PER_ROOM } = require('./rooms');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

// The HTTP server is shared by Express (serving the PWA) and the WebSocket
// server (the game protocol) - both listen on the same Render-assigned port.
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new RoomManager();

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcastRoom(room, message, exceptWs = null) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client.roomId === room.id && client !== exceptWs) {
      client.send(payload);
    }
  }
}

function broadcastRoster(room) {
  broadcastRoom(room, { type: 'room_update', players: room.toPublicList() });
}

function leaveCurrentRoom(ws, { notify = true } = {}) {
  if (!ws.roomId) return;
  const room = rooms.getRoom(ws.roomId);
  if (room) {
    room.removePlayer(ws.playerId);
    if (room.isEmpty()) {
      rooms.deleteRoom(room.id);
    } else if (notify) {
      broadcastRoster(room);
    }
  }
  ws.roomId = null;
  ws.playerId = null;
}

function handleCreateRoom(ws, data) {
  const name = sanitizeName(data.name);
  const character = sanitizeCharacter(data.character);
  if (!name) return send(ws, { type: 'error', message: 'Name is required.' });

  leaveCurrentRoom(ws);
  const room = rooms.createRoom();
  ws.playerId = nanoid(8);
  ws.roomId = room.id;
  const player = room.addPlayer(ws.playerId, { name, character });

  send(ws, {
    type: 'joined',
    roomId: room.id,
    selfId: player.id,
    players: room.toPublicList(),
  });
}

function handleJoinRoom(ws, data) {
  const name = sanitizeName(data.name);
  const character = sanitizeCharacter(data.character);
  const room = rooms.getRoom(data.roomId);

  if (!name) return send(ws, { type: 'error', message: 'Name is required.' });
  if (!room) return send(ws, { type: 'error', message: 'Court not found. Check the ID and try again.' });
  if (room.isFull()) return send(ws, { type: 'error', message: `Court is full (max ${MAX_PLAYERS_PER_ROOM} players).` });

  leaveCurrentRoom(ws);
  ws.playerId = nanoid(8);
  ws.roomId = room.id;
  const player = room.addPlayer(ws.playerId, { name, character });

  send(ws, {
    type: 'joined',
    roomId: room.id,
    selfId: player.id,
    players: room.toPublicList(),
  });
  broadcastRoster(room);
}

function handleShot(ws, data) {
  const room = rooms.getRoom(ws.roomId);
  if (!room || !ws.playerId) return;
  const player = room.recordShot(ws.playerId, Boolean(data.made));
  if (!player) return;
  broadcastRoster(room);
}

function handleLeave(ws) {
  leaveCurrentRoom(ws);
  send(ws, { type: 'left' });
}

function sanitizeName(raw) {
  return String(raw || '').trim().slice(0, 16);
}

const VALID_CHARACTERS = new Set(['boy_dark', 'boy_blonde', 'girl_dark', 'girl_blonde']);
function sanitizeCharacter(raw) {
  return VALID_CHARACTERS.has(raw) ? raw : 'boy_dark';
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return send(ws, { type: 'error', message: 'Malformed message.' });
    }

    switch (data.type) {
      case 'create_room': return handleCreateRoom(ws, data);
      case 'join_room': return handleJoinRoom(ws, data);
      case 'shot': return handleShot(ws, data);
      case 'leave_room': return handleLeave(ws);
      default: return send(ws, { type: 'error', message: `Unknown message type: ${data.type}` });
    }
  });

  ws.on('close', () => leaveCurrentRoom(ws));
});

// Heartbeat: drop dead connections (e.g. phone locked/backgrounded and TCP
// never sent a FIN) so rooms don't accumulate ghost players.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      leaveCurrentRoom(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`ScoreIt server listening on port ${PORT}`);
});
