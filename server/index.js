const http = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { URL } = require('url');

// sessionId -> { sessionId, videoUrl, name, isPlaying, currentTime, lastUpdatedAt }
const sessions = new Map();

// sessionId -> Set of WebSocket clients
const sessionClients = new Map();

function getComputedCurrentTime(session) {
  if (!session.isPlaying) return session.currentTime;
  const elapsed = (Date.now() - session.lastUpdatedAt) / 1000;
  return session.currentTime + elapsed;
}

function addCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJSON(res, status, body) {
  addCORSHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    addCORSHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // POST /sessions
  if (req.method === 'POST' && pathname === '/sessions') {
    const { videoUrl, name } = await readBody(req);
    if (!videoUrl || !name) {
      return sendJSON(res, 400, { error: 'videoUrl and name are required' });
    }
    const sessionId = uuidv4();
    sessions.set(sessionId, {
      sessionId,
      videoUrl,
      name,
      isPlaying: false,
      currentTime: 0,
      lastUpdatedAt: Date.now(),
    });
    return sendJSON(res, 201, { sessionId });
  }

  // GET /sessions/:id
  const sessionMatch = pathname.match(/^\/sessions\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    const session = sessions.get(sessionMatch[1]);
    if (!session) return sendJSON(res, 404, { error: 'Session not found' });
    return sendJSON(res, 200, {
      sessionId: session.sessionId,
      videoUrl: session.videoUrl,
      name: session.name,
      isPlaying: session.isPlaying,
      currentTime: getComputedCurrentTime(session),
    });
  }

  sendJSON(res, 404, { error: 'Not found' });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost`);
  const sessionId = url.searchParams.get('sessionId');
  const session = sessions.get(sessionId);

  if (!session) {
    ws.close(4004, 'Session not found');
    return;
  }

  // Register client
  if (!sessionClients.has(sessionId)) sessionClients.set(sessionId, new Set());
  const clients = sessionClients.get(sessionId);
  clients.add(ws);

  const broadcastCount = (set) => {
    const count = set.size;
    console.log(`[PARTICIPANT_COUNT] sessionId=${sessionId} count=${count}`);
    const msg = JSON.stringify({ type: 'PARTICIPANT_COUNT', count });
    for (const client of set) {
      if (client !== ws && client.readyState === client.OPEN) client.send(msg);
    }
    // Send directly to the new client — it may not be OPEN yet in the readyState check
    ws.send(msg);
  };
  broadcastCount(clients);

  // Send current state to the newly connected client
  ws.send(JSON.stringify({
    type: 'SYNC',
    currentTime: getComputedCurrentTime(session),
    isPlaying: session.isPlaying,
    videoUrl: session.videoUrl,
    name: session.name,
  }));

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    const { type, currentTime } = msg;

    if (type === 'PLAY') {
      session.currentTime = currentTime ?? getComputedCurrentTime(session);
      session.isPlaying = true;
      session.lastUpdatedAt = Date.now();
    } else if (type === 'PAUSE') {
      session.currentTime = currentTime ?? getComputedCurrentTime(session);
      session.isPlaying = false;
      session.lastUpdatedAt = Date.now();
    } else if (type === 'SEEK') {
      session.currentTime = currentTime ?? 0;
      session.lastUpdatedAt = Date.now();
      // keep isPlaying state as-is
    } else if (type === 'BUFFER') {
      // Someone is buffering — pause everyone at the current time
      session.currentTime = currentTime ?? getComputedCurrentTime(session);
      session.isPlaying = false;
      session.lastUpdatedAt = Date.now();
    } else if (type === 'BUFFER_END') {
      // Buffering done — resume everyone from the current time
      session.currentTime = currentTime ?? getComputedCurrentTime(session);
      session.isPlaying = true;
      session.lastUpdatedAt = Date.now();
    } else {
      return; // unknown message type, ignore
    }

    // For BUFFER broadcast PAUSE; for BUFFER_END broadcast PLAY; otherwise mirror the type
    const broadcastType =
      type === 'BUFFER' ? 'PAUSE' : type === 'BUFFER_END' ? 'PLAY' : type;

    // Broadcast to all other clients in the session
    const clients = sessionClients.get(sessionId);

    if (clients) {
      const broadcast = JSON.stringify({
        type: broadcastType,
        currentTime: session.currentTime,
        isPlaying: session.isPlaying,
      });
      for (const client of clients) {
        if (client !== ws && client.readyState === client.OPEN) {
          client.send(broadcast);
        }
      }
    }
  });

  ws.on('close', () => {
    const clients = sessionClients.get(sessionId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        sessionClients.delete(sessionId);
      } else {
        broadcastCount(clients);
      }
    }
  });
});

server.listen(8080, () => {
  console.log('Server listening on http://localhost:8080');
});
