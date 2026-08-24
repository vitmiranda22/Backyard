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
  return {
    createClient: jest.fn(() => ({ auth })),
    __mockAuth: auth,
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

const mockAuth = (supabaseJs as any).__mockAuth;

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
});
