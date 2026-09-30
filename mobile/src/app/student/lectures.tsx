// Recorded Lectures (prototype screen 7): filter by course; tap to watch in
// an in-app browser (YouTube / Vimeo play there with their own controls).
import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Chip, Empty, Loaded, Muted, Screen, Title, styles } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { formatDate, formatDuration } from "../../lib/format.ts";
import { useLoad } from "../../lib/hooks.ts";
import type { Lecture } from "../../lib/types.ts";

export default function LecturesScreen() {
  const state = useLoad(() => api<{ lectures: Lecture[] }>("/lectures"), []);
  const [course, setCourse] = useState("All");

  return (
    <Screen onRefresh={state.reload} refreshing={state.loading && !!state.data}>
      <Stack.Screen options={{ title: "Recorded Lectures" }} />
      <Loaded state={state}>
        {({ lectures }) => {
          const courses = ["All", ...new Set(lectures.map((l) => l.course.title))];
          const shown = course === "All" ? lectures : lectures.filter((l) => l.course.title === course);
          return (
            <>
              <View style={styles.row}>{courses.map((c) => <Chip key={c} label={c} selected={course === c} onPress={() => setCourse(c)} />)}</View>
              {shown.length === 0 && <Empty>No recordings yet.</Empty>}
              {shown.map((l) => (
                <Pressable key={l.id} accessibilityRole="button" onPress={() => WebBrowser.openBrowserAsync(l.videoUrl)} style={styles.card}>
                  <Title>{l.title}</Title>
                  <Muted>{[l.course.title, l.publishedAt ? formatDate(l.publishedAt) : null, formatDuration(l.durationSeconds)].filter(Boolean).join(" · ")}</Muted>
                </Pressable>
              ))}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
