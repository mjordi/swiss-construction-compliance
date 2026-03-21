"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import SiteHeader from "@/components/SiteHeader";
import MobileNav from "@/components/dashboard/MobileNav";
import { useAuth } from "@/context/AuthContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center noise-overlay">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col noise-overlay">
      {/* Top accent line */}
      <div className="h-[2px] bg-gradient-to-r from-accent via-accent/40 to-transparent" />

      <SiteHeader />

      <MobileNav />

      {/* Body */}
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 px-4 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-accent/[0.02] to-transparent pointer-events-none" />
          <div className="relative mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
