"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  PqTemplateSection,
  PqTemplateField,
  PqFieldType,
  PqFieldOption,
  DEFAULT_PQ_SECTIONS,
} from "@/lib/pq-template";

// ── Helpers ──

const FIELD_TYPES: { value: PqFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
];

const inputCls = "w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
const smallBtn = "px-2 py-1 text-[11px] font-medium rounded-md transition-colors";

// ── Field-level option editor (for select / radio) ──

function OptionsEditor({
  options, onChange,
}: {
  options: PqFieldOption[]; onChange: (opts: PqFieldOption[]) => void;
}) {
  const add = () => onChange([...options, { value: `opt_${Date.now()}`, label: "" }]);
  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i));
  const update = (i: number, key: "value" | "label", val: string) => {
    const next = [...options];
    next[i] = { ...next[i], [key]: val };
    onChange(next);
  };

  return (
    <div className="ml-4 mt-1 space-y-1">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Options</p>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text" value={opt.value} onChange={(e) => update(i, "value", e.target.value)}
            placeholder="value" className={`${inputCls} w-28 text-xs font-mono`}
          />
          <input
            type="text" value={opt.label} onChange={(e) => update(i, "label", e.target.value)}
            placeholder="Label shown to investor" className={`${inputCls} flex-1 text-xs`}
          />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      ))}
      <button onClick={add} className={`${smallBtn} bg-gray-100 hover:bg-gray-200 text-gray-600`}>+ Option</button>
    </div>
  );
}

// ── Single field editor ──

