// Record a short voice note with the phone's microphone, then hand the file
// to `onRecorded`. Uses expo-audio (asks for microphone permission first).
import { requestRecordingPermissionsAsync, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { useState } from "react";
import { View } from "react-native";
import { Button, Muted, styles } from "./ui.tsx";

const MAX_SECONDS = 300;

export function VoiceRecorder({ onRecorded, disabled }: { onRecorded: (uri: string, seconds: number) => void; disabled?: boolean }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder, 500);
  const [problem, setProblem] = useState<string | null>(null);
  const seconds = Math.round(status.durationMillis / 1000);

  async function start() {
    setProblem(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return setProblem("Please allow microphone access to record voice notes.");
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: MAX_SECONDS });
  }

  async function stop() {
    const length = Math.max(1, seconds);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    if (recorder.uri) onRecorded(recorder.uri, length);
  }

  return (
    <View style={styles.row}>
      {status.isRecording ? (
        <Button small variant="danger" label={`Stop & send (${seconds}s)`} onPress={stop} />
      ) : (
        <Button small variant="outline" label="Record voice" onPress={start} disabled={disabled} />
      )}
      {problem && <Muted small>{problem}</Muted>}
    </View>
  );
}
