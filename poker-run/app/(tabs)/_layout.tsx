import { APP_BACKGROUND_COLOR } from "../../src/lib/theme";
import { RobotoSlab_800ExtraBold } from "@expo-google-fonts/roboto-slab/800ExtraBold";
import { Montserrat_500Medium_Italic } from "@expo-google-fonts/montserrat/500Medium_Italic";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Href, router, Tabs } from "expo-router";

import TrailTabBar from "../../src/components/TrailTabBar";
import LoadingScreen from "../../src/components/LoadingScreen";
import { useEventSession } from "../../src/lib/eventSession";

export default function TabLayout() {
  const [fontsLoaded, fontError] = useFonts({ RobotoSlab_800ExtraBold, Montserrat_500Medium_Italic });
  const { registrationState } = useEventSession();
  const headerTitle = registrationState.event?.name ?? "Poker Run";
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkRegistration() {
      try {
        if (!isMounted) {
          return;
        }

        if (registrationState.requiresRegistration) {
          router.replace("/register");
          return;
        }

        if (!registrationState.event) {
          router.replace("/event-code" as Href);
          return;
        }

        if (!isMounted) {
          return;
        }

        setReady(true);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to confirm registration status."
          );
          setReady(true);
        }
      }
    }

    void checkRegistration();

    return () => {
      isMounted = false;
    };
  }, [registrationState.event, registrationState.requiresRegistration]);

  if (!ready || (!fontsLoaded && !fontError)) {
    return <LoadingScreen accessibilityLabel="Checking registration" />;
  }

  if (errorMessage || fontError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage ?? "The page font could not load. Reload to try again."}</Text>
      </View>
    );
  }

  return (
    <Tabs
      tabBar={props => <TrailTabBar {...props} />}
      screenOptions={{ headerTitle, headerShown: false, sceneStyle: { backgroundColor: APP_BACKGROUND_COLOR } }}
    >
      <Tabs.Screen
        name="index"
        options={{
          headerShown: false,
          tabBarLabel: "Map",
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          headerShown: false,
          tabBarLabel: "Leaderboard",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: APP_BACKGROUND_COLOR,
    paddingHorizontal: 24,
  },
  errorText: {
    color: "#ff8a80",
    fontSize: 16,
    textAlign: "center",
  },
});
