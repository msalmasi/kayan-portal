"use client";

import { useEntity } from "@/components/EntityConfigProvider";
import Link from "next/link";

/**
 * /privacy — Public privacy policy page.
 * Renders the privacy_text from entity config.
 * No auth required.
 */
export default function PrivacyPage() {
  const entity = useEntity();

  if (!entity.loaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (!entity.privacy_text) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm">No privacy policy has been configured.</p>
          <Link href="/login" className="text-brand-500 hover:text-brand-600 text-sm mt-2 inline-block">
            ← Back to portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          {entity.logoUrl && (
            <img src={entity.logoUrl} alt={entity.name} className="h-8 mb-4 brightness-0 opacity-70" />
          )}
          <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-1">{entity.name}</p>
          {entity.entity_address && (
            <p className="text-sm text-gray-400">{entity.entity_address}</p>
          )}
        </div>

        {/* Content — render paragraphs from plain text */}
        <div className="prose prose-sm prose-gray max-w-none">
          {entity.privacy_text.split("\n\n").map((paragraph, i) => {
            const trimmed = paragraph.trim();
            if (!trimmed) return null;

            // Detect headings (lines that are all caps or short and followed by content)
            const lines = trimmed.split("\n");
            if (lines.length === 1 && trimmed.length < 80 && trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
              return <h2 key={i} className="text-lg font-semibold text-gray-900 mt-8 mb-3">{trimmed}</h2>;
            }
            if (lines.length === 1 && trimmed.endsWith(":") && trimmed.length < 80) {
              return <h3 key={i} className="text-base font-semibold text-gray-800 mt-6 mb-2">{trimmed}</h3>;
            }

            return (
              <div key={i} className="mb-4">
                {lines.map((line, j) => (
                  <p key={j} className="text-sm text-gray-700 leading-relaxed mb-1">
                    {line}
                  </p>
                ))}
              </div>
            );
          })}
        </div>

        {/* Back link */}
        <div className="mt-12 pt-6 border-t border-gray-200 text-center">
          <Link href="/login" className="text-sm text-brand-500 hover:text-brand-600">
            ← Back to portal
          </Link>
        </div>
      </div>
    </div>
  );
}
