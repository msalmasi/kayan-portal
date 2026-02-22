"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AdminUser } from "@/lib/types";

/** Maps role strings to badge variants and display labels */
const roleBadge: Record<string, { variant: "green" | "yellow" | "gray"; label: string }> = {
  super_admin: { variant: "green", label: "Super Admin" },
  admin:       { variant: "yellow", label: "Admin" },
  manager:     { variant: "gray", label: "Manager" },
};

export default function TeamPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("manager");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");

    if (res.status === 403) {
      // Manager trying to access — they shouldn't be here
      toast.error("You don't have permission to manage team members");
      setLoading(false);
      return;
    }

    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const resetForm = () => {
    setNewEmail("");
    setNewRole("manager");
    setShowForm(false);
  };

  /** Add a new admin/manager */
  const handleAdd = async () => {
    if (!newEmail) return;
    setSaving(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, role: newRole }),
    });

    setSaving(false);

    if (res.ok) {
      toast.success(`Added ${newEmail} as ${roleBadge[newRole]?.label}`);
      resetForm();
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to add team member");
    }
  };

  /** Update a user's role */
  const handleRoleChange = async (userId: string, newRole: string) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, role: newRole }),
    });

    if (res.ok) {
      toast.success("Role updated");
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to update role");
    }
  };

  /** Remove a team member */
  const handleRemove = async (user: AdminUser) => {
    if (!confirm(`Remove ${user.email} from the team?`)) return;

    const res = await fetch(`/api/admin/users?id=${user.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      toast.success(`Removed ${user.email}`);
      fetchUsers();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to remove team member");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/investors"
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage admin and manager access to the portal
          </p>
        </div>
      </div>

      {/* Role Descriptions */}
      <Card>
        <CardHeader title="Roles" subtitle="What each role can do" />
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <Badge variant="green">Super Admin</Badge>
            <span className="text-gray-600">Full access including managing all team members</span>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="yellow">Admin</Badge>
            <span className="text-gray-600">
              Full access. Can add/remove Managers and Admins, but not Super Admins.
            </span>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="gray">Manager</Badge>
            <span className="text-gray-600">
              Can manage investors, rounds, allocations, and CSV imports. Cannot manage team members.
            </span>
          </div>
        </div>
      </Card>

      {/* Team Members */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardHeader
            title="Team Members"
            subtitle={`${users.length} member${users.length !== 1 ? "s" : ""}`}
          />
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            {showForm ? "Cancel" : "Add Member"}
          </Button>
        </div>

        {/* Add Form */}
        {showForm && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="team@kayanforest.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500"
                />
              </div>
              <div className="sm:w-40">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-kayan-500"
                >
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAdd}
                  loading={saving}
                  disabled={!newEmail}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Members Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Email</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Role</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Added</th>
                <th className="text-right py-3 px-2 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-400">
                    No team members found
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const badge = roleBadge[u.role] || roleBadge.manager;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                    >
                      <td className="py-3 px-2 font-medium text-gray-900">
                        {u.email}
                      </td>
                      <td className="py-3 px-2">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-kayan-500"
                        >
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-2 text-gray-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <button
                          onClick={() => handleRemove(u)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
