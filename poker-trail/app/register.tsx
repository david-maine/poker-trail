import { FONT_SIZE, FONT_WEIGHT, textMetrics } from "../src/lib/typography";
import { APP_BACKGROUND_COLOR, TRAIL_INK, TRAIL_WHITE } from "../src/lib/theme";
import { Montserrat_500Medium_Italic } from "@expo-google-fonts/montserrat/500Medium_Italic";
import { RobotoSlab_800ExtraBold } from "@expo-google-fonts/roboto-slab/800ExtraBold";
import { useFonts } from "expo-font";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import TrailBrandArtwork, { ARTWORK_ASPECT_RATIO } from "../src/components/TrailBrandArtwork";
import useResponsiveLayout from "../src/hooks/useResponsiveLayout";
import LoadingScreen from "../src/components/LoadingScreen";
import { useEventSession } from "../src/lib/eventSession";
import { loadRegistrationStateForEventCode, registerVesselNameForEvent } from "../src/lib/game";
import { getLandingTypography, LANDING_BUTTON_FONT, LANDING_INPUT_FONT } from "../src/lib/landingTypography";

export default function RegisterScreen() {
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const artworkSpacing = layout.gap * 2;
  // Keep the full viewport height when the keyboard reduces the available space.
  // A width change (including rotation) establishes a new responsive size.
  const artworkViewport = useRef({ width: layout.width, height: layout.height });
  if (artworkViewport.current.width !== layout.width) {
    artworkViewport.current = { width: layout.width, height: layout.height };
  } else {
    artworkViewport.current.height = Math.max(artworkViewport.current.height, layout.height);
  }
  const artworkSidePadding = 16;
  const artworkWidth = Math.max(1, Math.min(layout.contentWidth, 460, Math.max(160, artworkViewport.current.height * 0.58) * ARTWORK_ASPECT_RATIO) - artworkSidePadding * 2);
  const formWidth = Math.min(layout.contentWidth * 0.82, 380);
  const typography = getLandingTypography(formWidth, layout.fontScale);
  const controlHeight = Math.max(layout.fieldHeight, typography.minControlHeight);
  const [, fontError] = useFonts({ Montserrat_500Medium_Italic, RobotoSlab_800ExtraBold });
  const { registrationState, setRegistrationState } = useEventSession();
  const [eventCode, setEventCode] = useState(registrationState.event?.eventCode ?? "");
  const [vesselName, setVesselName] = useState("");
  const nameInput = useRef<TextInput>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRequiredFields, setShowRequiredFields] = useState(false);
  const missingEventCode = showRequiredFields && !eventCode.trim();
  const missingVesselName = showRequiredFields && !vesselName.trim();

  useEffect(() => {
    if (!registrationState.event || !registrationState.isRegistered) {
      return;
    }

    router.replace("/(tabs)");
  }, [registrationState.event, registrationState.isRegistered]);

  async function submit() {
    if (submitting) return;
    setErrorMessage(null);
    setShowRequiredFields(true);
    if (!eventCode.trim() || !vesselName.trim()) {
      if (eventCode.trim()) nameInput.current?.focus();
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const eventState = await loadRegistrationStateForEventCode(eventCode);
      if (eventState.event && eventState.isRegistered && eventState.vesselName) {
        Keyboard.dismiss();
        const message = `You have already joined this event as ${eventState.vesselName}`;
        if (Platform.OS === "web") {
          globalThis.alert(message);
        } else {
          await new Promise<void>(resolve => {
            Alert.alert("Already joined", message, [{ text: "Continue", onPress: () => resolve() }], { cancelable: false });
          });
        }
        setRegistrationState(eventState);
        router.replace("/(tabs)");
        return;
      }
      const nextRegistrationState = eventState.requiresRegistration && eventState.event
        ? await registerVesselNameForEvent(eventState.event, vesselName)
        : eventState;
      setRegistrationState(nextRegistrationState);
      router.replace("/(tabs)");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to join that event."));
    } finally {
      setSubmitting(false);
    }
  }

  if (fontError) {
    return <View style={[styles.backgroundContainer, styles.fontError]}><Text style={styles.errorText}>The page fonts could not load. Reload to try again.</Text></View>;
  }

  if (registrationState.event && registrationState.isRegistered) {
    return <LoadingScreen accessibilityLabel="Loading event" />;
  }

  return (
    <View onLayout={layout.onLayout} style={styles.backgroundContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoidingContainer}
        >
          <ScrollView contentContainerStyle={[styles.container, { paddingLeft: layout.left, paddingRight: layout.right, paddingTop: insets.top + artworkSpacing, paddingBottom: layout.bottom }]} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <View style={{ marginBottom: artworkSpacing * 2, paddingHorizontal: artworkSidePadding }}>
                <TrailBrandArtwork width={artworkWidth} />
              </View>
              <View style={[styles.form, { width: formWidth }]}>
              <TextInput
                accessibilityLabel="Event code"
                returnKeyType="next"
                onSubmitEditing={() => nameInput.current?.focus()}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
                maxLength={10}
                onChangeText={setEventCode}
                placeholder="EVENT CODE"
                placeholderTextColor={missingEventCode ? "#ffd2cc" : TRAIL_WHITE}
                style={[styles.input, { height: controlHeight, fontSize: typography.inputFontSize, marginBottom: layout.gap }, missingEventCode && styles.missingInput]}
                value={eventCode}
              />

              <TextInput
                ref={nameInput}
                accessibilityLabel="Vessel name"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!submitting}
                maxLength={40}
                onChangeText={setVesselName}
                onSubmitEditing={() => { void submit(); }}
                returnKeyType="go"
                placeholder="NAME"
                placeholderTextColor={missingVesselName ? "#ffd2cc" : TRAIL_WHITE}
                style={[styles.input, { height: controlHeight, fontSize: typography.inputFontSize, marginBottom: layout.gap }, missingVesselName && styles.missingInput]}
                value={vesselName}
              />
              {errorMessage ? <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text> : null}

              <Pressable
                accessibilityLabel={submitting ? "Joining event" : "Join the hunt"}
                accessibilityRole="button"
                accessibilityState={{ busy: submitting, disabled: submitting }}
                disabled={submitting}
                onPress={() => {
                  void submit();
                }}
                style={[styles.button, { minHeight: controlHeight }, submitting ? styles.buttonDisabled : null]}
              >
                {submitting ? <ActivityIndicator accessibilityLabel="Joining event" color={TRAIL_INK} /> : <Text style={[styles.buttonText, { fontSize: typography.buttonFontSize }]}>JOIN THE HUNT</Text>}
              </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
    </View>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

