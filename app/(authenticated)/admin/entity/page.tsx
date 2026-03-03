"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { DEFAULT_ENTITY_CONFIG, EntityConfig } from "@/lib/entity-config";

// ─── Field group helper ──────────────────────────────────────

interface FieldProps {
  label: string;
  field: keyof EntityConfig;
  placeholder?: string;
  hint?: string;
  type?: "text" | "url" | "email" | "color";
}

function Field({
  label, field, placeholder, hint, type = "text",
  value, onChange,
}: FieldProps & { value: string; onChange: (field: keyof EntityConfig, val: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2">
        {type === "color" ? (
          <>
            {/* Color swatch + hex input */}
            <input
              type="color"
              value={`#${value}`}
              onChange={(e) => onChange(field, e.target.value.replace("#", ""))}
              className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(field, e.target.value.replace("#", ""))}
              placeholder="1a3c2a"
              maxLength={6}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </>
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(field, e.target.value)}
            placeholder={placeholder || (DEFAULT_ENTITY_CONFIG as any)[field]}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        )}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function EntitySettingsPage() {
  const [config, setConfig] = useState<EntityConfig>({ ...DEFAULT_ENTITY_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load current config
  useEffect(() => {
    fetch("/api/admin/entity-config")
      .then((r) => r.json())
      .then((data) => {
        setConfig({ ...DEFAULT_ENTITY_CONFIG, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = (field: keyof EntityConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/entity-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Entity settings saved — refresh to see changes");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
    setSaving(false);
  };

  const handleReset = () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    setConfig({ ...DEFAULT_ENTITY_CONFIG });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-100 rounded w-48 animate-pulse" />
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entity Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure branding, logos, colors, and contact info for the portal
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        </div>
      </div>

      {/* Identity */}
      <Card>
        <CardHeader
          title="Identity"
          subtitle="Legal entity name and project name used throughout the portal"
        />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field
            label="Entity Name"
            field="entity_name"
            hint="Legal name shown in documents and footers"
            value={config.entity_name}
            onChange={handleChange}
          />
          <Field
            label="Project / Token Name"
            field="project_name"
            hint="Used in email subjects and UI references"
            value={config.project_name}
            onChange={handleChange}
          />
          <Field
            label="Portal Title"
            field="portal_title"
            hint="Browser tab title"
            value={config.portal_title}
            onChange={handleChange}
          />
          <Field
            label="Disclaimer Entity"
            field="disclaimer_entity"
            hint="Name shown in the terms disclaimer modal"
            value={config.disclaimer_entity}
            onChange={handleChange}
          />
        </div>
      </Card>

      {/* URLs & Logos */}
      <Card>
        <CardHeader
          title="URLs & Logos"
          subtitle="Portal URL, marketing site, and logo assets"
        />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field
            label="Portal URL"
            field="portal_url"
            type="url"
            hint="Full URL of this portal (used in emails)"
            value={config.portal_url}
            onChange={handleChange}
          />
          <Field
            label="Website URL"
            field="website_url"
            type="url"
            hint="Marketing site — used in disclaimer 'return' link"
            value={config.website_url}
            onChange={handleChange}
          />
          <Field
            label="Logo (dark background)"
            field="logo_url"
            type="url"
            hint="White logo for sidebar, login, gate pages"
            value={config.logo_url}
            onChange={handleChange}
          />
          <Field
            label="Logo (light background)"
            field="logo_light_url"
            type="url"
            hint="Logo for email headers"
            value={config.logo_light_url}
            onChange={handleChange}
          />
        </div>

        {/* Logo preview */}
        <div className="mt-4 flex gap-4">
          <div className="flex items-center justify-center w-48 h-16 rounded-lg bg-gray-900 p-3">
            <img src={config.logo_url} alt="Dark preview" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex items-center justify-center w-48 h-16 rounded-lg bg-white border border-gray-200 p-3">
            <img src={config.logo_light_url} alt="Light preview" className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader
          title="Contact & Email"
          subtitle="Support email and sender identity for outgoing emails"
        />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field
            label="Support Email"
            field="support_email"
            type="email"
            hint="Shown on login, dashboard, and payment pages"
            value={config.support_email}
            onChange={handleChange}
          />
          <Field
            label="Email Sender Name"
            field="email_from_name"
            hint="Display name on outgoing emails"
            value={config.email_from_name}
            onChange={handleChange}
          />
          <Field
            label="Email Sender Address"
            field="email_from_address"
            type="email"
            hint="noreply address (overridden by EMAIL_FROM env var)"
            value={config.email_from_address}
            onChange={handleChange}
          />
          <Field
            label="Email Footer"
            field="footer_text"
            hint="Footer line in all outgoing emails"
            value={config.footer_text}
            onChange={handleChange}
          />
        </div>
      </Card>

      {/* Brand Colors */}
      <Card>
        <CardHeader
          title="Brand Colors"
          subtitle="Primary and accent colors — a full palette is auto-generated from the primary"
        />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field
            label="Primary Color"
            field="brand_primary"
            type="color"
            hint="Sidebar, buttons, email headers — the 600 shade"
            value={config.brand_primary}
            onChange={handleChange}
          />
          <Field
            label="Accent Color"
            field="brand_accent"
            type="color"
            hint="Charts, gradients — the 500 shade"
            value={config.brand_accent}
            onChange={handleChange}
          />
        </div>

        {/* Color preview strip */}
        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-2">Preview</p>
          <div className="flex gap-1 rounded-lg overflow-hidden h-8">
            {["primary", "accent"].map((key) => {
              const hex = key === "primary" ? config.brand_primary : config.brand_accent;
              return (
                <div
                  key={key}
                  className="flex-1 flex items-center justify-center text-white text-xs font-mono"
                  style={{ backgroundColor: `#${hex}` }}
                >
                  #{hex}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
