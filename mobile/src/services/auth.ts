// Authentication service using Supabase
//
// Handles sign up, sign in, sign out, and token management.
// The token is stored in memory (for simplicity in MVP).

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Store the current session token in memory
let currentToken: string | null = null;

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
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

export function getToken(): string | null {
  return currentToken;
}

export async function getCurrentUserEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
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