// Authentication service using Supabase
//
// Handles sign up, sign in, sign out, and token management.
// The token itself is kept in memory (see currentToken below); whether the
// underlying Supabase *session* survives an app restart is gated by the
// "keep me signed in" checkbox on LoginScreen via conditionalStorage.

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config";

const KEEP_SIGNED_IN_KEY = "backyard_keep_signed_in";

// In-memory fallback used when the walker hasn't opted into persistent
// sign-in -- Supabase's client always needs a storage object to call
// get/set/remove on, this just keeps those writes off disk so the session
// disappears the moment the app process ends, exactly like the old
// memory-only currentToken did before this file wired up AsyncStorage.
const sessionOnlyStore = new Map<string, string>();

async function keepSignedInIsOn(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEEP_SIGNED_IN_KEY)) === "true";
}

export async function setKeepSignedIn(value: boolean) {
  await AsyncStorage.setItem(KEEP_SIGNED_IN_KEY, value ? "true" : "false");
}

// Supabase's own storage interface (get/set/removeItem) -- swaps between
// real disk storage and the in-memory Map above per-write, based on
// whichever the "keep me signed in" checkbox last saved. Reads check disk
// first since a previously-persisted session should still restore even if
// this preference key itself hasn't been written yet this launch.
const conditionalStorage = {
  async getItem(key: string) {
    const stored = await AsyncStorage.getItem(key);
    return stored ?? sessionOnlyStore.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    if (await keepSignedInIsOn()) {
      await AsyncStorage.setItem(key, value);
    } else {
      sessionOnlyStore.set(key, value);
    }
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    sessionOnlyStore.delete(key);
  },
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: conditionalStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Store the current session token in memory
let currentToken: string | null = null;

// Supabase's client auto-refreshes its OWN session in the background, but
// that refresh doesn't touch our separate `currentToken` variable unless we
// listen for it — without this, currentToken goes stale after the JWT's
// ~1hr expiry and every API call starts failing with 401s, even though
// Supabase itself still thinks the session is fine. This keeps the two in
// sync for every relevant event (sign in, token refresh, sign out).
supabase.auth.onAuthStateChange((_event, session) => {
  currentToken = session?.access_token ?? null;
});

// dateOfBirth is "YYYY-MM-DD" -- matches the `.::DATE` cast in
// handle_new_user() (017_signup_dob_privacy.sql). full_name/date_of_birth/
// privacy_accepted travel in as Supabase Auth user_metadata; the trigger
// reads them straight off auth.users, no separate backend call needed.
export async function signUp(
  email: string,
  password: string,
  fullName: string,
  dateOfBirth: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        date_of_birth: dateOfBirth,
        privacy_accepted: true,
      },
    },
  });
  if (error) throw error;
  if (data.session) {
    currentToken = data.session.access_token;
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  if (data.session) {
    currentToken = data.session.access_token;
  }
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  currentToken = null;
}

// Sends a password-reset email. The link inside redirects to
// backyard://reset-password#access_token=...&refresh_token=...&type=recovery
// -- App.tsx's deep-link handler picks that up and calls
// establishRecoverySession before showing ResetPasswordScreen.
//
// Requires "backyard://reset-password" to be added to this Supabase
// project's Auth > URL Configuration > Redirect URLs allowlist, or
// Supabase will reject the redirect. One-time setup, not code.
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "backyard://reset-password",
  });
  if (error) throw error;
}

// Exchanges the tokens from a recovery deep link for a real (temporary)
// session, scoped only to changing the password -- without this,
// updatePassword() below has no session to act on.
export async function establishRecoverySession(accessToken: string, refreshToken: string) {
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export function getToken(): string | null {
  return currentToken;
}

export async function getCurrentUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function refreshToken() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  if (data.session) {
    currentToken = data.session.access_token;
  }
  return currentToken;
}

// Check if there's an existing session on app launch
export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    currentToken = data.session.access_token;
    return true;
  }
  return false;
}