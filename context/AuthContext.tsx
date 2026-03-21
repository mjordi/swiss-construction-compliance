"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import type { User, AuthError, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: { email: string; name: string; id: string } | null;
  login: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
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
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    const syncSession = async (session: Session | null) => {
      if (!session?.user) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      // Set a usable auth state immediately so the UI does not appear stuck
      setUser(mapUser(session.user));
      setIsLoading(false);

      const fullName = await resolveProfileName(supabase, session.user.id);
      setUser(mapUser(session.user, fullName));
    };

    supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => syncSession(result.data.session))
      .catch(() => {
        setUser(null);
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: string, session: Session | null) => {
      await syncSession(session);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        // Set user immediately so the dashboard auth guard sees it before render
        setUser(mapUser(data.session.user));
        router.push("/dashboard");
        // Resolve profile name in the background
        resolveProfileName(supabase, data.session.user.id).then((fullName) => {
          setUser(mapUser(data.session.user, fullName));
        });
      }
      return { error };
    },
    [supabase, router]
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (!error) {
        router.push("/dashboard");
      }
      return { error };
    },
    [supabase, router]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
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
