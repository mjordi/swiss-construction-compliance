"use client";

import { User, Bell, Shield, CreditCard, LogOut } from "lucide-react";

export default function Settings() {
  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Account Settings</h1>
        <p className="text-slate-400">Manage your subscription and preferences.</p>
      </header>

      <div className="space-y-6">
        {/* Profile Section */}
        <div className="glass-card rounded-3xl p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center text-accent text-2xl font-bold">
                MJ
              </div>
              <div>
                <h3 className="text-xl font-bold">Michael Jordi</h3>
                <p className="text-slate-400 text-sm">mjordi.ch@gmail.com</p>
              </div>
            </div>
            <button className="px-4 py-2 border border-white/10 rounded-lg text-sm hover:bg-white/5 transition">
              Edit Profile
            </button>
          </div>
        </div>

        {/* Subscription */}
        <div className="glass-card rounded-3xl p-8 border border-accent/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            <span className="bg-accent text-white text-xs font-bold px-3 py-1 rounded-full">PRO ACTIVE</span>
          </div>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-accent" /> Subscription
          </h3>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-2xl font-bold mb-1">CHF 89.00 <span className="text-sm font-normal text-slate-400">/ mo</span></div>
              <p className="text-sm text-slate-400">Next billing date: March 1, 2026</p>
            </div>
            <button className="text-sm text-slate-300 hover:text-white underline">Manage Billing</button>
          </div>
        </div>

        {/* Preferences Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-6 hover:bg-white/5 transition cursor-pointer group">
            <Bell className="w-8 h-8 text-blue-400 mb-4 group-hover:scale-110 transition" />
            <h4 className="font-bold mb-2">Notifications</h4>
            <p className="text-sm text-slate-400">Configure email alerts for new legal amendments.</p>
          </div>
          <div className="glass-card rounded-2xl p-6 hover:bg-white/5 transition cursor-pointer group">
            <Shield className="w-8 h-8 text-emerald-400 mb-4 group-hover:scale-110 transition" />
            <h4 className="font-bold mb-2">Security</h4>
            <p className="text-sm text-slate-400">2FA settings and audit logs.</p>
          </div>
        </div>

        <div className="text-center pt-8">
          <button className="text-red-400 hover:text-red-300 text-sm font-medium flex items-center justify-center gap-2 mx-auto">
            <LogOut className="w-4 h-4" /> Sign Out of All Devices
          </button>
        </div>
      </div>
    </div>
  );
}
