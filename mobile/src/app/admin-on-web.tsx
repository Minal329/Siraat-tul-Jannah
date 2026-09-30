// Admins manage the academy from the website (bigger screen, more controls).
import { router, Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Button, Card, Muted, Screen, Title } from "../components/ui.tsx";
import { useAuth } from "../lib/useAuth.ts";

const WEBSITE = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:5173";

export default function AdminOnWeb() {
  const { logout } = useAuth();
  return (
    <Screen>
      <Stack.Screen options={{ title: "Admin" }} />
      <Card>
        <Title>Please use the website</Title>
        <Muted>Approvals, payment checks, courses and teachers are managed on the Siraat tul Jannah website, which has room for all the admin tools.</Muted>
        <Button label="Open the website" onPress={() => WebBrowser.openBrowserAsync(`${WEBSITE}/admin`)} />
        <Button
          label="Log out"
          variant="outline"
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
        />
      </Card>
    </Screen>
  );
}
