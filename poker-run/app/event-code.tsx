import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import LoadingScreen from "../src/components/LoadingScreen";
import { useEventSession } from "../src/lib/eventSession";
import { loadRegistrationStateForEventCode } from "../src/lib/game";

export default function EventCodeScreen() {
  const { registrationState, setRegistrationState } = useEventSession();
  const [eventCode, setEventCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!registrationState.event) {
      return;
    }

    router.replace(registrationState.requiresRegistration ? "/register" : "/(tabs)");
  }, [registrationState.event, registrationState.requiresRegistration]);

  async function submit() {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const nextRegistrationState = await loadRegistrationStateForEventCode(eventCode);
      setRegistrationState(nextRegistrationState);
      router.replace(nextRegistrationState.requiresRegistration ? "/register" : "/(tabs)");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Unable to join that event."));
    } finally {
      setSubmitting(false);
    }
  }

  if (registrationState.event) {
    return <LoadingScreen accessibilityLabel="Loading event" />;
  }

  return (
    <View style={styles.backgroundContainer}>
      <ImageBackground
        source={require("../assets/images/landingpage.png")}
        style={styles.background}
        resizeMode="cover"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={-100}
          style={styles.keyboardAvoidingContainer}
        >
          <View style={styles.container}>
            <ImageBackground
              source={require("../assets/images/landing-icon.png")}
              style={styles.card}
              imageStyle={styles.cardBackgroundIcon}
              resizeMode="stretch"
            >
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
                maxLength={10}
                onChangeText={setEventCode}
                placeholder="Event code"
                placeholderTextColor="#7f8c96"
                style={styles.input}
                value={eventCode}
              />

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <Pressable
                accessibilityLabel={submitting ? "Joining event" : "Join event"}
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => {
                  void submit();
                }}
                style={[styles.button, submitting ? styles.buttonDisabled : null]}
              >
                <ImageBackground
                  source={require("../assets/images/landing-Set-Sail.png")}
                  style={styles.buttonImage}
                  imageStyle={styles.buttonImageAsset}
                  resizeMode="contain"
                >
                  <Text style={styles.buttonText}>
                    {submitting ? "JOINING..." : "JOIN EVENT"}
                  </Text>
                </ImageBackground>
              </Pressable>
            </ImageBackground>
          </View>
        </KeyboardAvoidingView>
      </ImageBackground>
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
  backgroundContainer: {
    flex: 1,
    backgroundColor: "#25292e",
  },
  background: {
    flex: 1,
    backgroundColor: "#25292e",
  },
  keyboardAvoidingContainer: {
    flex: 1,
    width: "100%",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 58,
    paddingBottom: 120,
  },
  card: {
    width: "100%",
    borderRadius: 18,
    paddingHorizontal: 0,
    paddingVertical: 20,
    overflow: "hidden",
  },
  cardBackgroundIcon: {
    opacity: 1,
  },
  input: {
    borderRadius: 0,
    borderWidth: 3,
    borderColor: "#202542",
    marginHorizontal: 26,
    marginVertical: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: "#202542",
    textAlign: "center",
    fontSize: 18,
    fontFamily: "Stoke-Regular",
    fontWeight: "700",
    letterSpacing: 0,
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    marginHorizontal: 26,
    textAlign: "center",
  },
  button: {
    marginTop: 0,
    paddingHorizontal: 20,
    width: "100%",
    aspectRatio: 3142 / 685,
    borderRadius: 0,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonImage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonImageAsset: {
    borderRadius: 0,
  },
  buttonText: {
    color: "#D1CCB9",
    fontSize: 22,
    fontWeight: "800",
    fontFamily: "Stoke-Regular",
  },
});
