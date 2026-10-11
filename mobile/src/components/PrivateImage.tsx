// An image only logged-in people may see (a payment screenshot, a certificate
// design). The API checks the login token, so the request carries it — on a phone
// as a header, in the browser preview by fetching the file first.
import { Image, type ImageStyle } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View, type StyleProp } from "react-native";
import { authHeaders, fileUrl } from "../lib/api.ts";
import { colors } from "../lib/theme.ts";
import { Muted } from "./ui.tsx";

export type ImageSource = { uri: string; headers?: Record<string, string> };

/** Loads a private API image (null path = nothing to load). */
export function usePrivateImageSource(path: string | null) {
  const [source, setSource] = useState<ImageSource | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSource(null);
    setFailed(false);
    if (!path) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const headers = await authHeaders();
      if (Platform.OS !== "web") return { uri: fileUrl(path), headers };
      const res = await fetch(fileUrl(path), { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      objectUrl = URL.createObjectURL(await res.blob());
      return { uri: objectUrl };
    })()
      .then((s) => !cancelled && setSource(s))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return { source, failed, setFailed };
}

export function PrivateImage({ path, style, label }: { path: string; style: StyleProp<ImageStyle>; label: string }) {
  const { source, failed, setFailed } = usePrivateImageSource(path);

  if (failed) return <Muted small>Couldn't load the image.</Muted>;
  if (!source) {
    return (
      <View style={[style as object, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.navy} />
      </View>
    );
  }
  return <Image source={source} style={style} contentFit="contain" accessibilityLabel={label} alt={label} onError={() => setFailed(true)} />;
}