function FieldEditor({
  field, sectionFields, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast,
}: {
  field: PqTemplateField;
  sectionFields: PqTemplateField[];
  onUpdate: (f: PqTemplateField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const hasOptions = field.type === "select" || field.type === "radio";

  // Collect all field IDs in this template for "show_when" dependency
  const otherFields = sectionFields.filter((f) => f.id !== field.id);

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
      {/* Row 1: ID + type + required + controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text" value={field.id}
          onChange={(e) => onUpdate({ ...field, id: e.target.value.replace(/\s/g, "_").toLowerCase() })}
          placeholder="field_id" className={`${inputCls} w-32 text-xs font-mono`}
        />
        <select
          value={field.type}
          onChange={(e) => onUpdate({ ...field, type: e.target.value as PqFieldType })}
          className={`${inputCls} w-28 text-xs bg-white`}
        >
          {FIELD_TYPES.map((ft) => (
            <option key={ft.value} value={ft.value}>{ft.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox" checked={!!field.required}
            onChange={(e) => onUpdate({ ...field, required: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600"
          />
          Required
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onMoveUp} disabled={isFirst} className={`${smallBtn} bg-gray-100 hover:bg-gray-200 text-gray-500 disabled:opacity-30`}>↑</button>
          <button onClick={onMoveDown} disabled={isLast} className={`${smallBtn} bg-gray-100 hover:bg-gray-200 text-gray-500 disabled:opacity-30`}>↓</button>
          <button onClick={onRemove} className={`${smallBtn} bg-red-50 hover:bg-red-100 text-red-600`}>Remove</button>
        </div>
      </div>

      {/* Row 2: Label */}
      <input
        type="text" value={field.label}
        onChange={(e) => onUpdate({ ...field, label: e.target.value })}
        placeholder="Label shown to investor"
        className={`${inputCls} text-xs`}
      />

      {/* Row 3: Placeholder + help text (collapsible) */}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text" value={field.placeholder || ""}
          onChange={(e) => onUpdate({ ...field, placeholder: e.target.value || undefined })}
          placeholder="Placeholder text (optional)" className={`${inputCls} text-xs`}
        />
        <input
          type="text" value={field.help_text || ""}
          onChange={(e) => onUpdate({ ...field, help_text: e.target.value || undefined })}
          placeholder="Help text (optional)" className={`${inputCls} text-xs`}
        />
      </div>

      {/* Conditional visibility */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">Show when:</span>
        <select
          value={field.show_when?.field || ""}
          onChange={(e) => {
            if (!e.target.value) {
              onUpdate({ ...field, show_when: undefined });
            } else {
              onUpdate({ ...field, show_when: { field: e.target.value, value: field.show_when?.value ?? "" } });
            }
          }}
          className={`${inputCls} w-36 text-xs bg-white`}
        >
          <option value="">Always visible</option>
          {otherFields.map((f) => (
            <option key={f.id} value={f.id}>{f.id}</option>
          ))}
        </select>
        {field.show_when && (
          <>
            <span className="text-[10px] text-gray-400">=</span>
            <input
              type="text" value={String(field.show_when.value ?? "")}
              onChange={(e) => {
                let val: any = e.target.value;
                if (val === "true") val = true;
                else if (val === "false") val = false;
                onUpdate({ ...field, show_when: { ...field.show_when!, value: val } });
              }}
              placeholder="value" className={`${inputCls} w-28 text-xs font-mono`}
            />
          </>
        )}
      </div>

      {/* Options (select/radio only) */}
      {hasOptions && (
        <OptionsEditor
          options={field.options || []}
          onChange={(opts) => onUpdate({ ...field, options: opts })}
        />
      )}
    </div>
  );
}

// ── Section editor ──

function SectionEditor({
  section, onUpdate, onRemove, onMoveUp, onMoveDown, isFirst, isLast,
}: {
  section: PqTemplateSection;
  onUpdate: (s: PqTemplateSection) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const addField = () => {
    const newField: PqTemplateField = {
      id: `field_${Date.now()}`,
      type: "text",
      label: "",
      required: false,
    };
    onUpdate({ ...section, fields: [...section.fields, newField] });
  };

  const updateField = (i: number, f: PqTemplateField) => {
    const next = [...section.fields];
    next[i] = f;
    onUpdate({ ...section, fields: next });
  };

  const removeField = (i: number) => {
    onUpdate({ ...section, fields: section.fields.filter((_, idx) => idx !== i) });
  };

  const moveField = (i: number, dir: -1 | 1) => {
    const next = [...section.fields];
    const j = i + dir;
    [next[i], next[j]] = [next[j], next[i]];
    onUpdate({ ...section, fields: next });
  };

  return (
    <div className="border border-gray-300 rounded-xl bg-gray-50 overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 border-b border-gray-200">
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-gray-600 text-sm">
          {collapsed ? "▶" : "▼"}
        </button>
        <input
          type="text" value={section.id}
          onChange={(e) => onUpdate({ ...section, id: e.target.value.replace(/\s/g, "_").toLowerCase() })}
          className={`${inputCls} w-28 text-xs font-mono`}
        />
        <input
          type="text" value={section.title}
          onChange={(e) => onUpdate({ ...section, title: e.target.value })}
          placeholder="Section title" className={`${inputCls} flex-1 text-xs font-medium`}
        />
        <span className="text-[10px] text-gray-400">{section.fields.length} fields</span>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} disabled={isFirst} className={`${smallBtn} bg-white hover:bg-gray-100 text-gray-500 disabled:opacity-30`}>↑</button>
          <button onClick={onMoveDown} disabled={isLast} className={`${smallBtn} bg-white hover:bg-gray-100 text-gray-500 disabled:opacity-30`}>↓</button>
          <button onClick={onRemove} className={`${smallBtn} bg-red-50 hover:bg-red-100 text-red-600`}>Remove</button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {/* Subtitle + description */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" value={section.subtitle || ""}
              onChange={(e) => onUpdate({ ...section, subtitle: e.target.value || undefined })}
              placeholder="Subtitle (optional)" className={`${inputCls} text-xs`}
            />
            <input
              type="text" value={section.description || ""}
              onChange={(e) => onUpdate({ ...section, description: e.target.value || undefined })}
              placeholder="Description paragraph (optional)" className={`${inputCls} text-xs`}
            />
          </div>

          {/* Fields */}
          {section.fields.map((field, fi) => (
            <FieldEditor
              key={`${section.id}-${fi}`}
              field={field}
              sectionFields={section.fields}
              onUpdate={(f) => updateField(fi, f)}
              onRemove={() => removeField(fi)}
              onMoveUp={() => moveField(fi, -1)}
              onMoveDown={() => moveField(fi, 1)}
              isFirst={fi === 0}
              isLast={fi === section.fields.length - 1}
            />
          ))}

          <button onClick={addField} className={`${smallBtn} bg-brand-50 hover:bg-brand-100 text-brand-700`}>
            + Add Field
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

interface TemplateListItem {
  id: string;
  version: number;
  name: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  notes: string | null;
  sections: PqTemplateSection[];
}

export default function PqTemplateEditor() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editing state
  const [editingSections, setEditingSections] = useState<PqTemplateSection[]>([]);
  const [editingName, setEditingName] = useState("");
  const [editingNotes, setEditingNotes] = useState("");
  const [editingFromId, setEditingFromId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Force resubmit
  const [resubmitMsg, setResubmitMsg] = useState("");
  const [resubmitting, setResubmitting] = useState(false);
  const [showResubmitConfirm, setShowResubmitConfirm] = useState(false);

  // ── Fetch templates ──
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/pq-templates");
    if (res.ok) {
      const { templates: t } = await res.json();
      setTemplates(t || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const activeTemplate = templates.find((t) => t.is_active);

  // ── Start editing ──
  const startEditing = (template?: TemplateListItem) => {
    if (template) {
      setEditingSections(JSON.parse(JSON.stringify(template.sections)));
      setEditingName(template.name);
      setEditingNotes("");
      setEditingFromId(template.id);
    } else {
      // New from default
      setEditingSections(JSON.parse(JSON.stringify(DEFAULT_PQ_SECTIONS)));
      setEditingName("Purchaser Questionnaire");
      setEditingNotes("Initial template from default");
      setEditingFromId(null);
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingSections([]);
  };

  // ── Save as new version ──
  const saveTemplate = async (activate: boolean) => {
    if (editingSections.length === 0) {
      toast.error("Template must have at least one section");
      return;
    }
    // Validate: every field needs an id and label
    for (const s of editingSections) {
      if (!s.id || !s.title) {
        toast.error(`Section "${s.id || "(unnamed)"}" needs an ID and title`);
        return;
      }
      for (const f of s.fields) {
        if (!f.id || !f.label) {
          toast.error(`Field in "${s.title}" needs an ID and label`);
          return;
        }
      }
    }

    setSaving(true);
    const res = await fetch("/api/admin/pq-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name: editingName,
        sections: editingSections,
        notes: editingNotes || null,
        activate,
      }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success(activate ? "Template saved and activated" : "Template saved as draft");
      setIsEditing(false);
      fetchTemplates();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to save");
    }
  };

  // ── Activate ──
  const activateTemplate = async (templateId: string) => {
    const res = await fetch("/api/admin/pq-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate", template_id: templateId }),
    });
    if (res.ok) {
      toast.success("Template activated");
      fetchTemplates();
    } else {
      toast.error("Failed to activate template");
    }
  };

  // ── Delete ──
  const deleteTemplate = async (templateId: string) => {
    const res = await fetch("/api/admin/pq-templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId }),
    });
    if (res.ok) {
      toast.success("Template deleted");
      fetchTemplates();
    } else {
      const err = await res.json();
      toast.error(err.error || "Cannot delete active template");
    }
  };

  // ── Force resubmit ──
  const forceResubmit = async () => {
    setResubmitting(true);
    const res = await fetch("/api/admin/pq-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "force_resubmit", message: resubmitMsg || undefined }),
    });
    setResubmitting(false);
    setShowResubmitConfirm(false);
    setResubmitMsg("");

    if (res.ok) {
      const data = await res.json();
      toast.success(data.message || "Resubmit triggered");
    } else {
      toast.error("Failed to trigger resubmit");
    }
  };

  // ── Section CRUD ──
  const addSection = () => {
    setEditingSections((prev) => [
      ...prev,
      {
        id: `section_${String.fromCharCode(97 + prev.length)}`,
        title: `Section ${String.fromCharCode(65 + prev.length)}`,
        fields: [],
      },
    ]);
  };

  const updateSection = (i: number, s: PqTemplateSection) => {
    setEditingSections((prev) => {
      const next = [...prev];
      next[i] = s;
      return next;
    });
  };

  const removeSection = (i: number) => {
    setEditingSections((prev) => prev.filter((_, idx) => idx !== i));
  };

  const moveSection = (i: number, dir: -1 | 1) => {
    setEditingSections((prev) => {
      const next = [...prev];
      const j = i + dir;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ── Template List (when not editing) ── */}
      {!isEditing && (
        <>
          <Card>
            <CardHeader
              title="Purchaser Questionnaire Templates"
              subtitle="Define the sections and fields investors see when completing their PQ"
            />

            {loading ? (
              <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>
            ) : templates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-3">No templates yet. Create one from the default Reg S questionnaire.</p>
                <Button onClick={() => startEditing()}>Create Default Template</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${t.is_active ? "border-brand-300 bg-brand-50" : "border-gray-200 bg-white"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{t.name}</span>
                        <span className="text-[10px] font-mono text-gray-400">v{t.version}</span>
                        {t.is_active && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-100 text-brand-700">Active</span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">
                        {t.sections.length} sections · {t.sections.reduce((n, s) => n + s.fields.length, 0)} fields
                        {t.notes ? ` · ${t.notes}` : ""}
                        {" "}· by {t.created_by} · {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => startEditing(t)} className={`${smallBtn} bg-gray-100 hover:bg-gray-200 text-gray-700`}>
                        Edit
                      </button>
                      {!t.is_active && (
                        <>
                          <button onClick={() => activateTemplate(t.id)} className={`${smallBtn} bg-brand-50 hover:bg-brand-100 text-brand-700`}>
                            Activate
                          </button>
                          <button onClick={() => deleteTemplate(t.id)} className={`${smallBtn} bg-red-50 hover:bg-red-100 text-red-600`}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {templates.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <Button variant="secondary" size="sm" onClick={() => startEditing(activeTemplate || templates[0])}>
                  New Version from {activeTemplate ? "Active" : "Latest"}
                </Button>
              </div>
            )}
          </Card>

          {/* ── Force Resubmit Card ── */}
          <Card>
            <CardHeader
              title="Force PQ Resubmission"
              subtitle="Require all approved investors to resubmit their questionnaire"
            />
            <p className="text-xs text-gray-500 mb-3">
              Use this after making changes to the template that require investors to re-certify.
              All investors with an "Approved" PQ status will be reset to "Sent" and notified by email.
            </p>

            {!showResubmitConfirm ? (
              <Button variant="secondary" size="sm" onClick={() => setShowResubmitConfirm(true)}>
                Force All Resubmissions
              </Button>
            ) : (
              <div className="space-y-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-800">
                  This will reset all approved PQs and email every affected investor.
                </p>
                <textarea
                  value={resubmitMsg}
                  onChange={(e) => setResubmitMsg(e.target.value)}
                  rows={2}
                  placeholder="Optional message to include in the email (e.g., reason for update)"
                  className={`${inputCls} text-xs`}
                />
                <div className="flex items-center gap-2">
                  <Button onClick={forceResubmit} loading={resubmitting} className="text-xs">
                    Confirm & Send
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowResubmitConfirm(false); setResubmitMsg(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ── Template Editor (when editing) ── */}
      {isEditing && (
        <>
          {/* Header bar */}
          <div className="flex items-center justify-between sticky top-0 z-10 bg-white py-3 border-b border-gray-200 -mx-1 px-1">
            <div className="flex items-center gap-3">
              <button onClick={cancelEditing} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
              <input
                type="text" value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                className={`${inputCls} w-64 font-medium`}
                placeholder="Template name"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => saveTemplate(false)} loading={saving}>
                Save Draft
              </Button>
              <Button size="sm" onClick={() => saveTemplate(true)} loading={saving}>
                Save & Activate
              </Button>
            </div>
          </div>

          {/* Notes */}
          <input
            type="text" value={editingNotes}
            onChange={(e) => setEditingNotes(e.target.value)}
            placeholder="Version notes (e.g., 'Added Malaysian SC section')"
            className={`${inputCls} text-xs`}
          />

          {/* Sections */}
          <div className="space-y-4">
            {editingSections.map((section, si) => (
              <SectionEditor
                key={`${section.id}-${si}`}
                section={section}
                onUpdate={(s) => updateSection(si, s)}
                onRemove={() => removeSection(si)}
                onMoveUp={() => moveSection(si, -1)}
                onMoveDown={() => moveSection(si, 1)}
                isFirst={si === 0}
                isLast={si === editingSections.length - 1}
              />
            ))}
          </div>

          <button onClick={addSection} className={`${smallBtn} bg-brand-50 hover:bg-brand-100 text-brand-700 w-full py-2`}>
            + Add Section
          </button>

          {/* Bottom save bar */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <Button variant="secondary" size="sm" onClick={() => saveTemplate(false)} loading={saving}>
              Save Draft
            </Button>
            <Button size="sm" onClick={() => saveTemplate(true)} loading={saving}>
              Save & Activate
            </Button>
            <button onClick={cancelEditing} className="text-sm text-gray-500 hover:text-gray-700 ml-auto">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
