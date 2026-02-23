"use client";

import { useState, useEffect } from "react";

/**
 * Hook to fetch the current admin user's role.
 * Returns { role, canWrite, loading }
 *
 * canWrite is true for super_admin, admin, and manager.
 * Staff have view-only access (canWrite = false).
 */
export function useAdminRole() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((data) => setRole(data.role || null))
      .catch(() => setRole(null))
      .finally(() => setLoading(false));
  }, []);

  // Staff is view-only — everyone else can write
  const canWrite = !!role && role !== "staff";

  return { role, canWrite, loading };
}
