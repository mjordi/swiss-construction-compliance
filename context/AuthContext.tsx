"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: { email: string; name: string } | null;
  login: (email: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ email: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check local storage on mount — use startTransition to avoid cascading render warning
    const storedUser = localStorage.getItem("baucompliance_user");
    const parsed = storedUser ? (JSON.parse(storedUser) as { email: string; name: string }) : null;
    // Batch both state updates together to avoid cascading renders
    if (parsed) setUser(parsed);
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (email: string) => {
    // Simulate API call
    const newUser = { email, name: "Michael Jordi" }; // Mock user
    setUser(newUser);
    localStorage.setItem("baucompliance_user", JSON.stringify(newUser));
    router.push("/dashboard");
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("baucompliance_user");
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
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
