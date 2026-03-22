import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, TextField } from "@mui/material";
import { createSession } from "../hooks/useWatchParty";

const CreateSession: React.FC = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionId = await createSession(name, videoUrl);
      navigate(`/watch/${sessionId}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create session. Please try again.");
      setLoading(false);
    }
  };

  const isValid = name.trim() !== "" && videoUrl.trim() !== "";

  return (
    <Box width="100%" maxWidth={600} display="flex" flexDirection="column" gap={2} marginTop={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        label="Session Name"
        variant="outlined"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={loading}
        fullWidth
      />
      <TextField
        label="YouTube URL"
        variant="outlined"
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
        disabled={loading}
        fullWidth
      />
      <Button
        disabled={!isValid || loading}
        onClick={handleSubmit}
        variant="contained"
        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
      >
        {loading ? "Creating…" : "Create Session"}
      </Button>
    </Box>
  );
};

export default CreateSession;
