import { Href, router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
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
      disabled={leaving}
      onPress={confirmLeave}
      style={[styles.button, leaving ? styles.buttonDisabled : null, style]}
    >
      <Text style={styles.buttonText}>{leaving ? "Leaving..." : "Leave Event"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "rgba(29, 34, 62, 0.82)",
    borderColor: "#d9d2bb",
    borderRadius: 5,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  buttonDisabled: {
    opacity: 0.62,
  },
  buttonText: {
    color: "#f2ead4",
    fontFamily: "Stoke-Regular",
    fontSize: 13,
    fontWeight: "700",
  },
});
