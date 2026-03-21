import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

const CONFIG_ERROR_MESSAGE =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabase() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return createPlaceholderClient();
  }

  client = createBrowserClient(url, key);
  return client;
}

function createConfigError() {
  return { message: CONFIG_ERROR_MESSAGE, name: "SupabaseConfigError" };
}

/**
 * Minimal placeholder that satisfies the Supabase client interface during build.
 * It should fail explicitly for auth mutations so the UI shows a clear error
 * instead of appearing to hang when env vars are missing.
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
    single: () => Promise.resolve({ data: null, error: createConfigError() }),
    then: (resolve: (v: { data: null; error: { message: string; name: string } }) => void) =>
      resolve({ data: null, error: createConfigError() }),
  };

  const noopAuth = {
    getSession: () => Promise.resolve({ data: { session: null }, error: createConfigError() }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: createConfigError() }),
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: createConfigError() }),
    signOut: () => Promise.resolve({ error: null }),
    updateUser: () => Promise.resolve({ data: { user: null }, error: createConfigError() }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => noopQuery, auth: noopAuth } as any;
}

export { CONFIG_ERROR_MESSAGE };
