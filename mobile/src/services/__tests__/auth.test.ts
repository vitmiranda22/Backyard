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
jest.mock("@supabase/supabase-js", () => {
  const auth = {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
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

import * as auth from "../auth";
import * as supabaseJs from "@supabase/supabase-js";

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
