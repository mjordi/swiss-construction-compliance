"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: { email: string; name: string } | null;
  login: (email: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ email: string; name: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const storedUser = localStorage.getItem("baucompliance_user");
    return storedUser ? (JSON.parse(storedUser) as { email: string; name: string }) : null;
  });
  const [isLoading] = useState(false);
  const router = useRouter();

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
