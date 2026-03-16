"use client";

import { useEntity } from "@/components/EntityConfigProvider";

/**
 * Legal footer showing entity name, registered address, and privacy policy link.
 * Used on login page and dashboard layout.
 */
export function LegalFooter({ className }: { className?: string }) {
  const entity = useEntity();

  if (!entity.loaded) return null;

  return (
    <footer className={`text-center text-xs text-gray-400 space-y-1 ${className || ""}`}>
      <p className="font-medium text-gray-500">{entity.name}</p>
      {entity.entity_address && (
        <p>{entity.entity_address}</p>
      )}
      <p className="flex items-center justify-center gap-3">
        {entity.privacy_url && (
          <a
            href={entity.privacy_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-500 hover:text-brand-600 underline underline-offset-2"
          >
            Privacy Policy
          </a>
        )}
        {entity.privacy_url && entity.supportEmail && (
          <span className="text-gray-300">·</span>
        )}
        {entity.supportEmail && (
          <a
            href={`mailto:${entity.supportEmail}`}
            className="text-brand-500 hover:text-brand-600 underline underline-offset-2"
          >
            Contact Support
          </a>
        )}
      </p>
    </footer>
  );
}