const styles = StyleSheet.create({
  fontError: { alignItems: "center", justifyContent: "center", padding: 24 },
  backgroundContainer: {
    flex: 1,
    backgroundColor: APP_BACKGROUND_COLOR,
  },
  keyboardAvoidingContainer: {
    flex: 1,
    width: "100%",
  },
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },
  card: { width: "100%", maxWidth: 460,
    alignItems: "center",
  },
  form: { alignSelf: "center" },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: TRAIL_WHITE,
    backgroundColor: "transparent",
    marginTop: 0,
    marginBottom: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: TRAIL_WHITE,
    textAlign: "center",
    ...textMetrics(FONT_SIZE.heading),
    fontFamily: LANDING_INPUT_FONT,
    letterSpacing: 0,
  },
  missingInput: {
    color: "#ffd2cc",
  },
  errorText: {
    color: "#ffb4ab",
    ...textMetrics(FONT_SIZE.body),
    ...FONT_WEIGHT.bold,
    marginBottom: 8,
    textAlign: "center",
  },
  button: {
    marginTop: 0,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: TRAIL_WHITE,
    borderColor: TRAIL_INK,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: TRAIL_INK,
    ...textMetrics(FONT_SIZE.price),
    fontFamily: LANDING_BUTTON_FONT,
    textAlign: "center",
  },
});
