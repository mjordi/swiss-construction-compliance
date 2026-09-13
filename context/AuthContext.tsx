"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { getSupabase } from "@/lib/supabase";
import { getPostLoginRedirect } from "@/lib/auth-redirect";
import type { User, AuthError, Session } from "@supabase/supabase-js";
import type { MarketingAttribution } from "@/lib/marketing-attribution";

interface AuthContextType {
  user: { email: string; name: string; id: string } | null;
  login: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    attribution?: MarketingAttribution | null
  ) => Promise<{ error: AuthError | null }>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapUser(user: User | null, fullName?: string): AuthContextType["user"] {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    name: fullName ?? user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "",
  };
}

async function resolveProfileName(
  supabase: ReturnType<typeof getSupabase>,
  userId: string
): Promise<string | undefined> {
  try {
    const res: { data: { full_name: string | null } | null } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    return res.data?.full_name ?? undefined;
  } catch {
    return undefined;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextType["user"]>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = useMemo(() => getSupabase(), []);
  const mountedRef = useRef(true);
  const authEventVersionRef = useRef(0);
  const profileRequestVersionRef = useRef(0);

  const syncSession = useCallback(
    async (session: Session | null) => {
      const profileRequestVersion = ++profileRequestVersionRef.current;

      if (!session?.user) {
        if (mountedRef.current) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      // Set a usable auth state immediately so the UI does not appear stuck.
      if (mountedRef.current) {
        setUser(mapUser(session.user));
        setIsLoading(false);
      }

      const fullName = await resolveProfileName(supabase, session.user.id);
      if (
        mountedRef.current &&
        profileRequestVersion === profileRequestVersionRef.current
      ) {
        setUser(mapUser(session.user, fullName));
      }
    },
    [supabase]
  );

  useEffect(() => {
    mountedRef.current = true;
    const initialAuthEventVersion = authEventVersionRef.current;

    supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        if (
          mountedRef.current &&
          initialAuthEventVersion === authEventVersionRef.current
        ) {
          void syncSession(result.data.session);
        }
      })
      .catch(() => {
        if (
          mountedRef.current &&
          initialAuthEventVersion === authEventVersionRef.current
        ) {
          void syncSession(null);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: string, session: Session | null) => {
      authEventVersionRef.current += 1;
      await syncSession(session);
    });

    return () => {
      mountedRef.current = false;
      authEventVersionRef.current += 1;
      profileRequestVersionRef.current += 1;
      subscription.unsubscribe();
    };
  }, [supabase, syncSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        void syncSession(data.session);
        // Full page reload ensures dashboard gets a clean auth state —
        // router.push can hang during client-side transitions.
        window.location.href = getPostLoginRedirect(window.location.search);
      }
      return { error };
    },
    [supabase, syncSession]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, attribution?: MarketingAttribution | null) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, ...(attribution ?? {}) } },
      });
      return { error };
    },
    [supabase]
  );

  const logout = useCallback(async () => {
    profileRequestVersionRef.current += 1;
    await supabase.auth.signOut();
    if (mountedRef.current) {
      setUser(null);
    }
    // Full reload to clear all client state and Supabase session
    window.location.href = "/login";
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, login, signUp, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
