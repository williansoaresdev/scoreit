const { customAlphabet } = require('nanoid');

// Short, no-lookalike-characters room codes (e.g. "7F3KQP") - easy to read aloud/type.
const generateRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const MAX_PLAYERS_PER_ROOM = 30;
const SHOTS_PER_PLAYER = 10;

/**
 * A Room holds the shared state for one virtual court:
 * the roster of players and each player's live score/shot progress.
 * Rooms live only in memory - fine for a single Render instance/demo,
 * but state is lost on restart or with multiple instances.
 */
class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map(); // playerId -> player state
    this.createdAt = Date.now();
  }

  get size() {
    return this.players.size;
  }

  isFull() {
    return this.size >= MAX_PLAYERS_PER_ROOM;
  }

  isEmpty() {
    return this.size === 0;
  }

  addPlayer(id, { name, character }) {
    const player = {
      id,
      name,
      character,
      score: 0,
      shots: 0,
      finished: false,
      joinedAt: Date.now(),
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  recordShot(id, made) {
    const player = this.players.get(id);
    if (!player || player.finished) return null;
    player.shots += 1;
    if (made) player.score += 3;
    if (player.shots >= SHOTS_PER_PLAYER) player.finished = true;
    return player;
  }

  toPublicList() {
    return Array.from(this.players.values()).sort((a, b) => b.score - a.score);
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom() {
    let id = generateRoomId();
    while (this.rooms.has(id)) id = generateRoomId();
    const room = new Room(id);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id) {
    return this.rooms.get((id || '').toUpperCase());
  }

  deleteRoom(id) {
    this.rooms.delete(id);
  }
}

module.exports = { RoomManager, MAX_PLAYERS_PER_ROOM, SHOTS_PER_PLAYER };
