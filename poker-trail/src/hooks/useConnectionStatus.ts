import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { addConnectivityListener, fetchIsUsableConnection } from "../lib/connectivity";

export default function useConnectionStatus() {
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const update = (usable: boolean) => {
      revision++;
      if (active) setOnline(usable);
    };
    const refresh = () => {
      const requestedRevision = ++revision;
      void fetchIsUsableConnection().then(usable => {
        if (active && revision === requestedRevision) setOnline(usable);
      }).catch(() => {});
    };
    const disconnect = addConnectivityListener(update);
    const appState = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    refresh();
    return () => { active = false; disconnect(); appState.remove(); };
  }, []);
  return online;
}
