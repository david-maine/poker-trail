import { Image as CachedImage } from "expo-image";
import { Image, type ImageProps } from "react-native";
import { CARD_IMAGES, CARD_BACK_IMAGE } from "../lib/cardImages";

export default function CardImage({ source, accessibilityLabel, accessible, style, onError }: ImageProps) {
  return <CachedImage source={source} accessibilityLabel={accessibilityLabel} accessible={accessible}
    style={style} contentFit="contain" cachePolicy="memory-disk" transition={0}
    onError={() => onError?.({ nativeEvent: { error: "Card image failed to load" } } as Parameters<NonNullable<ImageProps["onError"]>>[0])} />;
}

let pending: Promise<void> | undefined;
export function preloadCardImages() {
  // Warm the small shared deck once; do not delay showing the leaderboard.
  if (!pending) {
    const uris = [...Object.values(CARD_IMAGES), CARD_BACK_IMAGE]
      .map(source => Image.resolveAssetSource(source)?.uri).filter((uri): uri is string => Boolean(uri));
    pending = CachedImage.prefetch(uris, { cachePolicy: "memory-disk" })
      .then(success => { if (!success) pending = undefined; })
      .catch(() => { pending = undefined; });
  }
  return pending;
}
