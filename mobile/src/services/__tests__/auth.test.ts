// auth.ts creates its Supabase client at module load time and registers an
// onAuthStateChange listener immediately — both have to be mocked before
// the module is ever imported, or this would try to hit a real Supabase
// project on every test run.
//
// The mock object is built and returned FROM WITHIN the factory (not
// referenced from an outer const) — auth.ts's top-level import gets
// hoisted above a top-level `const mockAuth = {...}` in this project's
// babel config, so an outer reference would be undefined at the moment
// auth.ts's own createClient() call actually runs. Exporting it as
// __mockAuth lets the test file grab the exact same instance afterward.
// auth.ts's conditionalStorage wraps this at module load time too -- a
// simple in-memory stand-in is enough since these tests exercise the
// Supabase auth calls, not the storage-gating behavior itself (see
// LoginScreen.test.tsx and the "keep me signed in" checkbox for that).
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock("@supabase/supabase-js", () => {
  const auth = {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signInWithIdToken: jest.fn(),
    updateUser: jest.fn(),
    signOut: jest.fn(),
    getUser: jest.fn(),
    refreshSession: jest.fn(),
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(),
  };
  // Captures the `storage` adapter auth.ts hands to createClient() (its
  // LargeSecureStore-backed conditionalStorage) so the encryption/migration
  // tests below can exercise the exact same instance the real client would
  // read/write through. A plain outer `let` reassigned from inside this
  // factory doesn't work here -- babel-plugin-jest-hoist hoists this whole
  // jest.mock call (and the imports that trigger it) above such a `let`'s
  // own initializer in the compiled output, so the initializer would run
  // AFTER capture and stomp the real value back to null. Mutating a
  // property on an object living inside this factory's own closure (then
  // exporting that same object) sidesteps the issue since there's no
  // separate outer binding to reset.
  const capturedStorage: { current: any } = { current: null };
  return {
    createClient: jest.fn((_url: string, _key: string, options: any) => {
      capturedStorage.current = options?.auth?.storage ?? null;
      return { auth };
    }),
    __mockAuth: auth,
    __capturedStorage: capturedStorage,
  };
});

// Real native modules -- TurboModuleRegistry.getEnforcing() (google-signin)
// throws immediately at import time outside a real native runtime, so this
// has to be mocked before auth.ts (which imports both at module scope) is
// ever required, same reasoning as the supabase-js mock above.
jest.mock("expo-apple-authentication", () => ({
  signInAsync: jest.fn(),
  isAvailableAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
// Real in-memory implementations (not stubs) -- these back LargeSecureStore's
// key storage and random-byte generation, so the encryption tests below
// exercise the actual aes-js encrypt/decrypt round trip rather than a faked
// no-op, which is the only way to meaningfully test this security-critical
// code path.
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});
jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: jest.fn((byteCount: number) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require("crypto");
    return Promise.resolve(new Uint8Array(nodeCrypto.randomBytes(byteCount)));
  }),
}));
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    signOut: jest.fn().mockResolvedValue(undefined),
  },
  isSuccessResponse: jest.fn((response: any) => response?.type === "success"),
}));

import * as auth from "../auth";
import * as supabaseJs from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockAuth = (supabaseJs as any).__mockAuth;
const mockCapturedStorage = (supabaseJs as any).__capturedStorage;

