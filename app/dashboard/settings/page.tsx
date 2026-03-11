"use client";

import { User, Bell, Shield, CreditCard, LogOut } from "lucide-react";

export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-[family-name:var(--font-display)] italic text-cream mb-2">Account Settings</h1>
        <p className="text-muted text-sm">Manage your subscription and preferences.</p>
      </header>

      <div className="space-y-6">
        {/* Profile Section */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-accent/[0.08] border border-accent/15 rounded-xl flex items-center justify-center text-accent text-lg font-[family-name:var(--font-display)] italic">
                MJ
              </div>
              <div>
                <h3 className="text-lg font-semibold text-cream">Michael Jordi</h3>
                <p className="text-muted text-sm">mjordi.ch@gmail.com</p>
              </div>
            </div>
            <button className="px-4 py-2 border border-white/[0.06] rounded-lg text-[13px] text-muted hover:text-cream hover:bg-white/[0.03] transition-all duration-300">
              Edit Profile
            </button>
          </div>
        </div>

        {/* Subscription */}
        <div className="rounded-2xl bg-white/[0.02] border border-accent/15 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent via-accent/30 to-transparent" />
          <div className="absolute top-0 right-0 p-4">
            <span className="bg-accent/[0.1] text-accent text-[10px] font-semibold tracking-[0.1em] uppercase px-3 py-1 rounded-lg border border-accent/20">PRO ACTIVE</span>
          </div>
          <h3 className="text-lg font-semibold text-cream mb-4 flex items-center gap-2.5">
            <CreditCard className="w-5 h-5 text-accent" /> Subscription
          </h3>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-2xl font-[family-name:var(--font-display)] italic text-cream mb-1">
                CHF 89.00 <span className="text-sm font-sans not-italic text-muted">/ mo</span>
              </div>
              <p className="text-sm text-muted">Next billing date: March 1, 2026</p>
            </div>
            <button className="text-[13px] text-muted hover:text-accent underline underline-offset-4 transition-colors duration-300">Manage Billing</button>
          </div>
        </div>

        {/* Preferences Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-6 hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300 cursor-pointer group">
            <Bell className="w-7 h-7 text-blue-400 mb-4 group-hover:scale-110 transition-transform duration-300" />
            <h4 className="font-semibold text-cream mb-2">Notifications</h4>
            <p className="text-sm text-muted">Configure email alerts for new legal amendments.</p>
          </div>
          <div className="rounded-2xl bg-white/[0.02] border border-white/[0.05] p-6 hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300 cursor-pointer group">
            <Shield className="w-7 h-7 text-emerald-400 mb-4 group-hover:scale-110 transition-transform duration-300" />
            <h4 className="font-semibold text-cream mb-2">Security</h4>
            <p className="text-sm text-muted">2FA settings and audit logs.</p>
          </div>
        </div>

        <div className="text-center pt-8">
          <button className="text-red-400/80 hover:text-red-400 text-[13px] font-medium flex items-center justify-center gap-2 mx-auto transition-colors duration-300">
            <LogOut className="w-4 h-4" /> Sign Out of All Devices
          </button>
        </div>
      </div>
    </div>
  );
}
