// Authentication service using Supabase
//
// Handles sign up, sign in, sign out, and token management.
// The token itself is kept in memory (see currentToken below); whether the
// underlying Supabase *session* survives an app restart is gated by the
// "keep me signed in" checkbox on LoginScreen via conditionalStorage.

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as aesjs from "aes-js";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, isSuccessResponse } from "@react-native-google-signin/google-signin";
import { SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from "../config";

let googleConfigured = false;

// GoogleSignin.configure() only needs to run once per app launch -- webClientId
// is what Supabase's Google provider checks the ID token's audience against,
// iosClientId is what the native SDK on this device actually authenticates
// with. Both are required together; passing only one silently breaks the
// token exchange rather than erroring clearly, so both come from config.ts.
function ensureGoogleConfigured() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
  googleConfigured = true;
}

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

// AsyncStorage is plain unencrypted disk storage -- fine for prefs, not for
// a Supabase session (access + refresh token, long-lived). SecureStore is
// encrypted but Android caps it at ~2KB per item, and a Supabase session
// carrying OAuth identity data (Google/Apple) can exceed that. This splits
// the difference the way Supabase's own React Native guide recommends: a
// random AES key (small, safe) lives in SecureStore, the actual session
// (arbitrarily large) is encrypted with that key and only the ciphertext
// touches AsyncStorage -- unreadable without the OS-keychain-protected key.
// A fresh key is generated on every write and re-saved under the same
// SecureStore identifier; since encryption is always (fresh key, ciphertext)
// as a pair, an old ciphertext is never readable with a newer key, which is
// fine -- getItem only ever reads back what the most recent setItem wrote.
class LargeSecureStore {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = await Crypto.getRandomBytesAsync(32);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private decrypt(encryptionKeyHex: string, value: string): string {
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;

    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) {
      // No key on file for this identifier -- either nothing was ever
      // written here, or (the real-world case right after this ships) it's
      // a legacy plaintext session saved before encryption existed. Treat
      // it as plaintext and immediately re-save it through setItem so it's
      // encrypted from here on, migrating already-signed-in walkers in
      // place instead of force-logging them out.
      await this.setItem(key, stored);
      return stored;
    }

    try {
      return this.decrypt(encryptionKeyHex, stored);
    } catch (e) {
      // Corrupt/unreadable ciphertext -- fail safe (treat as signed out)
      // rather than crash the app on launch.
      console.warn("Failed to decrypt stored session, treating as signed out:", e);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

const secureStore = new LargeSecureStore();

// Supabase's own storage interface (get/set/removeItem) -- swaps between
// real disk storage and the in-memory Map above per-write, based on
// whichever the "keep me signed in" checkbox last saved. Reads check disk
// first since a previously-persisted session should still restore even if
// this preference key itself hasn't been written yet this launch.
const conditionalStorage = {
  async getItem(key: string) {
    const stored = await secureStore.getItem(key);
    return stored ?? sessionOnlyStore.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    if (await keepSignedInIsOn()) {
      await secureStore.setItem(key, value);
    } else {
      sessionOnlyStore.set(key, value);
    }
  },
  async removeItem(key: string) {
    await secureStore.removeItem(key);
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

// Sign in with Apple -- iOS only (AppleAuthentication.isAvailableAsync()
// gates the button itself; this throws if called on a platform/device
// where it isn't available rather than silently no-op-ing). Apple only
// hands back the user's name on the very FIRST authorization ever granted
// to this app -- fullName is passed through as full_name metadata same as
// email signup, but will be null on every subsequent sign-in, which is
// expected, not a bug.
export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw new Error("Apple sign-in did not return an identity token.");
  }
  const fullName = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ")
    : undefined;
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });
  if (error) throw error;
  if (fullName && data.user) {
    // Best-effort -- if this fails the account still exists with a
    // fallback display_name (see handle_new_user()'s COALESCE), just
    // without the real name.
    await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => {});
  }
  if (data.session) {
    currentToken = data.session.access_token;
  }
  return data;
}

// Sign in with Google -- available on both platforms, unlike Apple.
export async function signInWithGoogle() {
  ensureGoogleConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }).catch(() => {
    // No-op on iOS, where Play Services doesn't exist and this always
    // rejects -- hasPlayServices is an Android-only concern.
  });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error("Google sign-in did not return an identity token.");
  }
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: response.data.idToken,
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
  // Best-effort -- clears Google's own cached session so the NEXT sign-in
  // shows the account picker again instead of silently reusing this one.
  // No-op (rejects harmlessly) if the walker never signed in with Google
  // or GoogleSignin was never configured this launch.
  await GoogleSignin.signOut().catch(() => {});
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