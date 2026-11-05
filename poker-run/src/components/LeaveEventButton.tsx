import { Href, router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";

import { useEventSession } from "../lib/eventSession";
import { leaveCurrentEvent } from "../lib/game";

type LeaveEventButtonProps = {
  style?: StyleProp<ViewStyle>;
};

export default function LeaveEventButton({ style }: LeaveEventButtonProps) {
  const { registrationState, setRegistrationState } = useEventSession();
  const [leaving, setLeaving] = useState(false);

  if (!registrationState.event) {
    return null;
  }

  async function leaveEvent() {
    if (leaving) {
      return;
    }

    setLeaving(true);

    try {
      const nextRegistrationState = await leaveCurrentEvent();
      setRegistrationState(nextRegistrationState);
      router.replace("/event-code" as Href);
    } finally {
      setLeaving(false);
    }
  }

  function confirmLeave() {
    if (Platform.OS === "web") {
      if (globalThis.confirm("Leave this event? Your progress on this device will be kept.")) {
        void leaveEvent();
      }
      return;
    }

    Alert.alert(
      "Leave Event?",
      "Your progress on this device will be kept if you join this event again.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            void leaveEvent();
          },
        },
      ]
    );
  }

  return (
    <Pressable
      accessibilityLabel="Leave event"
      accessibilityRole="button"
      accessibilityState={{ busy: leaving, disabled: leaving }}
      disabled={leaving}
      onPress={confirmLeave}
      style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null, leaving ? styles.buttonDisabled : null, style]}
    >
      {leaving ? <ActivityIndicator color="#1f2937" size="small" /> : (
        <Image accessible={false} source={require("../../assets/images/POKER-TRAIL-icon-exit.png")} resizeMode="contain" style={styles.icon} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  icon: { width: "100%", height: "100%" },
  button: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    elevation: 4,
    height: 48,
    justifyContent: "center",
    width: 48,
    shadowColor: "#000000",
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.78,
  },
});
