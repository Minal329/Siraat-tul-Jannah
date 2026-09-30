// Opening the app: go to the right home screen for whoever is logged in.
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { colors } from "../lib/theme.ts";
import { homeFor, useAuth } from "../lib/useAuth.ts";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.ivory }}>
        <ActivityIndicator color={colors.navy} accessibilityLabel="Loading" />
      </View>
    );
  }
  return <Redirect href={user ? homeFor(user.role) : "/courses"} />;
}
