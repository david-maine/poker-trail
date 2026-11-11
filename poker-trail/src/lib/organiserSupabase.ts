import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { getSafeStorage } from "./safeStorage";
import { supabaseAnonKey, supabaseUrl } from "./supabase";

// Organiser login must never replace an anonymous player or platform admin session.
export const organiserSupabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    storage: getSafeStorage(),
    storageKey: "poker-trail-organiser-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});
