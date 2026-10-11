// "Are you sure?" — a native dialog on phones, the browser's confirm in the web preview.
import { Alert, Platform } from "react-native";

export function confirm(title: string, message: string, action: string, onYes: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: action, onPress: onYes },
  ]);
}
