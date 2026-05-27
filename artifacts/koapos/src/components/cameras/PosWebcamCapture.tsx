import { useState, useRef, useEffect, useCallback } from "react";
import { useGetCameraSettings, useCreatePosSecurityCapture } from "@workspace/api-client-react";
import { Camera, Video, VideoOff, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* Converts a canvas frame to a compressed jpeg data-url */
function captureFrame(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/* Download a Blob as a file */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function PosWebcamCapture() {
  const { data: settings } = useGetCameraSettings();
  const createCapture = useCreatePosSecurityCapture();

  const enabled    = settings?.posWebcamEnabled === "true";
  const deviceId   = settings?.posWebcamDeviceId ?? undefined;

  const videoRef      = useRef<HTMLVideoElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const deviceLabelRef = useRef<string>("");

  const [ready,     setReady]     = useState(false);
  const [recording, setRecording] = useState(false);
  const [error,     setError]     = useState(false);

  /* Start the webcam stream */
  const startStream = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      deviceLabelRef.current = stream.getVideoTracks()[0]?.label ?? "Webcam";
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setReady(true);
      setError(false);
    } catch {
      setError(true);
      setReady(false);
    }
  }, [deviceId]);

  /* Stop the stream on unmount or when disabled */
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!enabled) { stopStream(); return; }
    startStream();
    return stopStream;
  }, [enabled, deviceId, startStream, stopStream]);

  /* ── Photo capture ──────────────────────────────────────────────────── */
  const handlePhoto = async () => {
    if (!videoRef.current || !ready) {
      toast.error("Webcam not ready");
      return;
    }
    const imageData = captureFrame(videoRef.current);
    try {
      await createCapture.mutateAsync({
        data: {
          type: "photo",
          imageData,
          deviceLabel: deviceLabelRef.current,
          storedLocally: true,
        },
      });
      toast.success("Security photo captured", { description: "Saved to POS Camera history." });
    } catch {
      toast.error("Failed to save photo");
    }
  };

  /* ── Video recording ────────────────────────────────────────────────── */
  const handleVideo = () => {
    if (!streamRef.current || !ready) {
      toast.error("Webcam not ready");
      return;
    }

    if (recording) {
      /* Stop recording */
      recorderRef.current?.stop();
      return;
    }

    /* Start recording */
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ts   = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `POS_Security_${ts}.webm`;

      /* Download to device */
      downloadBlob(blob, filename);

      /* Save metadata to server */
      try {
        await createCapture.mutateAsync({
          data: {
            type: "video",
            filename,
            deviceLabel: deviceLabelRef.current,
            storedLocally: true,
          },
        });
        toast.success("Video saved", {
          description: `Downloading ${filename} — check your Downloads folder.`,
        });
      } catch {
        toast("Video downloaded", { description: "Could not log to server, but file was saved locally." });
      }
    };

    recorder.start(1000);
    setRecording(true);
    toast("Recording started", { description: "Click the video button again to stop." });
  };

  if (!enabled) return null;

  return (
    <>
      {/* Hidden video element */}
      <video ref={videoRef} muted playsInline className="hidden" />

      {/* Photo button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 shrink-0 transition-colors",
          ready
            ? "text-muted-foreground hover:text-foreground hover:bg-muted"
            : "text-muted-foreground/30 cursor-not-allowed",
          error && "text-destructive/50",
        )}
        onClick={handlePhoto}
        disabled={!ready || createCapture.isPending}
        title={error ? "Webcam unavailable" : "Capture security photo"}
      >
        <Camera className="w-4 h-4" />
      </Button>

      {/* Video button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 shrink-0 transition-colors",
          recording
            ? "text-destructive animate-pulse"
            : ready
              ? "text-muted-foreground hover:text-foreground hover:bg-muted"
              : "text-muted-foreground/30 cursor-not-allowed",
          error && "text-destructive/50",
        )}
        onClick={handleVideo}
        disabled={!ready}
        title={
          error      ? "Webcam unavailable"
          : recording ? "Stop recording"
          : "Start security recording"
        }
      >
        {recording ? (
          <CircleDot className="w-4 h-4" />
        ) : error ? (
          <VideoOff className="w-4 h-4" />
        ) : (
          <Video className="w-4 h-4" />
        )}
      </Button>
    </>
  );
}
