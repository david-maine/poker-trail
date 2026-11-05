import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { APP_BACKGROUND_COLOR, TRAIL_INK, TRAIL_WHITE } from "../lib/theme";

export default function TrailTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { height, width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The reference screens are 1241 points wide, with each tab taking half.
  const typographyScale = Math.min(1, (width - insets.left - insets.right) / 1241);
  const mapFontSize = Math.min(44, 88 * typographyScale);
  const leaderboardFontSize = Math.min(30, 60 * typographyScale);
  const barHeight = Math.max(56, Math.min(88, height * 0.085), mapFontSize * fontScale * 1.3 + 24);
  return (
    <View style={{ backgroundColor: state.routes[state.index]?.name === "index" ? APP_BACKGROUND_COLOR : TRAIL_WHITE }}>
    <View style={styles.frame}>
    <View style={[styles.bar, { paddingBottom: insets.bottom, paddingLeft: insets.left + 4, paddingRight: insets.right + 4 }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = route.name === "index" ? "MAP" : "LEADERBOARD";
        const fontSize = route.name === "index" ? mapFontSize : leaderboardFontSize;
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }}
            accessibilityLabel={descriptors[route.key].options.tabBarAccessibilityLabel ?? label}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
            onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            style={({ pressed }) => [styles.tab, { minHeight: barHeight }, focused ? styles.active : styles.inactive, pressed && styles.pressed]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.label, { fontSize, color: focused ? TRAIL_WHITE : TRAIL_INK }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: APP_BACKGROUND_COLOR,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 2,
    paddingHorizontal: 2,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: TRAIL_WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    paddingTop: 4,
  },
  tab: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 10, borderRadius: 18 },
  active: { backgroundColor: APP_BACKGROUND_COLOR },
  inactive: { backgroundColor: TRAIL_WHITE },
  label: { fontFamily: "RobotoSlab_800ExtraBold", textAlign: "center" },
  pressed: { opacity: 0.8 },
});
