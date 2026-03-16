"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { EntityConfig } from "@/lib/entity-config";

// ─── Context ─────────────────────────────────────────────────

interface EntityConfigWithPalette extends EntityConfig {
  palette: Record<string, string>;
}

const EntityConfigContext = createContext<EntityConfigWithPalette | null>(null);

/**
 * Hook to access entity config from any client component.
 * Returns null during initial load — components should handle this.
 */
export function useEntityConfig(): EntityConfigWithPalette | null {
  return useContext(EntityConfigContext);
}

/**
 * Convenience hook that returns config with defaults while loading.
 * Avoids null checks in most components.
 */
export function useEntity() {
  const config = useContext(EntityConfigContext);
  // Inline defaults for the most commonly accessed fields
  return {
    name: config?.entity_name ?? "Investor Portal",
    project: config?.project_name ?? "Token",
    ticker: config?.token_ticker ?? "TOKEN",
    supportEmail: config?.support_email ?? "",
    logoUrl: config?.logo_url ?? "",
    logoLightUrl: config?.logo_light_url ?? "",
    websiteUrl: config?.website_url ?? "",
    portalTitle: config?.portal_title ?? "Investor Portal",
    primary: config?.brand_primary ?? "1a3c2a",
    accent: config?.brand_accent ?? "2d5f3f",
    disclaimer: config?.disclaimer_entity ?? "Investor Portal",
    footer: config?.footer_text ?? "",
    entity_address: config?.entity_address ?? "",
    privacy_text: config?.privacy_text ?? "",
    issuer_jurisdiction: config?.issuer_jurisdiction ?? "",
    loaded: !!config,
  };
}

// ─── Provider ────────────────────────────────────────────────

export function EntityConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<EntityConfigWithPalette | null>(null);

  useEffect(() => {
    fetch("/api/entity-config")
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);

        // Inject brand palette as CSS custom properties on :root
        // This lets Tailwind's `brand-*` utilities work dynamically
        if (data.palette) {
          const root = document.documentElement;
          for (const [shade, hex] of Object.entries(data.palette)) {
            root.style.setProperty(`--brand-${shade}`, `#${hex}`);
          }
          // Scrollbar colors (separate from brand palette)
          if (data.scrollbar_color) {
            root.style.setProperty("--scrollbar-color", `#${data.scrollbar_color}`);
          }
          if (data.scrollbar_hover) {
            root.style.setProperty("--scrollbar-hover", `#${data.scrollbar_hover}`);
          }
        }
      })
      .catch(() => {
        // Silently fall back — useEntity() returns inline defaults
      });
  }, []);

  return (
    <EntityConfigContext.Provider value={config}>
      {children}
    </EntityConfigContext.Provider>
  );
}
