// "Log out" in the top bar of the home screens.
import { router } from "expo-router";
import { Text } from "react-native";
import { colors, fonts } from "../lib/theme.ts";
import { useAuth } from "../lib/useAuth.ts";

export function LogoutButton() {
  const { logout } = useAuth();
  return (
    <Text
      accessibilityRole="button"
      onPress={async () => {
        await logout();
        router.replace("/login");
      }}
      style={{ color: colors.ivory, fontFamily: fonts.bodyBold, paddingHorizontal: 12 }}
    >
      Log out
    </Text>
  );
}
