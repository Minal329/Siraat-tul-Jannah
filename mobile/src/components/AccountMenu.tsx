// "Account" in the top bar of the home screens: opens the account screen
// (change password, log out).
import { router } from "expo-router";
import { Text } from "react-native";
import { colors, fonts } from "../lib/theme.ts";

export function AccountButton() {
  return (
    <Text
      accessibilityRole="button"
      onPress={() => router.push("/account")}
      style={{ color: colors.ivory, fontFamily: fonts.bodyBold, paddingHorizontal: 12 }}
    >
      Account
    </Text>
  );
}
