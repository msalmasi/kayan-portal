"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DOC_TYPE_LABELS, DOC_STATUS_LABELS } from "@/lib/types";

// ─── Types ──────────────────────────────────────────────────

interface DocListItem {
  id: string;
  doc_type: "saft" | "ppm" | "cis";
  round_id: string | null;
  status: "pending" | "viewed" | "signed";
  signed_at: string | null;
  created_at: string;
  saft_rounds: { name: string } | null;
}

interface DocDetail {
  id: string;
  doc_type: string;
  round_name: string | null;
  status: string;
  html_content: string | null;
  doc_hash: string | null;
  signed_at: string | null;
  signature_name: string | null;
  download_url: string | null;
  docx_download_url: string | null;
  signed_pdf_url: string | null;
}

// ─── Status Badge ───────────────────────────────────────────

function DocStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    viewed: "bg-blue-100 text-blue-700",
    signed: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
      {DOC_STATUS_LABELS[status as keyof typeof DOC_STATUS_LABELS] || status}
    </span>
  );
}

// ─── Doc Type Icon ──────────────────────────────────────────

function DocIcon({ type }: { type: string }) {
  if (type === "saft") {
    return (
      <div className="w-10 h-10 rounded-lg bg-kayan-50 flex items-center justify-center">
        <svg className="w-5 h-5 text-kayan-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
      <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Viewer state
  const [viewingDoc, setViewingDoc] = useState<DocDetail | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // Signing state
  const [signing, setSigning] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signatureName, setSignatureName] = useState("");
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const docViewerRef = useRef<HTMLDivElement>(null);

  // ── Load documents ──
  useEffect(() => {
    fetch("/api/investor/documents")
      .then((r) => r.json())
      .then(setDocs)
      .catch(() => toast.error("Failed to load documents"))
      .finally(() => setLoading(false));
  }, []);

  // ── Open document ──
  const openDoc = async (doc: DocListItem) => {
    // PPM and CIS — just open the PDF in a new tab
    if (doc.doc_type !== "saft") {
      setViewerLoading(true);
      const res = await fetch(`/api/investor/documents/${doc.id}`);
      const detail = await res.json();
      setViewerLoading(false);
      if (detail.download_url) {
        window.open(detail.download_url, "_blank");
        // Mark as viewed
        fetch(`/api/investor/documents/${doc.id}`, { method: "PATCH" });
        setDocs((prev) =>
          prev.map((d) => (d.id === doc.id && d.status === "pending" ? { ...d, status: "viewed" } : d))
        );
      } else {
        toast.error("Document not available for download yet");
      }
      return;
    }

    // SAFT — open in-portal viewer
    setViewerLoading(true);
    setHasScrolledToBottom(false);
    const res = await fetch(`/api/investor/documents/${doc.id}`);
    if (res.ok) {
      const detail = await res.json();
      setViewingDoc(detail);

      // Mark as viewed
      if (detail.status === "pending") {
        fetch(`/api/investor/documents/${doc.id}`, { method: "PATCH" });
        setDocs((prev) =>
          prev.map((d) => (d.id === doc.id && d.status === "pending" ? { ...d, status: "viewed" } : d))
        );
      }
    }
    setViewerLoading(false);
  };

  // ── Track scroll position ──
  const handleScroll = () => {
    if (!docViewerRef.current) return;
    const el = docViewerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (atBottom) setHasScrolledToBottom(true);
  };

  // ── Sign document ──
  const handleSign = async () => {
    if (!viewingDoc || !signatureName.trim()) return;

    setSigning(true);
    const res = await fetch(`/api/investor/documents/${viewingDoc.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature_name: signatureName.trim() }),
    });

    setSigning(false);
    setShowSignModal(false);

    if (res.ok) {
      const result = await res.json();
      toast.success("SAFT Agreement signed successfully");
      setViewingDoc((prev) =>
        prev ? { ...prev, status: "signed", signed_at: result.signed_at, signature_name: signatureName } : null
      );
      setDocs((prev) =>
        prev.map((d) => (d.id === viewingDoc.id ? { ...d, status: "signed", signed_at: result.signed_at } : d))
      );
    } else {
      const err = await res.json();
      toast.error(err.error || "Signing failed");
    }
  };

  // ── Close viewer ──
  const closeViewer = () => {
    setViewingDoc(null);
    setShowSignModal(false);
    setSignatureName("");
    setHasScrolledToBottom(false);
  };

  // ── Group docs by round ──
  const roundGroups = docs.reduce<Record<string, DocListItem[]>>((acc, doc) => {
    const key = doc.saft_rounds?.name || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-400">Loading documents...</p>
      </div>
    );
  }

  // ── No documents yet ──
  if (docs.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">Your subscription documents</p>
        </div>
        <Card>
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m3 0h3m-3 0h-3m-2.25-3.75H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">No documents yet</h2>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
              Your subscription documents will appear here once they are prepared.
              Please complete your KYC verification and Purchaser Questionnaire first.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ─── SAFT VIEWER (full screen overlay) ────────────────────

  if (viewingDoc) {
    const isSigned = viewingDoc.status === "signed";
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={closeViewer} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {DOC_TYPE_LABELS[viewingDoc.doc_type as keyof typeof DOC_TYPE_LABELS] || "Document"}
              </h2>
              {viewingDoc.round_name && (
                <p className="text-xs text-gray-500">{viewingDoc.round_name}</p>
              )}
            </div>
            <DocStatusBadge status={viewingDoc.status} />
          </div>

          <div className="flex items-center gap-3">
            {/* Download filled SAFT (docx) */}
            {viewingDoc.docx_download_url && (
              <a
                href={viewingDoc.docx_download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Download .docx
              </a>
            )}
            {/* Download signed certificate */}
            {viewingDoc.signed_pdf_url && (
              <a
                href={viewingDoc.signed_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-kayan-600 hover:text-kayan-800 underline font-medium"
              >
                Download Certificate
              </a>
            )}
            {/* Sign button */}
            {!isSigned && (
              <Button
                onClick={() => setShowSignModal(true)}
                disabled={!hasScrolledToBottom}
                className={!hasScrolledToBottom ? "opacity-50" : ""}
                size="sm"
              >
                Sign Document
              </Button>
            )}
          </div>
        </div>

        {/* ── Scroll prompt ── */}
        {!isSigned && !hasScrolledToBottom && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-center">
            <p className="text-xs text-amber-700">
              Please scroll to the bottom of the document to review the full agreement before signing.
            </p>
          </div>
        )}

        {/* ── Signed banner ── */}
        {isSigned && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 text-center">
            <p className="text-sm text-emerald-800">
              ✓ Signed by <strong>{viewingDoc.signature_name}</strong> on{" "}
              {new Date(viewingDoc.signed_at!).toLocaleString()}
            </p>
          </div>
        )}

        {/* ── Document content ── */}
        <div
          ref={docViewerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-gray-100 py-8 px-4"
        >
          <div className="max-w-[800px] mx-auto bg-white shadow-lg rounded-lg border border-gray-200 p-8 sm:p-12">
            {viewingDoc.html_content ? (
              <div dangerouslySetInnerHTML={{ __html: viewingDoc.html_content }} />
            ) : (
              <p className="text-gray-400 text-center py-20">Document content not available</p>
            )}
          </div>
        </div>

        {/* ── Signing Modal ── */}
        {showSignModal && (
          <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Sign SAFT Agreement</h3>
              <p className="text-sm text-gray-500 mb-6">
                By typing your name below, you are electronically signing this SAFT Agreement
                and agree to be bound by its terms. This signature has the same legal force
                as a handwritten signature.
              </p>

              {/* Document hash for transparency */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-400 mb-1">Document integrity hash (SHA-256)</p>
                <p className="text-xs font-mono text-gray-500 break-all">{viewingDoc.doc_hash}</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type your full legal name as signature
                </label>
                <input
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="e.g., John Andrew Smith"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-lg font-serif focus:outline-none focus:ring-2 focus:ring-kayan-500 focus:border-transparent"
                  autoFocus
                />
                {signatureName && (
                  <div className="mt-3 p-3 border border-dashed border-gray-300 rounded-lg text-center">
                    <p className="text-xs text-gray-400 mb-1">Preview</p>
                    <p className="text-2xl font-serif italic text-gray-800">{signatureName}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleSign}
                  loading={signing}
                  disabled={!signatureName.trim()}
                  className="flex-1"
                >
                  Confirm Signature
                </Button>
                <Button variant="secondary" onClick={() => setShowSignModal(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── DOCUMENT LIST ────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500 mt-1">Review and sign your subscription documents</p>
      </div>

      {Object.entries(roundGroups).map(([roundName, groupDocs]) => (
        <Card key={roundName}>
          <CardHeader title={roundName} subtitle="Subscription document set" />
          <div className="divide-y divide-gray-100">
            {groupDocs.map((doc) => {
              const isSaft = doc.doc_type === "saft";
              const isSigned = doc.status === "signed";
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-4">
                    <DocIcon type={doc.doc_type} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {DOC_TYPE_LABELS[doc.doc_type]}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isSigned
                          ? `Signed ${new Date(doc.signed_at!).toLocaleDateString()}`
                          : `Available since ${new Date(doc.created_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <DocStatusBadge status={doc.status} />
                    <button
                      onClick={() => openDoc(doc)}
                      disabled={viewerLoading}
                      className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                        isSaft && !isSigned
                          ? "bg-kayan-600 text-white hover:bg-kayan-700"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {isSaft && !isSigned
                        ? "Review & Sign"
                        : isSaft && isSigned
                          ? "View Signed"
                          : "View PDF"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {/* Info box */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong>About electronic signatures:</strong> Your typed signature is captured along with
          a timestamp, IP address, and a cryptographic hash of the document content. This creates
          a legally binding audit trail equivalent to a handwritten signature under applicable
          electronic signature laws. A Certificate of Execution is generated for your records.
        </p>
      </div>
    </div>
  );
}
