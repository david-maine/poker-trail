import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";

import type { RegistrationState } from "./game";
import { startHandSync } from "./handSync";
import type { LocalHand } from "./localHand";

type EventSessionContextValue = {
  registrationState: RegistrationState;
  setRegistrationState: (registrationState: RegistrationState) => void;
  hand: LocalHand | null;
  syncingHand: boolean;
  retryHandSync: () => void;
};

const EventSessionContext = createContext<EventSessionContextValue | null>(null);

export function EventSessionProvider({
  children,
  initialRegistrationState,
}: PropsWithChildren<{ initialRegistrationState: RegistrationState }>) {
  const [registrationState, setRegistrationState] = useState(initialRegistrationState);
  const [hand, setHand] = useState<LocalHand | null>(null);
  const [syncingHand, setSyncingHand] = useState(false);
  const syncRef = useRef<ReturnType<typeof startHandSync> | null>(null);
  const eventId = registrationState.event?.id;
  const registered = registrationState.isRegistered;

  useEffect(() => {
    setHand(null);
    setSyncingHand(false);
    if (!eventId || !registered) return;
    const worker = startHandSync(eventId, setHand, setSyncingHand);
    syncRef.current = worker;
    return () => { worker.stop(); syncRef.current = null; };
  }, [eventId, registered]);

  const value = useMemo(
    () => ({
      registrationState,
      setRegistrationState,
      hand: hand?.eventId === eventId ? hand : null,
      syncingHand,
      retryHandSync: () => syncRef.current?.retry(),
    }),
    [registrationState, hand, eventId, syncingHand]
  );

  return (
    <EventSessionContext.Provider value={value}>{children}</EventSessionContext.Provider>
  );
}

export function useEventSession() {
  const context = useContext(EventSessionContext);

  if (!context) {
    throw new Error("useEventSession must be used inside EventSessionProvider.");
  }

  return context;
}
