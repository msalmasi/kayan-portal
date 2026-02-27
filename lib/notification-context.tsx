"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

// ─── Context shape ──────────────────────────────────────────

interface NotificationContextValue {
  /** Current unread notification count */
  unreadCount: number;
  /** Refetch from the server (call after marking read, etc.) */
  refresh: () => void;
  /** Optimistically decrement by n (for instant UI feedback) */
  decrement: (n?: number) => void;
  /** Set count to zero (e.g. mark-all-read) */
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  refresh: () => {},
  decrement: () => {},
  clearAll: () => {},
});

// ─── Hook ───────────────────────────────────────────────────

export function useNotifications() {
  return useContext(NotificationContext);
}

// ─── Provider ───────────────────────────────────────────────

/**
 * Wraps the admin layout. Polls unread count every 60s and exposes
 * helpers so child components can update the badge instantly.
 */
export function NotificationProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread count from the server
  const refresh = useCallback(() => {
    if (!enabled) return;
    fetch("/api/admin/notifications?count_only=true")
      .then((r) => r.json())
      .then((d) => setUnreadCount(d.unread_count || 0))
      .catch(() => {});
  }, [enabled]);

  // Initial fetch + polling
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [enabled, refresh]);

  // Optimistic decrement (e.g. marking 1 notification read)
  const decrement = useCallback((n = 1) => {
    setUnreadCount((prev) => Math.max(0, prev - n));
  }, []);

  // Optimistic clear (e.g. mark-all-read)
  const clearAll = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <NotificationContext.Provider value={{ unreadCount, refresh, decrement, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}
