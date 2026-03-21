import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a dummy client during build/prerender when env vars aren't available.
    // This is safe because these pages are "use client" and won't make real calls during SSR.
    return createPlaceholderClient();
  }

  client = createBrowserClient(url, key);
  return client;
}

/**
 * Minimal placeholder that satisfies the Supabase client interface during build.
 * No real requests are made — all methods return empty results.
 */
function createPlaceholderClient() {
  const noopQuery = {
    select: () => noopQuery,
    insert: () => noopQuery,
    update: () => noopQuery,
    delete: () => noopQuery,
    eq: () => noopQuery,
    not: () => noopQuery,
    order: () => noopQuery,
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
  };

  const noopAuth = {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    updateUser: () => Promise.resolve({ data: { user: null }, error: null }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => noopQuery, auth: noopAuth } as any;
}
