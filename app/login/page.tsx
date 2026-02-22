"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";

/**
 * /login — Email magic link authentication
 *
 * Flow:
 *   1. User enters their email
 *   2. Supabase sends a magic link to that email
 *   3. User clicks the link → redirected to /auth/callback → /dashboard
 *
 * If the email doesn't match an investor record, they'll see the dashboard
 * but with no data (RLS handles this). We show a support message in that case.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Send magic link — Supabase handles the email
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // After clicking the magic link, redirect here
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      setError("Something went wrong. Please try again.");
      return;
    }

    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-kayan-50 via-white to-kayan-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src="https://kayanforest.com/wp-content/uploads/2025/06/kayan-new-logo.png"
            alt="Kayan Forest"
            className="h-10 w-auto"
          />
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          {sent ? (
            // ─── Success State ───
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-kayan-50 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-kayan-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Check your email
              </h2>
              <p className="text-sm text-gray-500 mt-2">
                We sent a sign-in link to{" "}
                <span className="font-medium text-gray-700">{email}</span>.
                Click the link to access your dashboard.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
                className="text-sm text-kayan-500 hover:text-kayan-600 mt-4 font-medium"
              >
                Use a different email
              </button>
            </div>
          ) : (
            // ─── Form State ───
            <>
              <div className="text-center mb-6">
                <h1 className="text-lg font-semibold text-gray-900">
                  Investor Portal
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Sign in with your email to view your $KAYAN allocation
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500 focus:border-transparent placeholder:text-gray-400"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  loading={loading}
                  className="w-full"
                  size="lg"
                >
                  Send Magic Link
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Footer note */}
        <p className="text-xs text-gray-400 text-center mt-6">
          Don&apos;t have an account?{" "}
          <a
            href="mailto:support@kayanforest.com"
            className="text-kayan-500 hover:text-kayan-600"
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
