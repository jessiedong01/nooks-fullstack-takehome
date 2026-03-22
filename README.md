## Nooks Watch Party Project

### How to Run

**Frontend:**
```
npm install
npm start
```
Runs on http://localhost:3000

**Backend:**
```
cd server
npm install
node index.js
```
Runs on http://localhost:8080

Start the backend before the frontend. Then navigate to http://localhost:3000/create to create a session.

---

### Architecture Questions

**How did you approach the problem?**

I started with the backend since all the sync logic lives there. I built a simple Node.js HTTP and WebSocket server with no framework, storing sessions in a Map with `isPlaying`, `currentTime`, and `lastUpdatedAt` fields. Once that was solid I built the `useWatchParty` hook as the single place that owns the WebSocket connection and exposes send functions to the rest of the app, then wired up the pages and finally the VideoPlayer.

The main unexpected difficulty was the YouTube seek event. The skeleton code even flags this: the YouTube iframe API no longer fires seek events reliably. I resolved it by disabling the native YouTube controls entirely and building a custom play/pause button and seek slider. This ended up being cleaner anyway because it gave me full control over when to fire callbacks versus when to suppress them.

The other subtle issue was event echoing. When a remote PLAY or PAUSE command comes in and I update the player state, react-player fires its own `onPlay` or `onPause` event, which would send the event right back to the server. I fixed this with a `suppressNextEvent` ref that gets set to true before applying any remote command and cleared inside the handler.

---

**How did you implement seeking?**

I built a custom MUI Slider below the video. While dragging it updates the display position locally without touching the player. On drag commit, it calls `player.seekTo(time)` and fires `onSeek(time)`, which sends a SEEK message to the server. The server updates `currentTime` while keeping `isPlaying` unchanged, then broadcasts to all other clients who call `seekTo` on their own players.

The alternative would be keeping the native YouTube controls and polling `getCurrentTime` on an interval to detect jumps by comparing the current time against expected progress. The problem is polling is imprecise, introduces latency proportional to the poll interval, and can't cleanly distinguish a seek from normal buffering lag. Custom controls give you exact seek timestamps every time.

---

**How do new users know what time to join?**

When a client connects via WebSocket, the server immediately sends a SYNC message with the current `isPlaying` state and a computed `currentTime`. If the session is playing, `currentTime` is calculated as `storedTime + (Date.now() - lastUpdatedAt) / 1000` to account for however much time has elapsed since the last update. The client receives this, seeks to that position, and starts or stays paused accordingly.

An alternative would be having the new client poll GET `/sessions/:id` until they're ready to play. But polling adds unnecessary latency and complexity. A single SYNC message over the already-open WebSocket connection is simpler, lower latency, and happens at exactly the right moment.

---

**How accurate is the join time, and where can it break down?**

The server computes `currentTime` server-side from wall clock elapsed time, which avoids relying on any individual client's reported position. That said there are a few real edge cases.

Network latency means the SYNC message takes some milliseconds to reach the client, so by the time they seek to the synced position they are already slightly behind. On high-latency connections this could be off by hundreds of milliseconds. There is also a player ready delay: the client can only seek after react-player fires `onReady`, and if the YouTube API takes a few seconds to initialize the computed time is already stale before the seek even happens. On top of that, if the new user buffers immediately after seeking they will fall further behind relative to everyone else playing smoothly. None of these are easily solvable without a continuous correction mechanism rather than a one-time sync on join.

---

**Are there other race conditions or edge cases?**

A few come to mind. If two users click play at the exact same moment, both send PLAY to the server. Since Node.js is single-threaded it processes them sequentially so one wins, but both clients have already started playing locally at slightly different times. The second PLAY sets the canonical time but the first user's player is already a few frames ahead.

If user A seeks while user B is buffering, user B receives the SEEK command but their player may not honor it cleanly while in a buffering state, which can leave them at the wrong position. Browsers also throttle JavaScript and sometimes video playback in backgrounded tabs, so a user who backgrounds their tab can drift from the group and send stale timestamps when they come back. Finally, if a client sends BUFFER_END before the server has finished broadcasting the preceding BUFFER pause to everyone, some clients resume while others are still processing the pause.

---

**How would you scale this to 1M+ DAUs and 10k per session?**

The biggest structural problem is that the current in-memory Map is single-process and does not survive restarts. The first thing to fix is replacing it with Redis for session state, shared across all server instances. WebSocket connections are stateful so a user on server A cannot receive broadcasts from server B. You would need Redis Pub/Sub or a message broker like Kafka so any server can publish an event and all servers forward it to their connected clients in that session. You would deploy multiple WebSocket server instances behind a load balancer with sticky sessions, or use a managed WebSocket service like Ably or Pusher for the transport layer entirely.

At 10k connections in a single session, Node.js can hold the connections open efficiently, but the CPU cost of broadcasting to 10k clients in a tight loop becomes a real bottleneck. Fan-out at that scale probably needs to be a dedicated service rather than a loop in application code.

On the code side I would add reconnection logic with exponential backoff and a full state re-sync on reconnect, replace the one-time join sync with periodic heartbeat messages from the server so clients can continuously correct drift, add session TTLs so stale sessions do not accumulate, and rate-limit incoming events per client to prevent someone from flooding a session with seek events.

For UX at that scale, play and pause should probably be host-only to avoid chaos from thousands of people clicking simultaneously. A visible buffering indicator so others know why playback paused, and a manual resync button for anyone who feels they have drifted, would both be worth adding.
