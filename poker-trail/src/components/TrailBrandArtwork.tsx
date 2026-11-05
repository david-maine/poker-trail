import { Image, StyleSheet, View } from "react-native";

// The supplied landing artwork has a transparent lower section reserved for form
// fields. Frame its upper illustration so those fields stay real, usable controls.
export default function TrailBrandArtwork({ width }: { width: number }) {
  return (
    <View style={[styles.frame, { width, height: width * 1750 / 1241 }]}>
      <Image accessibilityRole="image" accessibilityLabel="Poker Trail — join the hunt"
        source={require("../../assets/images/POKER-TRAIL-landingpage.png")}
        resizeMode="contain" style={{ width, height: width * 2690 / 1241 }} />
    </View>
  );
}

const styles = StyleSheet.create({ frame: { overflow: "hidden", alignSelf: "center" } });
