"use client";

import { ReactNode } from "react";
import { Sidebar } from "@/components/ui/Sidebar";
import { NotificationProvider } from "@/lib/notification-context";

/**
 * Client-side shell for the authenticated layout.
 * Wraps sidebar + content in the notification context so the
 * badge count stays in sync when notifications are marked read.
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
        <div className="p-6 lg:p-8 pt-16 lg:pt-8 max-w-6xl">
          {children}
        </div>
      </main>
    </NotificationProvider>
  );
}
