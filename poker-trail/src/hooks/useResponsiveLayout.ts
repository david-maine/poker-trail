import { useCallback, useState } from "react";
import { useWindowDimensions } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getResponsiveLayout } from "../lib/responsiveLayout";

export default function useResponsiveLayout(includeBottomInset = true) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measured, setMeasured] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setMeasured(previous => previous.width === width && previous.height === height ? previous : { width, height });
  }, []);
  return { ...getResponsiveLayout(measured.width || window.width, measured.height || window.height,
    { ...insets, bottom: includeBottomInset ? insets.bottom : 0 }, window.fontScale), onLayout };
}
