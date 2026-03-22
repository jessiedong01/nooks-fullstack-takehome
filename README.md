## Nooks Watch Party Project

In this takehome project, we want to understand your:
- ability to build something non-trivial from scratch
- comfort picking up unfamiliar technologies
- architectural decisions, abstractions, and rigor

We want to respect your time, so please try not to spend more than 5 hours on this. We know that this is a challenging task & you are under time pressure and will keep that in mind when evaluating your solution.

### Instructions

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

### Problem
Your task is to build a collaborative “Watch Party” app that lets a distributed group of users watch youtube videos together. The frontend should be written in Typescript (we have a skeleton for you set up) and the backend should be written in Node.JS. The app should support two main pages:

- `/create` **Create a new session**
    - by giving it a name and a youtube video link. After creating a session `ABC`, you should be automatically redirected to the page `/watch` page for that session
- `/watch/:sessionId` **Join an existing session**
    
    *⚠️ The player must be **synced for all users at all times** no matter when they join the party*
    
    - **Playing/pausing/seek** the video. When someone plays/pauses the video or jumps to a certain time in the video, this should update for everyone in the session
    - **Late to the party**... Everything should stay synced if a user joins the session late (e.g. if the video was already playing, the new user should see it playing at the correct time)
        
### Assumptions

- This app obviously **doesn’t need to be production-ready**, but you should at least be aware of any issues you may encounter in more real-world scenarios.
- We gave you all of the frontend UX you’ll need in the [starter repo](https://github.com/NooksApp/nooks-fullstack-takehome), including skeleton pages for the `create` and `watch` routes, so you can focus on implementing the core backend functionality & frontend video playing logic for the app.
- You should probably use **websockets** to keep state synchronized between multiple users.

You will need to embed a Youtube video directly in the website. In our skeleton code we use [react-player](https://www.npmjs.com/package/react-player), but feel free to use another library or use the [Youtube IFrame API](https://developers.google.com/youtube/iframe_api_reference) directly.

In order to sync the video, you’ll need to know when any user plays, pauses, or seeks in their own player and transmit that information to everyone else. In order to get play, pause, and seek events you can use:
1. [YouTube iFrame API - Events](https://developers.google.com/youtube/iframe_api_reference#Events)
2. Build your own custom controls for play, pause & seek. If you choose  this option, make sure the controls UX works very similarly to youtube’s standard controls (e.g. play/pause button and a slider for seek)

### Required Functionality

- [x] **Creating a session**. Any user should be able to create a session to watch a given Youtube video.
- [x] **Joining a session**. Any user should be able to join a session created by another user using the shareable session link.
- [x] **Playing/pausing** the video. When a participant pauses the video, it should pause for everyone. When a participant plays the video, it should start playing for everyone.
- [x] **”Seek”**. When someone jumps to a certain time in the video it should jump to that time for everyone.
- [x] **Late to the party**... Everything should stay synced even if a user joins the watch party late (e.g. the video is already playing)
- [x] **Player controls.** All the player controls (e.g. play, pause, and seek) should be intuitive and behave as expected. For play, pause & seek operations you can use the built-in YouTube controls or disable the YouTube controls and build your own UI (including a slider for the seek operation)

🚨 **Please fill out the rubric in the README with the functionality you were able to complete**


### Architecture Questions

After building the watch party app, we would like you to answer the following questions about design decisions and tradeoffs you made while building it. Please fill them out in the README along with your submission.

1. **How did you approach the problem? What did you choose to learn or work on first? Did any unexpected difficulties come up - if so, how did you resolve them?**

   I started with the backend since the sync logic lives there — a simple Node.js HTTP + WebSocket server with no framework. Sessions are stored in a `Map` with `isPlaying`, `currentTime`, and `lastUpdatedAt` fields. From there I built the `useWatchParty` hook as the single place that owns the WebSocket connection and exposes send functions to the rest of the app, then wired up `CreateSession` and `WatchSession`, and finally `VideoPlayer`.

   The main unexpected difficulty was the YouTube seek event. The react-player docs and the skeleton code both note that the YouTube iframe API no longer fires seek events reliably. I resolved this by disabling the native YouTube controls entirely (`controls={false}`, `pointerEvents: none`) and building custom play/pause and seek slider controls. This also gave cleaner control over when to fire callbacks vs. when to suppress them (for remote-driven events).

   Another subtle issue: when applying a remote PLAY or PAUSE command, the `setPlaying` state change causes react-player to fire its own `onPlay`/`onPause` event, which would echo the event back to the server. I resolved this with a `suppressNextEvent` ref that is set to `true` before applying any remote command, and cleared inside the handler.

2. **How did you implement seeking to different times in the video? Are there any other approaches you considered and what are the tradeoffs between them?**

   I built a custom MUI `Slider` below the video. On drag, it updates the display position locally without touching the player. On drag commit (`onChangeCommitted`), it calls `player.seekTo(time)` and fires `onSeek(time)` which sends a `SEEK` message to the server. The server updates `currentTime` (keeping `isPlaying` unchanged) and broadcasts to all other clients, who then call `seekTo` on their own players.

   An alternative would be to use the native YouTube controls and poll `getCurrentTime` on an interval to detect jumps (comparing current time to expected time given elapsed wall clock). The tradeoff: polling is imprecise and introduces latency proportional to the poll interval; it also can’t distinguish a seek from normal buffering lag. The custom controls approach is more reliable and gives exact seek timestamps.

3. **How do new users know what time to join the watch party? Are there any other approaches you considered and what were the tradeoffs between them?**

   When a client connects via WebSocket, the server immediately sends a `SYNC` message containing the current computed `currentTime` and `isPlaying` state. If the session is playing, `currentTime` is calculated as `storedTime + (Date.now() - lastUpdatedAt) / 1000` to account for elapsed time since the last update. The client receives this and seeks to that time before starting playback.

   An alternative would be to have the new client do an HTTP `GET /sessions/:id` poll on an interval until it’s ready to play. The tradeoff is that polling adds latency and complexity; a single `SYNC` message on WebSocket connection is simpler, lower latency, and happens at exactly the right moment (after the player is ready).

4. **How do you guarantee that the time that a new user joins is accurate (i.e perfectly in sync with the other users in the session) and are there any edge cases where it isn’t?**

   The server computes `currentTime` server-side using wall clock elapsed time, which avoids relying on any individual client’s reported time. However, there are edge cases:

   - **Network latency**: The `SYNC` message takes some milliseconds to travel from server to client. By the time the client seeks to the synced time, it’s already slightly behind. For most sessions this is imperceptible, but on high-latency connections it could be off by hundreds of milliseconds.
   - **Player ready delay**: The client can only seek after react-player fires `onReady`. If the player takes a few seconds to initialize (e.g. slow YouTube API load), the computed time is already stale. The gap between `SYNC` reception and the actual seek adds additional drift.
   - **Buffering on join**: If the new user’s connection is slow and they buffer immediately after seeking, they’ll fall behind relative to others who are playing smoothly.
   - **Clock skew**: The server uses `Date.now()` on the server machine. If the server clock is wrong (unlikely but possible), all computed times would be off.

5. **Are there any other situations — race conditions, edge cases — where users can be out of sync?**

   - **Concurrent play/pause**: If two users click play at the exact same moment, both send `PLAY` to the server. The server processes them sequentially (Node.js is single-threaded), so one wins, but both clients have already started playing locally — they end up at slightly different times. A "last write wins" approach means the second PLAY sets the canonical time, but the first user’s player is already ahead by a few frames.
   - **Seek during buffering**: If user A seeks while user B is buffering, user B receives the `SEEK` command but their player may not honor it cleanly while in a buffering state, leaving them at the wrong position.
   - **Tab backgrounding**: Browsers throttle JavaScript timers and potentially video playback in background tabs. A user who backgrounds their tab may drift from the group and send stale timestamps when they return.
   - **BUFFER/BUFFER_END ordering**: If a client sends `BUFFER_END` before the server has broadcast the preceding `BUFFER` pause to all clients (due to message reordering or timing), some clients resume while others are still catching up to the pause.

6. **How would you productionize this at 1M+ DAUs and 10k users per session?**

   **Infrastructure:**
   - The current in-memory `Map` is single-process and doesn’t survive restarts. Replace it with a Redis store for session state, shared across all server instances.
   - WebSocket connections are stateful — a user connected to server A can’t receive broadcasts from server B. Use Redis Pub/Sub (or a message broker like Kafka) so any server can publish an event and all servers forward it to their connected clients in that session.
   - Deploy multiple WebSocket server instances behind a load balancer with sticky sessions (or use a dedicated WebSocket service like Ably or Pusher for the transport layer).
   - At 10k connections per session, a single Node.js process can handle this (Node is efficient at holding open connections), but CPU for broadcast becomes a bottleneck — broadcasting to 10k clients is a tight loop. Fan-out could be offloaded to a dedicated broadcast service.

   **Code changes:**
   - Add reconnection logic on the client — exponential backoff with state re-sync on reconnect.
   - Replace wall-clock elapsed time with a more robust sync approach: periodic heartbeat messages from the server with the authoritative current time, so clients can continuously correct drift rather than only syncing on join.
   - Add a session expiry / TTL so stale sessions don’t accumulate in Redis.
   - Rate-limit incoming events per client to prevent a bad actor from flooding the session with seek/play events.

   **UX changes:**
   - Show a visual indicator when a user is buffering so others know why playback paused.
   - Add a "resync" button for users who feel they’ve drifted.
   - For very large sessions (thousands of viewers), consider making play/pause a host-only privilege to avoid chaos from concurrent inputs.

🚨 **Please fill out this section in the README with answers to these questions, or send the answers in your email instead.**

### Help & Clarifications

If you want something about the problem statement clarified at any point while you’re working on this, feel free to **email me** at nikhil@nooks.in or even **text me** at 408-464-2288. I will reply as soon as humanly possible and do my best to unblock you.

Feel free to use any resource on the Internet to help you tackle this challenge better: guides, technical documentation, sample projects on Github — anything is fair game! We want to see how you can build things in a real working environment where no information is off limits.

### Submission

When you’ve finished, please send back your results to me (nikhil@nooks.in) and CC our recruiting lead Haelin (haelin.kim@nooks.in) via email as a **zip file**. Make sure to include any instructions about how to run the app in the README.md. 

I will take a look and schedule a time to talk about your solution!

