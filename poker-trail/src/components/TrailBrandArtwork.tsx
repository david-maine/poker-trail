import { Image, StyleSheet, View } from "react-native";

// Alpha bounds in the 1241 x 2690 source: x=18..1165, y=129..1693.
// Clip transparent margins on every side without modifying the source asset.
export const ARTWORK_ASPECT_RATIO = 1148 / 1565;

export default function TrailBrandArtwork({ width }: { width: number }) {
  const scale = width / 1148;
  return (
    <View style={[styles.frame, { width, height: width / ARTWORK_ASPECT_RATIO }]}>
      <Image accessibilityRole="image" accessibilityLabel="Poker Trail — join the hunt"
        source={require("../../assets/images/POKER-TRAIL-landingpage.png")}
        resizeMode="contain" style={{ position: "absolute", left: -18 * scale, top: -129 * scale, width: 1241 * scale, height: 2690 * scale }} />
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: "hidden", alignSelf: "center" } });
