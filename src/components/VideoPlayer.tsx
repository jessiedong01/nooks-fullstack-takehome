import { Box, Button, IconButton, Slider } from "@mui/material";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import React, { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";

export interface RemoteCommand {
  type: "PLAY" | "PAUSE" | "SEEK";
  currentTime: number;
}

interface VideoPlayerProps {
  url: string;
  onPlay?: (currentTime: number) => void;
  onPause?: (currentTime: number) => void;
  onSeek?: (currentTime: number) => void;
  onBuffer?: (currentTime: number) => void;
  onBufferEnd?: (currentTime: number) => void;
  remoteCommand?: RemoteCommand | null;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  url,
  onPlay,
  onPause,
  onSeek,
  onBuffer,
  onBufferEnd,
  remoteCommand,
}) => {
  const [hasJoined, setHasJoined] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [sliderValue, setSliderValue] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const playerRef = useRef<ReactPlayer>(null);
  // Set to true before applying a remote command; suppresses the resulting play/pause callback
  const suppressNextEvent = useRef(false);

  // Apply incoming remote commands
  useEffect(() => {
    if (!remoteCommand || !playerRef.current || !hasJoined) return;

    if (remoteCommand.type === "PLAY") {
      suppressNextEvent.current = true;
      playerRef.current.seekTo(remoteCommand.currentTime, "seconds");
      setSliderValue(remoteCommand.currentTime);
      setPlaying(true);
    } else if (remoteCommand.type === "PAUSE") {
      suppressNextEvent.current = true;
      playerRef.current.seekTo(remoteCommand.currentTime, "seconds");
      setSliderValue(remoteCommand.currentTime);
      setPlaying(false);
    } else if (remoteCommand.type === "SEEK") {
      // SEEK doesn't trigger a play/pause event — no suppression needed
      playerRef.current.seekTo(remoteCommand.currentTime, "seconds");
      setSliderValue(remoteCommand.currentTime);
    }
  }, [remoteCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReady = () => setIsReady(true);
  const handleDuration = (d: number) => setDuration(d);

  const handlePlay = () => {
    if (suppressNextEvent.current) {
      suppressNextEvent.current = false;
      return;
    }
    onPlay?.(playerRef.current?.getCurrentTime() ?? 0);
  };

  const handlePause = () => {
    if (suppressNextEvent.current) {
      suppressNextEvent.current = false;
      return;
    }
    onPause?.(playerRef.current?.getCurrentTime() ?? 0);
  };

  const handleProgress = ({ playedSeconds }: { playedSeconds: number }) => {
    if (!isDragging) setSliderValue(playedSeconds);
  };

  const handleBuffer = () => {
    onBuffer?.(playerRef.current?.getCurrentTime() ?? 0);
  };

  const handleBufferEnd = () => {
    onBufferEnd?.(playerRef.current?.getCurrentTime() ?? 0);
  };

  const togglePlayPause = () => {
    const currentTime = playerRef.current?.getCurrentTime() ?? 0;
    if (playing) {
      setPlaying(false);
      onPause?.(currentTime);
    } else {
      setPlaying(true);
      onPlay?.(currentTime);
    }
  };

  const handleSliderChange = (_: Event, value: number | number[]) => {
    setIsDragging(true);
    setSliderValue(value as number);
  };

  const handleSliderCommit = (_: React.SyntheticEvent | Event, value: number | number[]) => {
    const time = value as number;
    setIsDragging(false);
    playerRef.current?.seekTo(time, "seconds");
    setSliderValue(time);
    onSeek?.(time);
  };

  return (
    <Box width="100%" height="100%" display="flex" flexDirection="column">
      {/* Player is always in the DOM so onReady fires; visually hidden until the user joins */}
      <Box flexGrow={1} sx={{ visibility: hasJoined ? "visible" : "hidden" }}>
        <ReactPlayer
          ref={playerRef}
          url={url}
          playing={playing}
          controls={false}
          onReady={handleReady}
          onDuration={handleDuration}
          onPlay={handlePlay}
          onPause={handlePause}
          onProgress={handleProgress}
          onBuffer={handleBuffer}
          onBufferEnd={handleBufferEnd}
          progressInterval={500}
          width="100%"
          height="100%"
          style={{ pointerEvents: "none" }}
        />
      </Box>

      {/* Custom controls — shown after joining */}
      {hasJoined && (
        <Box display="flex" alignItems="center" gap={1} px={1} py={0.5}>
          <IconButton onClick={togglePlayPause} size="small" color="primary">
            {playing ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
          <Slider
            min={0}
            max={duration || 1}
            step={0.1}
            value={sliderValue}
            onChange={handleSliderChange}
            onChangeCommitted={handleSliderCommit}
            size="small"
            sx={{ color: "primary.main" }}
          />
        </Box>
      )}

      {/* Join gate — required for YouTube autoplay policy */}
      {!hasJoined && isReady && (
        <Box
          position="absolute"
          display="flex"
          alignItems="center"
          justifyContent="center"
          width="100%"
          height="100%"
        >
          <Button
            variant="contained"
            size="large"
            onClick={() => {
              setHasJoined(true);
              setPlaying(true);
            }}
          >
            Watch Session
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default VideoPlayer;
