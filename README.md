# ScoreIt

Online multiplayer motion-controlled basketball. Swing your phone to shoot 10
free throws and see how you rank against everyone else on your court, live.

- **Frontend**: vanilla HTML/CSS/JS PWA (`/public`) — no build step, no framework.
- **Backend**: Node.js + [`ws`](https://github.com/websockets/ws) WebSocket server (`/server`), served alongside the static frontend by a single Express app.
- **Hosting**: designed for [Render](https://render.com) (`render.yaml` included).

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on your phone (same Wi-Fi) or in a desktop
browser. DeviceMotion requires a **secure context** (HTTPS) on real phones —
`localhost` is exempt, so local testing works over plain HTTP, but once
deployed the game must be served over HTTPS (Render does this for you).

Two browser tabs pointed at the same room ID are enough to see the
multiplayer sync working, using the touch-swipe fallback instead of a real
phone swing.

## How the multiplayer protocol works

Everything goes through **one WebSocket connection per player**, at `/ws`,
carrying small JSON messages:

| Client → Server | Payload | Server → Client | Payload |
|---|---|---|---|
| `create_room` | `{ name, character }` | `joined` | `{ roomId, selfId, players[] }` |
| `join_room` | `{ roomId, name, character }` | `room_update` | `{ players[] }` |
| `shot` | `{ made }` | `error` | `{ message }` |
| `leave_room` | `{}` | | |

`server/rooms.js` holds a `RoomManager` (a `Map` of room ID → `Room`), and
each `Room` is a `Map` of player ID → player state (name, character, score,
shots, finished). `server/index.js` wires WebSocket events to that model and
**broadcasts** `room_update` to every socket tagged with the same `roomId`
whenever the roster changes — that's the core pattern to study if you're
learning WebSocket fan-out: tag each connection with the room it belongs to,
then filter `wss.clients` by that tag when broadcasting.

Rooms live only in memory. That's fine for a single Render instance/demo,
but state resets on redeploy/restart and won't be shared if you ever scale
to multiple instances (that would need a shared store like Redis pub/sub).

## Gameplay notes

- Up to **30 players** per court, **10 shots** each, **3 points** per make.
- Shooting is a single input abstraction (`public/js/motion.js`) that
  normalizes either a real `devicemotion` swing or a touch swipe into the
  same `{ power, lateral }` pair, so `app.js` doesn't care which one fired.
- Shot accuracy is scored against a hidden "ideal power" window with a
  medium tolerance (see `IDEAL_POWER`/`POWER_TOLERANCE`/`LATERAL_TOLERANCE`
  in `public/js/app.js`) — tune those constants to make the game easier or
  harder.
- All sound effects are synthesized with the Web Audio API
  (`public/js/audio.js`) — no audio files to ship or cache.
- Character art (`public/js/avatar.js`) is original inline SVG. The
  reference screenshots in `/assets` are third-party (Basketball Stars)
  and were used only to match the "back view, ball in hands, hoop ahead"
  layout — they are not shipped in the game.

## Deploying to Render

1. Push this repo to GitHub.
2. In Render, **New +** → **Blueprint**, point it at the repo — it will read
   `render.yaml` and create the web service automatically (Node, free plan,
   `npm install` / `npm start`).
   - Or create a **Web Service** manually with the same build/start commands.
3. Render provisions HTTPS automatically, which is required for DeviceMotion
   on real phones.
4. Share the deployed URL (or a court's `?room=XXXX` link) with friends.

## Known limitations / next steps

- iOS Safari requires an explicit tap to request motion permission — that's
  the "Enable Motion Controls" gate on first entering a court.
- No reconnection/resume if a player's socket drops mid-game (they'd need to
  rejoin as a new player).
- No anti-cheat: the client reports its own shot outcome. Fine for a casual
  game with friends; would need server-side shot validation for anything
  competitive.