describe("auth service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("signIn", () => {
    it("stores the session's access token and returns the data", async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: "new-token" }, user: { id: "u1" } },
        error: null,
      });

      const result = await auth.signIn("a@b.com", "pw");

      expect(auth.getToken()).toBe("new-token");
      expect(result.user).toEqual({ id: "u1" });
    });

    it("throws Supabase's own error rather than swallowing it", async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { session: null },
        error: { message: "Invalid credentials" },
      });

      await expect(auth.signIn("a@b.com", "wrong")).rejects.toEqual({ message: "Invalid credentials" });
    });
  });

  describe("signInWithApple", () => {
    it("exchanges the identity token and updates the display name on first authorization", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
        identityToken: "apple-id-token",
        fullName: { givenName: "Ada", familyName: "Lovelace" },
      });
      mockAuth.signInWithIdToken.mockResolvedValue({
        data: { session: { access_token: "apple-token" }, user: { id: "u1" } },
        error: null,
      });
      mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });

      const result = await auth.signInWithApple();

      expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
        provider: "apple",
        token: "apple-id-token",
      });
      expect(mockAuth.updateUser).toHaveBeenCalledWith({ data: { full_name: "Ada Lovelace" } });
      expect(auth.getToken()).toBe("apple-token");
      expect(result.user).toEqual({ id: "u1" });
    });

    it("skips updateUser when Apple doesn't return a name (every sign-in after the first)", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
        identityToken: "apple-id-token-2",
        fullName: null,
      });
      mockAuth.signInWithIdToken.mockResolvedValue({
        data: { session: { access_token: "apple-token-2" }, user: { id: "u1" } },
        error: null,
      });

      await auth.signInWithApple();

      expect(mockAuth.updateUser).not.toHaveBeenCalled();
    });

    it("throws when Apple returns no identity token", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: null, fullName: null });

      await expect(auth.signInWithApple()).rejects.toThrow("Apple sign-in did not return an identity token.");
      expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
    });

    it("throws Supabase's own error rather than swallowing it", async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
        identityToken: "apple-id-token",
        fullName: null,
      });
      mockAuth.signInWithIdToken.mockResolvedValue({ data: { session: null }, error: { message: "bad token" } });

      await expect(auth.signInWithApple()).rejects.toEqual({ message: "bad token" });
    });
  });

  describe("signInWithGoogle", () => {
    it("exchanges the identity token and returns the data", async () => {
      (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
        type: "success",
        data: { idToken: "google-id-token" },
      });
      mockAuth.signInWithIdToken.mockResolvedValue({
        data: { session: { access_token: "google-token" }, user: { id: "u2" } },
        error: null,
      });

      const result = await auth.signInWithGoogle();

      expect(GoogleSignin.configure).toHaveBeenCalled();
      expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
        provider: "google",
        token: "google-id-token",
      });
      expect(auth.getToken()).toBe("google-token");
      expect(result.user).toEqual({ id: "u2" });
    });

    it("throws when Google sign-in is cancelled (no success response)", async () => {
      (GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: "cancelled" });

      await expect(auth.signInWithGoogle()).rejects.toThrow("Google sign-in did not return an identity token.");
      expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
    });

    it("throws Supabase's own error rather than swallowing it", async () => {
      (GoogleSignin.signIn as jest.Mock).mockResolvedValue({
        type: "success",
        data: { idToken: "google-id-token" },
      });
      mockAuth.signInWithIdToken.mockResolvedValue({ data: { session: null }, error: { message: "bad token" } });

      await expect(auth.signInWithGoogle()).rejects.toEqual({ message: "bad token" });
    });
  });

  describe("signOut", () => {
    it("clears the stored token", async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: "will-be-cleared" } },
        error: null,
      });
      await auth.signIn("a@b.com", "pw");
      expect(auth.getToken()).toBe("will-be-cleared");

      mockAuth.signOut.mockResolvedValue({ error: null });
      await auth.signOut();

      expect(auth.getToken()).toBeNull();
    });
  });

  describe("refreshToken", () => {
    it("updates and returns the new token on success", async () => {
      mockAuth.refreshSession.mockResolvedValue({
        data: { session: { access_token: "refreshed-token" } },
        error: null,
      });

      const result = await auth.refreshToken();

      expect(result).toBe("refreshed-token");
      expect(auth.getToken()).toBe("refreshed-token");
    });

    it("throws when Supabase can't refresh the session", async () => {
      mockAuth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: "refresh token expired" },
      });

      await expect(auth.refreshToken()).rejects.toEqual({ message: "refresh token expired" });
    });
  });

  describe("restoreSession", () => {
    it("returns true and sets the token when a session exists", async () => {
      mockAuth.getSession.mockResolvedValue({
        data: { session: { access_token: "restored-token" } },
      });

      const result = await auth.restoreSession();

      expect(result).toBe(true);
      expect(auth.getToken()).toBe("restored-token");
    });

    it("returns false without touching the token when there's no session", async () => {
      mockAuth.getSession.mockResolvedValue({ data: { session: null } });

      const result = await auth.restoreSession();

      expect(result).toBe(false);
    });
  });

  describe("getCurrentUserId / getCurrentUserEmail", () => {
    it("returns null when there's no signed-in user", async () => {
      mockAuth.getUser.mockResolvedValue({ data: { user: null } });

      expect(await auth.getCurrentUserId()).toBeNull();
      expect(await auth.getCurrentUserEmail()).toBeNull();
    });

    it("returns the user's id and email when signed in", async () => {
      mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.com" } } });

      expect(await auth.getCurrentUserId()).toBe("u1");
      expect(await auth.getCurrentUserEmail()).toBe("a@b.com");
    });
  });

  // Exercises LargeSecureStore (the encrypted-session wrapper) through the
  // exact conditionalStorage instance auth.ts wired up as Supabase's storage
  // adapter -- routes through the persisted path (not the "keep me signed
  // in" OFF in-memory fallback), same as a real signed-in session on disk.
  describe("session storage encryption (LargeSecureStore)", () => {
    beforeEach(async () => {
      await auth.setKeepSignedIn(true);
    });

    it("never persists the session as plaintext on disk", async () => {
      const key = "sb-test-plaintext-check";
      const sessionJson = JSON.stringify({ access_token: "super-secret-token" });

      await mockCapturedStorage.current.setItem(key, sessionJson);

      const raw = await AsyncStorage.getItem(key);
      expect(raw).not.toBe(sessionJson);
      expect(raw).not.toContain("super-secret-token");
    });

    it("round-trips a stored value back to its original plaintext", async () => {
      const key = "sb-test-roundtrip";
      const sessionJson = JSON.stringify({ access_token: "a", refresh_token: "b" });

      await mockCapturedStorage.current.setItem(key, sessionJson);

      expect(await mockCapturedStorage.current.getItem(key)).toBe(sessionJson);
    });

    it("migrates a legacy plaintext value in place instead of discarding it", async () => {
      const key = "sb-test-legacy-migration";
      // Simulate a session saved by the pre-encryption code: raw JSON
      // already sitting in AsyncStorage, with no corresponding SecureStore
      // key (since that key never existed before this feature shipped).
      const legacyJson = JSON.stringify({ access_token: "legacy-token" });
      await AsyncStorage.setItem(key, legacyJson);

      const firstRead = await mockCapturedStorage.current.getItem(key);
      expect(firstRead).toBe(legacyJson);

      // That first read should have silently re-encrypted it in place.
      const rawAfterMigration = await AsyncStorage.getItem(key);
      expect(rawAfterMigration).not.toBe(legacyJson);

      expect(await mockCapturedStorage.current.getItem(key)).toBe(legacyJson);
    });

    it("removeItem clears both the ciphertext and its encryption key", async () => {
      const key = "sb-test-remove";
      await mockCapturedStorage.current.setItem(key, "some-session-value");

      await mockCapturedStorage.current.removeItem(key);

      expect(await AsyncStorage.getItem(key)).toBeNull();
      expect(await mockCapturedStorage.current.getItem(key)).toBeNull();
    });

    it("getItem returns null (not a crash) for a key that was never written", async () => {
      expect(await mockCapturedStorage.current.getItem("sb-test-never-written")).toBeNull();
    });
  });
});
