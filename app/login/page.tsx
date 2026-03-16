"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { useEntity } from "@/components/EntityConfigProvider";
import { LegalFooter } from "@/components/ui/LegalFooter";

/**
 * Inner login component — uses useSearchParams() which requires Suspense.
 */
function LoginForm() {
  const searchParams = useSearchParams();
  const entity = useEntity();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up error messages passed from the auth callback via query param
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      // Parse Supabase error messages into user-friendly text
      const msg = authError.message?.toLowerCase() || "";

      if (msg.includes("rate limit") || msg.includes("too many")) {
        setError(
          "Too many sign-in attempts. Please wait a few minutes before trying again."
        );
      } else if (msg.includes("not authorized") || msg.includes("not allowed")) {
        setError(
          "This email is not authorized to access the portal. Please contact support."
        );
      } else if (msg.includes("invalid") && msg.includes("email")) {
        setError("Please enter a valid email address.");
      } else {
        // Fallback — include the actual error for debugging
        setError(`Unable to send sign-in link. ${authError.message}`);
      }
      return;
    }

    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src={entity.logoUrl}
            alt={entity.name}
            className="h-10 w-auto"
          />
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          {sent ? (
            // ─── Success State ───
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-brand-500"
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
              <p className="text-xs text-gray-400 mt-3">
                Can&apos;t find it? Check your spam folder. Only the most recent
                link will work — older links are automatically invalidated.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setEmail("");
                  setError(null);
                }}
                className="text-sm text-brand-500 hover:text-brand-600 mt-4 font-medium"
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

              {/* Error banner — shown for callback errors and OTP errors */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

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
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder:text-gray-400"
                  />
                </div>

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

        {/* Footer */}
        <div className="mt-6 space-y-3">
          <p className="text-xs text-gray-400 text-center">
            Don&apos;t have an account?{" "}
            <a
              href={`mailto:${entity.supportEmail}`}
              className="text-brand-500 hover:text-brand-600"
            >
              Contact support
            </a>
          </p>
          <LegalFooter hideSupport />
        </div>
      </div>
    </div>
  );
}

/**
 * Page export — wraps LoginForm in Suspense for useSearchParams() compatibility.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
