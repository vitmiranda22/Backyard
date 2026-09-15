// Shared Supabase client for the web account pages (login/signup/account).
// Mirrors mobile/src/services/auth.ts's setup exactly: same project, same
// anon key (public/publishable by design, already shipped inside the
// mobile app bundle -- not a secret, protected by Supabase Row Level
// Security on the server side).
//
// Loaded via <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js">
// before this file, which exposes the global `supabase.createClient`.

const SUPABASE_URL = "https://uhhjntfwmgsiyvzepptm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVoaGpudGZ3bWdzaXl2emVwcHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTc0MTEsImV4cCI6MjA5ODc3MzQxMX0._cCsOR3Y8DYGTSipo218Pt-sM33BqThXnxEt1RtjFL8";
const BACKYARD_API_URL = "https://backyard-api.onrender.com/api";

const backyardSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Same trigger-based signup as the mobile app: full_name/date_of_birth/
// privacy_accepted travel in as Supabase Auth user_metadata, and a
// Postgres trigger (handle_new_user(), see 017_signup_dob_privacy.sql)
// creates the real `users` row from that metadata -- no separate backend
// call needed.
async function backyardSignUp(email, password, fullName, dateOfBirth) {
  const { data, error } = await backyardSupabase.auth.signUp({
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
  return data;
}

async function backyardSignIn(email, password) {
  const { data, error } = await backyardSupabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function backyardSignOut() {
  await backyardSupabase.auth.signOut();
}

async function backyardGetSession() {
  const { data } = await backyardSupabase.auth.getSession();
  return data.session;
}

// Authenticated fetch against the real backend -- same Authorization:
// Bearer <token> pattern the mobile app's authFetch uses.
async function backyardApiFetch(path) {
  const session = await backyardGetSession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch(BACKYARD_API_URL + path, {
    headers: { Authorization: "Bearer " + session.access_token },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body.detail && body.detail.error) || "Request failed (" + res.status + ")");
  }
  return res.json();
}
