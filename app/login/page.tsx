"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("demo@baucompliance.ch");
  const { login } = useAuth();
  const { t } = useLanguage();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate network delay
    setTimeout(() => {
      login(email);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-md p-10 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-accent to-purple-600" />
        
        <div className="mb-10 text-center">
          <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold mb-2">{t("btn-login")}</h1>
          <p className="text-slate-400">Access your compliance dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Work Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-slate-500 focus:outline-none focus:border-accent transition"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Password</label>
            <input 
              type="password" 
              defaultValue="password"
              className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder-slate-500 focus:outline-none focus:border-accent transition"
            />
          </div>

          <button 
            disabled={isLoading}
            className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-accent/20 transition flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Authenticating...</>
            ) : (
              t("btn-login")
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center text-xs text-slate-500">
          Protected by 256-bit Swiss Banking Grade Encryption
        </div>
      </div>
    </div>
  );
}
