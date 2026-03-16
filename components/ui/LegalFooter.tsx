"use client";

import Link from "next/link";
import { useEntity } from "@/components/EntityConfigProvider";

/**
 * Legal footer showing entity name, registered address, and privacy policy link.
 * Used on login page and dashboard layout.
 *
 * @param hideSupport - omit the "Contact Support" link (e.g., login page already has one)
 */
export function LegalFooter({ className, hideSupport }: { className?: string; hideSupport?: boolean }) {
  const entity = useEntity();

  if (!entity.loaded) return null;

  const hasPrivacy = !!entity.privacy_text;
  const hasSupport = !hideSupport && !!entity.supportEmail;

  return (
    <footer className={`text-center text-xs text-gray-400 space-y-1 ${className || ""}`}>
      <p className="font-medium text-gray-500">{entity.name}</p>
      {entity.entity_address && (
        <p>{entity.entity_address}</p>
      )}
      {(hasPrivacy || hasSupport) && (
        <p className="flex items-center justify-center gap-3">
          {hasPrivacy && (
            <Link
              href="/privacy"
              className="text-brand-500 hover:text-brand-600 underline underline-offset-2"
            >
              Privacy Policy
            </Link>
          )}
          {hasPrivacy && hasSupport && (
            <span className="text-gray-300">·</span>
          )}
          {hasSupport && (
            <a
              href={`mailto:${entity.supportEmail}`}
              className="text-brand-500 hover:text-brand-600 underline underline-offset-2"
            >
              Contact Support
            </a>
          )}
        </p>
      )}
    </footer>
  );
}
