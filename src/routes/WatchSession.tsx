import { useCallback, useEffect, useState } from "react";
import VideoPlayer, { RemoteCommand } from "../components/VideoPlayer";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { fetchSession, useWatchParty } from "../hooks/useWatchParty";
import toast from "react-hot-toast";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface SessionInfo {
  videoUrl: string;
  name: string;
}

const WatchSession: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [remoteCommand, setRemoteCommand] = useState<RemoteCommand | null>(null);

  // Load session on mount
  useEffect(() => {
    if (!sessionId) return;
    fetchSession(sessionId)
      .then((s) => setSession({ videoUrl: s.videoUrl, name: s.name }))
      .catch(() => setLoadError("Session not found."));
  }, [sessionId]);

  // Stable callbacks — each creates a new RemoteCommand object so the useEffect
  // in VideoPlayer fires even for consecutive commands of the same type
  const onSync = useCallback(
    (state: { currentTime: number; isPlaying: boolean }) => {
      setRemoteCommand({
        type: state.isPlaying ? "PLAY" : "PAUSE",
        currentTime: state.currentTime,
      });
    },
    []
  );

  const onPlay = useCallback((currentTime: number) => {
    setRemoteCommand({ type: "PLAY", currentTime });
    toast("▶ Someone started playing");
  }, []);

  const onPause = useCallback((currentTime: number) => {
    setRemoteCommand({ type: "PAUSE", currentTime });
    toast("⏸ Someone paused");
  }, []);

  const onSeek = useCallback((currentTime: number) => {
    setRemoteCommand({ type: "SEEK", currentTime });
    toast(`⏩ Someone jumped to ${formatTime(currentTime)}`);
  }, []);

  // BUFFER → remote clients receive PAUSE from the server
  const onBuffer = useCallback((currentTime: number) => {
    setRemoteCommand({ type: "PAUSE", currentTime });
  }, []);

  // BUFFER_END → remote clients receive PLAY from the server
  const onBufferEnd = useCallback((currentTime: number) => {
    setRemoteCommand({ type: "PLAY", currentTime });
  }, []);

  const { connected, sendPlay, sendPause, sendSeek, sendBuffer, sendBufferEnd } = useWatchParty({
    sessionId: sessionId ?? null,
    onSync,
    onPlay,
    onPause,
    onSeek,
    onBuffer,
    onBufferEnd,
  });

  if (loadError) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" gap={2} mt={4}>
        <Alert severity="error">{loadError}</Alert>
        <Button variant="contained" onClick={() => navigate("/create")}>
          Create a new session
        </Button>
      </Box>
    );
  }

  if (!session) return null;

  return (
    <>
      {/* Header bar */}
      <Box
        width="100%"
        maxWidth={1000}
        display="flex"
        gap={1}
        marginTop={1}
        alignItems="center"
      >
        <Typography
          variant="subtitle1"
          fontWeight={600}
          noWrap
          sx={{ minWidth: "max-content" }}
        >
          {session.name}
        </Typography>

        <TextField
          label="YouTube URL"
          variant="outlined"
          value={session.videoUrl}
          inputProps={{ readOnly: true, disabled: true }}
          size="small"
          fullWidth
        />

        <Chip
          label={connected ? "Live" : "Connecting"}
          color={connected ? "success" : "default"}
          size="small"
          sx={{ minWidth: 90 }}
        />

        <Tooltip title={linkCopied ? "Link copied!" : "Copy link to share"}>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
            disabled={linkCopied}
            variant="contained"
            sx={{ whiteSpace: "nowrap", minWidth: "max-content" }}
          >
            <LinkIcon />
          </Button>
        </Tooltip>

        <Tooltip title="Create new watch party">
          <Button
            onClick={() => navigate("/create")}
            variant="contained"
            sx={{ whiteSpace: "nowrap", minWidth: "max-content" }}
          >
            <AddCircleOutlineIcon />
          </Button>
        </Tooltip>
      </Box>

      <VideoPlayer
        url={session.videoUrl}
        onPlay={sendPlay}
        onPause={sendPause}
        onSeek={sendSeek}
        onBuffer={sendBuffer}
        onBufferEnd={sendBufferEnd}
        remoteCommand={remoteCommand}
      />
    </>
  );
};

export default WatchSession;
