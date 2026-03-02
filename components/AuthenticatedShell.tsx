"use client";

import { ReactNode } from "react";
import { Sidebar } from "@/components/ui/Sidebar";
import { NotificationProvider } from "@/lib/notification-context";
import { PauseBanner } from "@/components/admin/PauseBanner";

/**
 * Client-side shell for the authenticated layout.
 * Wraps sidebar + content in the notification context so the
 * badge count stays in sync when notifications are marked read.
 * PauseBanner sits above content when platform is paused.
 */
export function AuthenticatedShell({
  isAdmin,
  adminRole,
  children,
}: {
  isAdmin: boolean;
  adminRole: string | null;
  children: ReactNode;
}) {
  return (
    <NotificationProvider enabled={isAdmin}>
      <Sidebar isAdmin={isAdmin} adminRole={adminRole} />
      <main className="lg:ml-64 min-h-screen">
        <PauseBanner isAdmin={isAdmin} />
        <div className="p-6 lg:p-8 pt-16 lg:pt-8 max-w-6xl">
          {children}
        </div>
      </main>
    </NotificationProvider>
  );
}
