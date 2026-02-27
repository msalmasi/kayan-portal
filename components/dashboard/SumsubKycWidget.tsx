"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { KycBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

/**
 * SumsubKycWidget — Embedded KYC verification
 *
 * Three visual states:
 *   1. "unverified" → shows a CTA to start verification, then loads the SDK
 *   2. "pending"    → shows "under review" message
 *   3. "verified"   → shows green confirmation
 *
 * The Sumsub Web SDK is loaded dynamically only when the investor
 * clicks "Start Verification" to keep the initial bundle small.
 */

interface SumsubKycWidgetProps {
  kycStatus: string;
  investorName: string;
}

export function SumsubKycWidget({
  kycStatus,
  investorName,
}: SumsubKycWidgetProps) {
  const [showWidget, setShowWidget] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkComplete, setSdkComplete] = useState(false);

  // ── Fetch access token from our API ──
  const fetchToken = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/investor/kyc/token", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start verification");
      }

      setAccessToken(data.token);
      setShowWidget(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Token refresh handler (Sumsub SDK calls this when token expires) ──
  const handleTokenRefresh = useCallback(async () => {
    const res = await fetch("/api/investor/kyc/token", { method: "POST" });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error);
    return data.token;
  }, []);

  // ── Load Sumsub SDK script dynamically ──
  useEffect(() => {
    if (!showWidget || !accessToken) return;

    // Load the Sumsub Web SDK from CDN
    const existingScript = document.getElementById("sumsub-websdk");
    if (existingScript) {
      initSdk(accessToken);
      return;
    }

    const script = document.createElement("script");
    script.id = "sumsub-websdk";
    script.src =
      "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
    script.async = true;
    script.onload = () => initSdk(accessToken);
    script.onerror = () => setError("Failed to load verification widget");
    document.head.appendChild(script);

    return () => {
      // Cleanup: remove the widget container content on unmount
      const container = document.getElementById("sumsub-websdk-container");
      if (container) container.innerHTML = "";
    };
  }, [showWidget, accessToken]);

  // ── Initialize Sumsub SDK ──
  const initSdk = (token: string) => {
    const snsWebSdkInstance = (window as any).snsWebSdk
      .init(token, () => handleTokenRefresh())
      .withConf({
        lang: "en",
        theme: "light",
      })
      .withOptions({
        addViewportTag: false,
        adaptIframeHeight: true,
      })
      .on("idCheck.onStepCompleted", (payload: any) => {
        console.log("[KYC] Step completed:", payload);
      })
      .on("idCheck.onError", (error: any) => {
        console.error("[KYC] SDK error:", error);
        setError("Verification encountered an error. Please try again.");
      })
      .on("idCheck.applicantStatus", (payload: any) => {
        // Fires when Sumsub has a final decision (or goes to pending)
        console.log("[KYC] Applicant status:", payload);
        if (
          payload?.reviewStatus === "completed" ||
          payload?.reviewStatus === "pending"
        ) {
          setSdkComplete(true);
        }
      })
      .build();

    snsWebSdkInstance.launch("#sumsub-websdk-container");
  };

  // ── VERIFIED STATE ──
  if (kycStatus === "verified") {
    return (
      <Card>
        <CardHeader
          title="Identity Verification (KYC)"
          subtitle="Your identity has been verified"
        />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <KycBadge status="verified" />
            <p className="text-xs text-gray-500 mt-1">
              Identity verification complete. No further action needed.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // ── PENDING STATE (submitted, under review) ──
  if (kycStatus === "pending" || sdkComplete) {
    return (
      <Card>
        <CardHeader
          title="Identity Verification (KYC)"
          subtitle="Your documents are under review"
        />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-amber-600 animate-pulse"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <KycBadge status="pending" />
            <p className="text-xs text-gray-500 mt-1">
              Your documents have been submitted and are being reviewed. This
              typically takes a few minutes. You&apos;ll receive an email when
              complete.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // ── UNVERIFIED — WIDGET ACTIVE ──
  if (showWidget && accessToken) {
    return (
      <Card>
        <CardHeader
          title="Identity Verification (KYC)"
          subtitle="Complete the steps below to verify your identity"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchToken();
              }}
              className="text-sm text-red-600 underline mt-1"
            >
              Try again
            </button>
          </div>
        )}

        {/* Sumsub SDK renders inside this container */}
        <div
          id="sumsub-websdk-container"
          className="min-h-[500px] rounded-lg overflow-hidden"
        />
      </Card>
    );
  }

  // ── UNVERIFIED — CTA TO START ──
  return (
    <Card>
      <CardHeader
        title="Identity Verification (KYC)"
        subtitle="Required to receive your subscription documents"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </div>
          <div>
            <KycBadge status="unverified" />
            <p className="text-xs text-gray-500 mt-1">
              Verify your identity to unlock your documents and proceed with
              your investment.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={fetchToken}
          disabled={loading}
        >
          {loading ? "Loading..." : "Start Verification"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </Card>
  );
}
