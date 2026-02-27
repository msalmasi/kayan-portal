"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAdminRole } from "@/lib/hooks";
import { SaftRound, DocTemplate, DOC_TYPE_LABELS, SAFT_PLACEHOLDERS } from "@/lib/types";

/**
 * /admin/documents — Template management
 *
 * Upload SAFT (.docx), PPM (.pdf), and CIS (.pdf) templates.
 * SAFT and PPM are per-round. CIS is global.
 */
export default function AdminDocumentsPage() {
  const { canWrite } = useAdminRole();
  const [rounds, setRounds] = useState<SaftRound[]>([]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Upload form state
  const [uploadType, setUploadType] = useState<"saft" | "ppm" | "cis">("saft");
  const [uploadRound, setUploadRound] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const fetchData = useCallback(async () => {
    const [roundsRes, templatesRes] = await Promise.all([
      fetch("/api/admin/rounds"),
      fetch("/api/admin/documents/templates"),
    ]);
    if (roundsRes.ok) setRounds(await roundsRes.json());
    if (templatesRes.ok) setTemplates(await templatesRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Upload handler ──
  const handleUpload = async () => {
    if (!uploadFile) return;
    if ((uploadType === "saft" || uploadType === "ppm") && !uploadRound) {
      toast.error("Select a round");
      return;
    }

    setUploading(true);
    const form = new FormData();
    form.append("file", uploadFile);
    form.append("doc_type", uploadType);
    if (uploadRound) form.append("round_id", uploadRound);

    const res = await fetch("/api/admin/documents/templates", {
      method: "POST",
      body: form,
    });

    setUploading(false);
    if (res.ok) {
      const result = await res.json();
      toast.success(result.message);
      if (result.placeholders_found) {
        toast.info(`Found ${result.placeholders_found} placeholder(s) in template`);
      }
      setUploadFile(null);
      setUploadRound("");
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "Upload failed");
    }
  };

  // ── Delete handler ──
  const handleDelete = async (id: string) => {
    if (!confirm("Remove this template?")) return;
    const res = await fetch(`/api/admin/documents/templates?id=${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Template removed"); fetchData(); }
    else toast.error("Failed to remove");
  };

  // ── Group templates by round ──
  const getRoundName = (roundId: string | null) => {
    if (!roundId) return "Global (All Rounds)";
    return rounds.find((r) => r.id === roundId)?.name || roundId;
  };

  const roundTemplates = rounds.map((round) => ({
    round,
    saft: templates.find((t) => t.doc_type === "saft" && t.round_id === round.id),
    ppm: templates.find((t) => t.doc_type === "ppm" && t.round_id === round.id),
  }));

  const cis = templates.find((t) => t.doc_type === "cis");

  const inputCls = "px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kayan-500 bg-white";

  if (loading) return <div className="flex items-center justify-center min-h-[40vh]"><p className="text-gray-400">Loading...</p></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Document Templates</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage SAFT, PPM, and CIS templates for each round
        </p>
      </div>

      {/* ── SAFT Placeholder Reference ── */}
      <Card>
        <CardHeader
          title="SAFT Placeholder Reference"
          subtitle="Use these in your .docx template with double curly braces"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SAFT_PLACEHOLDERS.map((p) => (
            <code key={p} className="bg-gray-100 rounded px-2 py-1 text-xs text-gray-700 font-mono">
              {`{${p}}`}
            </code>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Place these inside your Word document where you want investor data filled in.
          Use single curly braces (docxtemplater syntax).
        </p>
      </Card>

      {/* ── CIS (Global) ── */}
      <Card>
        <CardHeader title="Company Information Sheet (CIS)" subtitle="Same for all rounds" />
        {cis ? (
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{cis.file_name}</p>
                <p className="text-xs text-gray-400">
                  Uploaded {new Date(cis.created_at).toLocaleDateString()} by {cis.uploaded_by || "—"}
                </p>
              </div>
            </div>
            {canWrite && (
              <button onClick={() => handleDelete(cis.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-3">No CIS uploaded yet.</p>
        )}
      </Card>

      {/* ── Per-Round Templates ── */}
      {roundTemplates.map(({ round, saft, ppm }) => (
        <Card key={round.id}>
          <CardHeader title={round.name} subtitle={`$${Number(round.token_price)} per token`} />

          {/* SAFT */}
          <div className="mb-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">SAFT Template (.docx)</h4>
            {saft ? (
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{saft.file_name}</p>
                  <p className="text-xs text-gray-400">
                    {(saft.placeholders as string[] | null)?.length || 0} placeholders •{" "}
                    Uploaded {new Date(saft.created_at).toLocaleDateString()}
                  </p>
                  {saft.placeholders && (saft.placeholders as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(saft.placeholders as string[]).map((p: string) => (
                        <code key={p} className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs font-mono text-gray-600">
                          {p}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
                {canWrite && (
                  <button onClick={() => handleDelete(saft.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                ⚠ No SAFT template — documents cannot be generated for this round.
              </p>
            )}
          </div>

          {/* PPM */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">PPM (.pdf)</h4>
            {ppm ? (
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{ppm.file_name}</p>
                  <p className="text-xs text-gray-400">Uploaded {new Date(ppm.created_at).toLocaleDateString()}</p>
                </div>
                {canWrite && (
                  <button onClick={() => handleDelete(ppm.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 bg-gray-50 rounded-lg p-3">No PPM uploaded.</p>
            )}
          </div>
        </Card>
      ))}

      {rounds.length === 0 && (
        <Card>
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No rounds created yet. Create rounds first in the Rounds page.</p>
          </div>
        </Card>
      )}

      {/* ── Upload Form ── */}
      {canWrite && (
        <Card>
          <CardHeader title="Upload Template" subtitle="Upload a new document template" />
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Document Type</label>
                <select
                  value={uploadType}
                  onChange={(e) => { setUploadType(e.target.value as any); if (e.target.value === "cis") setUploadRound(""); }}
                  className={inputCls + " w-full"}
                >
                  <option value="saft">SAFT Template (.docx)</option>
                  <option value="ppm">PPM (.pdf)</option>
                  <option value="cis">CIS (.pdf)</option>
                </select>
              </div>
              {uploadType !== "cis" && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Round</label>
                  <select
                    value={uploadRound}
                    onChange={(e) => setUploadRound(e.target.value)}
                    className={inputCls + " w-full"}
                  >
                    <option value="">Select round...</option>
                    {rounds.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">File</label>
                <input
                  type="file"
                  accept={uploadType === "saft" ? ".docx" : ".pdf"}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-kayan-50 file:text-kayan-700 hover:file:bg-kayan-100"
                />
              </div>
            </div>
            <Button
              onClick={handleUpload}
              loading={uploading}
              disabled={!uploadFile || (uploadType !== "cis" && !uploadRound)}
            >
              Upload Template
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
