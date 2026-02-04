import Link from "next/link";
import { ArrowRight, ShieldCheck, FileText, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="glass sticky top-0 z-50 px-8 py-5 flex justify-between items-center">
        <div className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 font-[family-name:var(--font-outfit)]">
          Bau<span className="text-accent">Compliance</span>
        </div>
        <div className="flex gap-6 items-center">
          <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition">Intelligence</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
          </nav>
          <Link href="/login" className="px-6 py-2 bg-white text-primary rounded-full font-bold text-sm hover:scale-105 transition shadow-[0_0_20px_rgba(255,255,255,0.2)]">
            Login
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-20 pb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold mb-8 uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
          Live: 2026 Code of Obligations Update
        </div>
        
        <h1 className="text-6xl md:text-8xl font-extrabold tracking-tight mb-6 font-[family-name:var(--font-outfit)] bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500">
          Construction <br/> Intelligence
        </h1>
        
        <p className="text-xl text-slate-400 max-w-2xl mb-12 font-light">
          Navigating the 2026 Swiss Code of Obligations with autonomous legal auditing and liability mapping.
        </p>

        <div className="flex gap-4 flex-col sm:flex-row">
          <Link href="/login" className="px-8 py-4 bg-accent text-white rounded-full font-bold text-lg hover:bg-accent/90 transition shadow-[0_10px_30px_rgba(249,115,22,0.4)] flex items-center justify-center gap-2">
            Get Started <ArrowRight className="w-5 h-5" />
          </Link>
          <button className="px-8 py-4 glass text-white rounded-full font-bold text-lg hover:bg-white/5 transition">
            View Documentation
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-32 max-w-5xl w-full text-left">
          <div className="glass p-8 rounded-2xl hover:border-accent/50 transition group">
            <ShieldCheck className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition" />
            <h3 className="text-xl font-bold mb-2">Liability Matrix</h3>
            <p className="text-slate-400 text-sm">Visualize risk exposure across all cantons with our real-time legal mapping engine.</p>
          </div>
          <div className="glass p-8 rounded-2xl hover:border-accent/50 transition group">
            <FileText className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition" />
            <h3 className="text-xl font-bold mb-2">Audit Engine v4</h3>
            <p className="text-slate-400 text-sm">Upload SIA contracts for instant compliance checks against the 2026 reform.</p>
          </div>
          <div className="glass p-8 rounded-2xl hover:border-accent/50 transition group">
            <Lock className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition" />
            <h3 className="text-xl font-bold mb-2">Tech Vault</h3>
            <p className="text-slate-400 text-sm">Secure, compliant storage for technical documentation required by the new law.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/5 py-10 text-center text-slate-500 text-sm">
        <p>&copy; 2026 BauCompliance.ch | Zürich • Genève • Lugano</p>
      </footer>
    </div>
  );
}
