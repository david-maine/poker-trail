import { Image } from "react-native";

// The source PNG is cropped to the artwork's alpha bounds.
export const ARTWORK_ASPECT_RATIO = 1148 / 1565;

export default function TrailBrandArtwork({ width }: { width: number }) {
  return (
    <Image
      accessibilityRole="image"
      accessibilityLabel="Poker Trail — join the hunt"
      source={require("../../assets/images/POKER-TRAIL-landingpage.png")}
      resizeMode="contain"
      style={{ width, height: width / ARTWORK_ASPECT_RATIO, alignSelf: "center" }}
    />
  );
}
