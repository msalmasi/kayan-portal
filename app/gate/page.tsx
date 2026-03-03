"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useEntity } from "@/components/EntityConfigProvider";
import { COUNTRIES, RESTRICTED_COUNTRY_CODES, JURISDICTION_COOKIE } from "@/lib/jurisdictions";

/**
 * /gate — Jurisdiction Gate
 *
 * Regulation S compliance barrier. Users must:
 *   1. Select their country of residence from a dropdown
 *   2. Affirm whether they are a "U.S. Person" (SEC definition)
 *   3. Pass an IP-based geo check as a backstop
 *
 * If any check fails → redirected to /restricted (dead end).
 * If all pass → jurisdiction cookie set, redirected to /login.
 */
export default function JurisdictionGatePage() {
  const router = useRouter();
  const entity = useEntity();
  const [country, setCountry] = useState("");
  const [usPersonStatus, setUsPersonStatus] = useState<"yes" | "no" | null>(null);
  const [ipCountry, setIpCountry] = useState<string | null>(null);
  const [ipRestricted, setIpRestricted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // IP geo lookup on mount — pre-select country + detect restricted IPs
  useEffect(() => {
    fetch("/api/geo")
      .then((res) => res.json())
      .then((data) => {
        if (data.country) {
          setIpCountry(data.country);
          setIpRestricted(data.restricted);

          // Pre-select the dropdown if we got a country
          const match = COUNTRIES.find((c) => c.code === data.country);
          if (match) setCountry(match.code);
        }
      })
      .catch(() => {})
      .finally(() => setGeoLoading(false));
  }, []);

  const handleSubmit = () => {
    setError(null);

    // Validate all fields are filled
    if (!country) {
      setError("Please select your country of residence.");
      return;
    }
    if (usPersonStatus === null) {
      setError("Please confirm whether you are a U.S. Person.");
      return;
    }

    setLoading(true);

    // Check 1: Selected country is restricted
    if (RESTRICTED_COUNTRY_CODES.has(country)) {
      router.push("/restricted");
      return;
    }

    // Check 2: User affirmed they are a US Person
    if (usPersonStatus === "yes") {
      router.push("/restricted");
      return;
    }

    // Check 3: IP-based backstop — user selected non-US country but IP is US
    if (ipRestricted) {
      router.push("/restricted");
      return;
    }

    // All checks passed — set cookie and proceed
    // Cookie expires in 24 hours (re-verification on each session)
    document.cookie = `${JURISDICTION_COOKIE}=cleared; path=/; max-age=86400; SameSite=Lax`;
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img
            src={entity.logoUrl}
            alt={entity.name}
            className="h-10 w-auto"
          />
        </div>

        {/* Gate Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-amber-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-gray-900">
              Jurisdiction Verification
            </h1>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Before accessing the investor portal, please confirm your jurisdiction. This offering is not available to U.S. Persons or residents of certain restricted jurisdictions.
            </p>
          </div>

          {/* Country Selection */}
          <div className="space-y-5">
            <div>
              <label
                htmlFor="country"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Country of Residence *
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={geoLoading}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">
                  {geoLoading ? "Detecting location..." : "Select your country"}
                </option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* US Person Attestation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Are you a &ldquo;U.S. Person&rdquo; as defined under SEC Regulation S? *
              </label>
              <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                A &ldquo;U.S. Person&rdquo; includes any natural person resident in the
                United States, any entity organized under the laws of the United
                States, or any account held for the benefit of a U.S. Person,
                regardless of current physical location.
              </p>

              <div className="flex gap-4">
                <label
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border rounded-lg cursor-pointer transition-all text-sm font-medium ${
                    usPersonStatus === "yes"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="usPerson"
                    value="yes"
                    checked={usPersonStatus === "yes"}
                    onChange={() => setUsPersonStatus("yes")}
                    className="sr-only"
                  />
                  <span>Yes, I am</span>
                </label>

                <label
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border rounded-lg cursor-pointer transition-all text-sm font-medium ${
                    usPersonStatus === "no"
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="usPerson"
                    value="no"
                    checked={usPersonStatus === "no"}
                    onChange={() => setUsPersonStatus("no")}
                    className="sr-only"
                  />
                  <span>No, I am not</span>
                </label>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              loading={loading}
              className="w-full"
              size="lg"
            >
              Continue
            </Button>
          </div>

          {/* Legal footnote */}
          <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed">
            By proceeding, you represent and warrant that you are not a U.S.
            Person, that you are not located in or a resident of any restricted
            jurisdiction, and that you are accessing this portal in compliance
            with all applicable laws and regulations.
          </p>
        </div>
      </div>
    </div>
  );
}
