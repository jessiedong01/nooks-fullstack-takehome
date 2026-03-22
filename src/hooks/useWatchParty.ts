import { useEffect, useRef, useState, useCallback } from 'react';

const SERVER_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080';

// ── HTTP helpers ─────────────────────────────────────────────────────────────

export async function createSession(name: string, videoUrl: string): Promise<string> {
  const res = await fetch(`${SERVER_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, videoUrl }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  const { sessionId } = await res.json();
  return sessionId;
}

export async function fetchSession(sessionId: string) {
  const res = await fetch(`${SERVER_URL}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  return res.json() as Promise<{
    sessionId: string;
    videoUrl: string;
    name: string;
    isPlaying: boolean;
    currentTime: number;
  }>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseWatchPartyOptions {
  sessionId: string | null;
  onSync?: (state: { currentTime: number; isPlaying: boolean; videoUrl: string; name: string }) => void;
  onPlay?: (currentTime: number) => void;
  onPause?: (currentTime: number) => void;
  onSeek?: (currentTime: number) => void;
  onBuffer?: (currentTime: number) => void;
  onBufferEnd?: (currentTime: number) => void;
}

interface UseWatchPartyResult {
  connected: boolean;
  participantCount: number;
  sendPlay: (currentTime: number) => void;
  sendPause: (currentTime: number) => void;
  sendSeek: (currentTime: number) => void;
  sendBuffer: (currentTime: number) => void;
  sendBufferEnd: (currentTime: number) => void;
}

export function useWatchParty({
  sessionId,
  onSync,
  onPlay,
  onPause,
  onSeek,
  onBuffer,
  onBufferEnd,
}: UseWatchPartyOptions): UseWatchPartyResult {
  const [connected, setConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Stabilize callbacks with refs so the WebSocket effect doesn't re-run on rerenders
  const onSyncRef = useRef(onSync);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onSeekRef = useRef(onSeek);
  const onBufferRef = useRef(onBuffer);
  const onBufferEndRef = useRef(onBufferEnd);

  useEffect(() => { onSyncRef.current = onSync; }, [onSync]);
  useEffect(() => { onPlayRef.current = onPlay; }, [onPlay]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);
  useEffect(() => { onBufferRef.current = onBuffer; }, [onBuffer]);
  useEffect(() => { onBufferEndRef.current = onBufferEnd; }, [onBufferEnd]);

  useEffect(() => {
    if (!sessionId) return;

    const ws = new WebSocket(`${WS_URL}?sessionId=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      type InboundMessage =
        | { type: 'SYNC'; currentTime: number; isPlaying: boolean; videoUrl: string; name: string }
        | { type: 'PLAY'; currentTime: number; isPlaying: boolean }
        | { type: 'PAUSE'; currentTime: number; isPlaying: boolean }
        | { type: 'SEEK'; currentTime: number; isPlaying: boolean }
        | { type: 'BUFFER'; currentTime: number; isPlaying: boolean }
        | { type: 'BUFFER_END'; currentTime: number; isPlaying: boolean }
        | { type: 'PARTICIPANT_COUNT'; count: number };
      let msg: InboundMessage;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case 'SYNC':
          onSyncRef.current?.(msg);
          break;
        case 'PLAY':
          onPlayRef.current?.(msg.currentTime);
          break;
        case 'PAUSE':
          onPauseRef.current?.(msg.currentTime);
          break;
        case 'SEEK':
          onSeekRef.current?.(msg.currentTime);
          break;
        case 'BUFFER':
          onBufferRef.current?.(msg.currentTime);
          break;
        case 'BUFFER_END':
          onBufferEndRef.current?.(msg.currentTime);
          break;
        case 'PARTICIPANT_COUNT':
          setParticipantCount(msg.count);
          break;
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendPlay = useCallback((currentTime: number) => send({ type: 'PLAY', currentTime }), [send]);
  const sendPause = useCallback((currentTime: number) => send({ type: 'PAUSE', currentTime }), [send]);
  const sendSeek = useCallback((currentTime: number) => send({ type: 'SEEK', currentTime }), [send]);
  const sendBuffer = useCallback((currentTime: number) => send({ type: 'BUFFER', currentTime }), [send]);
  const sendBufferEnd = useCallback((currentTime: number) => send({ type: 'BUFFER_END', currentTime }), [send]);

  return { connected, participantCount, sendPlay, sendPause, sendSeek, sendBuffer, sendBufferEnd };
}
