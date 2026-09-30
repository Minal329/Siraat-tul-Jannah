// Course Catalog (prototype screen 2): browse published courses and enroll.
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Chip, Empty, ErrorText, Loaded, Muted, Screen, Title, styles } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { formatPkr } from "../lib/format.ts";
import { useAction, useLoad } from "../lib/hooks.ts";
import { colors, fonts } from "../lib/theme.ts";
import type { Course, Enrollment } from "../lib/types.ts";
import { useAuth } from "../lib/useAuth.ts";

export default function CoursesScreen() {
  const { user, loading: checkingLogin } = useAuth();
  const courses = useLoad(() => api<{ courses: Course[] }>("/courses"), []);
  // Wait until we know who is logged in, so "Enroll" doesn't send a logged-in student to the login page.
  const state = checkingLogin ? { ...courses, data: null } : courses;
  const [level, setLevel] = useState("All Courses");
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const { error, run } = useAction();

  async function enroll(course: Course) {
    if (!user) {
      router.push({ pathname: "/login", params: { mode: "signup", next: "/courses" } });
      return;
    }
    setEnrolling(course.id);
    await run(async () => {
      try {
        const { enrollment } = await api<{ enrollment: Enrollment }>("/enrollments", { body: { courseId: course.id } });
        router.push(`/student/pay/${enrollment.id}`);
      } catch (err) {
        if (err instanceof ApiError && err.code === "ENROLLMENT_EXISTS") router.push("/student");
        else throw err;
      }
    });
    setEnrolling(null);
  }

  return (
    <Screen onRefresh={courses.reload} refreshing={courses.loading && !!courses.data}>
      <Stack.Screen options={{ title: "Course Catalog", headerRight: user ? undefined : () => <Text onPress={() => router.push("/login")} style={{ color: colors.ivory, fontFamily: fonts.bodyBold, paddingHorizontal: 12 }}>Log in</Text> }} />
      <ErrorText error={error} />
      <Loaded state={state}>
        {({ courses }) => {
          const levels = ["All Courses", ...new Set(courses.map((c) => c.level).filter((l): l is string => !!l))];
          const shown = level === "All Courses" ? courses : courses.filter((c) => c.level === level);
          return (
            <>
              <View style={styles.row}>
                {levels.map((l) => <Chip key={l} label={l} selected={level === l} onPress={() => setLevel(l)} />)}
              </View>
              {shown.length === 0 && <Empty>No courses here yet.</Empty>}
              {shown.map((course) => (
                <Card key={course.id} style={{ paddingTop: 0, overflow: "hidden" }}>
                  <View style={{ height: 90, marginHorizontal: -16, backgroundColor: colors.navy2, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ivory }}>{course.title}</Text>
                    <Text style={[styles.pill, { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(255,255,255,0.92)", color: "#7A6A34" }]}>{formatPkr(course.feePkr)}</Text>
                  </View>
                  <Title>{course.title}</Title>
                  <Muted>{[course.level, course.durationWeeks ? `${course.durationWeeks} weeks` : null].filter(Boolean).join(" · ")}</Muted>
                  <Muted>{course.description}</Muted>
                  {(!user || user.role === "STUDENT") && (
                    <Button label={enrolling === course.id ? "Enrolling…" : "Enroll"} onPress={() => enroll(course)} disabled={enrolling === course.id} />
                  )}
                </Card>
              ))}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
