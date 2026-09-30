// Records a voice note with the browser's microphone (MediaRecorder).
// Chrome/Android record WebM, Safari/iPhone records M4A — the server accepts both.
import { useRef, useState } from "react";

export function VoiceRecorder({ onRecorded, disabled }: { onRecorded: (file: File, seconds: number) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const seconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        onRecorded(new File(chunks, `voice-note.${ext}`, { type }), seconds);
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      rec.start();
      setRecording(true);
    } catch {
      setError("Couldn't use the microphone. Please allow microphone access.");
    }
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  return (
    <>
      <button
        type="button"
        className={recording ? "btn btn-danger btn-small" : "btn btn-outline btn-small"}
        onClick={recording ? stop : start}
        disabled={disabled}
        aria-label={recording ? "Stop recording and send" : "Record voice feedback"}
      >
        {recording ? "Stop & send" : "Record voice"}
      </button>
      {error && <span className="muted small" role="alert">{error}</span>}
    </>
  );
}
