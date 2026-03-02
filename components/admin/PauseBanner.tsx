"use client";

import { useState, useEffect } from "react";

// ============================================================
// PauseBanner — Sticky banner shown when platform is paused.
//
// For admins: amber warning with link to settings.
// For investors: clean maintenance message with reason.
// ============================================================

interface PauseBannerProps {
  isAdmin?: boolean;
}

export function PauseBanner({ isAdmin = false }: PauseBannerProps) {
  const [paused, setPaused] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const checkPause = async () => {
      try {
        // Admin endpoint returns full status; public endpoint for investors
        const endpoint = isAdmin
          ? "/api/admin/platform-pause"
          : "/api/platform-status";

        const res = await fetch(endpoint);

        if (res.ok) {
          const data = await res.json();
          setPaused(data.paused ?? false);
          setReason(data.reason || null);
        }
      } catch { /* silent */ }
    };

    checkPause();
    // Re-check every 30s in case admin toggles
    const interval = setInterval(checkPause, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  if (!paused) return null;

  // Admin banner — amber, actionable
  if (isAdmin) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <p className="text-sm font-medium text-amber-800">
            Platform is paused
            {reason && <span className="font-normal text-amber-600"> — {reason}</span>}
          </p>
        </div>
        <a
          href="/admin/settings"
          className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
        >
          Manage in Settings
        </a>
      </div>
    );
  }

  // Investor banner — clean, informational
  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2 justify-center">
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <p className="text-sm text-gray-600">
          {reason || "The platform is undergoing scheduled maintenance. Some actions may be temporarily unavailable."}
        </p>
      </div>
    </div>
  );
}
