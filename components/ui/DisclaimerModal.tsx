"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

const STORAGE_KEY = "kayan_terms_accepted";

/**
 * Full-screen modal disclaimer shown on first visit.
 * User must click "Agree" to proceed — choice is persisted in localStorage.
 * Mirrors the style of the kayanforest.com terms popup.
 */
export function DisclaimerModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if user hasn't previously accepted
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (!accepted) setVisible(true);
  }, []);

  const handleAgree = () => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setVisible(false);
  };

  const handleDisagree = () => {
    // Redirect away — they can't use the portal without accepting
    window.location.href = "https://www.kayanforest.com";
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 text-center border-b border-gray-100">
          {/* Icon */}
          <div className="w-14 h-14 rounded-full bg-kayan-50 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-kayan-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Terms and Conditions
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            You must read the below information before proceeding.
          </p>
        </div>

        {/* Scrollable Terms Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="prose prose-sm text-gray-600 leading-relaxed space-y-3">
            <p>
              By utilizing the Kayan Token Investor Portal{" "}
              <strong>(&ldquo;Portal&rdquo;)</strong> located at this website and
              any pages thereof, you acknowledge that you have read these terms
              and that you agree to be bound by them.
            </p>

            <p>
              This Portal is provided solely for the purpose of allowing
              investors to view information related to their token allocations
              under their respective SAFT agreements. All information displayed —
              including but not limited to token allocations, vesting schedules,
              unlock percentages, and round details — is presented{" "}
              <strong>for informational purposes only</strong> and does not
              constitute a guarantee, commitment, or binding obligation of any
              kind.
            </p>

            <p>
              The information shown on this Portal does not constitute and should
              not be construed as an offer to sell, or a solicitation of any
              offer to buy, securities or tokens in any jurisdiction. Nothing on
              this Portal constitutes financial, investment, legal, or tax
              advice.
            </p>

            <p>
              Token allocation amounts, vesting terms, and related data displayed
              on this Portal are{" "}
              <strong>subject to change without notice</strong>. Final token
              distribution terms are governed exclusively by your executed SAFT
              agreement and any amendments thereto. In the event of any
              discrepancy between information shown on this Portal and the terms
              of your SAFT agreement, the SAFT agreement shall prevail.
            </p>

            <p>
              This Portal is provided on an{" "}
              <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>{" "}
              basis. While we endeavor to ensure accuracy, this Portal may
              contain errors, bugs, or inaccuracies that could result in
              incorrect allocation amounts, vesting calculations, or other data
              being displayed. We make no warranties, express or implied,
              regarding the completeness, accuracy, reliability, or availability
              of any information presented.
            </p>

            <p>
              We accept no liability for any loss or damage whatsoever arising
              from reliance on any information displayed on this Portal. You are
              reminded to verify any information shown here against your SAFT
              agreement and to contact us directly with any questions regarding
              your allocation.
            </p>

            <p>
              We shall not be responsible or liable for any loss or damage caused
              to anyone as a result of any act or omission arising from their
              reliance on, or use of, information obtained from this Portal.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center mb-4">
            By clicking &ldquo;Agree&rdquo; below, you consent to be bound by
            these terms and conditions.
          </p>

          <div className="flex gap-3 justify-center">
            <Button variant="secondary" size="lg" onClick={handleDisagree}>
              Disagree
            </Button>
            <Button variant="primary" size="lg" onClick={handleAgree}>
              Agree
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
