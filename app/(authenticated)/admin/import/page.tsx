"use client";

import { useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { toast } from "sonner";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CsvImportRow } from "@/lib/types";

export default function ImportPage() {
  const [rows, setRows] = useState<CsvImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<any>(null);

  /**
   * Handle CSV file selection — parse with PapaParse and validate.
   * Expected columns: email, full_name, round_name, token_amount
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setRows([]);
    setParseErrors([]);
    setResults(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(result) {
        const errors: string[] = [];
        const parsed: CsvImportRow[] = [];

        // Validate each row
        (result.data as any[]).forEach((row, i) => {
          const rowNum = i + 2; // +2 for header row + 0-index

          if (!row.email) {
            errors.push(`Row ${rowNum}: missing email`);
            return;
          }
          if (!row.full_name) {
            errors.push(`Row ${rowNum}: missing full_name`);
            return;
          }
          if (!row.round_name) {
            errors.push(`Row ${rowNum}: missing round_name`);
            return;
          }
          if (!row.token_amount || isNaN(Number(row.token_amount))) {
            errors.push(`Row ${rowNum}: invalid token_amount`);
            return;
          }

          parsed.push({
            email: row.email.trim(),
            full_name: row.full_name.trim(),
            round_name: row.round_name.trim(),
            token_amount: Number(row.token_amount),
          });
        });

        setRows(parsed);
        setParseErrors(errors);
      },
      error(err) {
        setParseErrors([`Failed to parse CSV: ${err.message}`]);
      },
    });
  };

  /** Submit parsed rows to the import API */
  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);

    const res = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });

    const data = await res.json();
    setResults(data);
    setImporting(false);

    if (data.errors?.length === 0) {
      toast.success(
        `Imported ${data.created_allocations} allocations for ${data.created_investors} new investors`
      );
    } else {
      toast.warning(
        `Import complete with ${data.errors?.length || 0} errors`
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CSV Import</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bulk import investors and allocations
          </p>
        </div>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader
          title="Upload CSV"
          subtitle="Import investors and their allocations from a CSV file"
        />

        <div className="bg-gray-50 rounded-lg p-4 mb-4 text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-2">Expected format:</p>
          <code className="block bg-white px-3 py-2 rounded border border-gray-200 text-xs font-mono">
            email,full_name,round_name,token_amount
            <br />
            jane@example.com,Jane Doe,Seed,50000
            <br />
            bob@example.com,Bob Smith,Private,25000
          </code>
          <p className="mt-2 text-xs text-gray-500">
            Round names must match existing rounds exactly. Existing investors
            (by email) will get the new allocation added — they won&apos;t be
            duplicated.
          </p>
        </div>

        {/* File Input */}
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-kayan-50 file:text-kayan-600 hover:file:bg-kayan-100 cursor-pointer"
        />
      </Card>

      {/* Parse Errors */}
      {parseErrors.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader title={`${parseErrors.length} Validation Warnings`} />
          <ul className="text-sm text-amber-700 space-y-1 max-h-40 overflow-y-auto">
            {parseErrors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardHeader
              title="Preview"
              subtitle={`${rows.length} valid row${rows.length !== 1 ? "s" : ""} ready to import`}
            />
            <Button onClick={handleImport} loading={importing}>
              Import {rows.length} Rows
            </Button>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-2 font-medium text-gray-500 text-xs">
                    Email
                  </th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500 text-xs">
                    Name
                  </th>
                  <th className="text-left py-2 px-2 font-medium text-gray-500 text-xs">
                    Round
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-gray-500 text-xs">
                    Tokens
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="py-2 px-2 text-gray-600">{row.email}</td>
                    <td className="py-2 px-2 text-gray-900">{row.full_name}</td>
                    <td className="py-2 px-2 text-gray-600">
                      {row.round_name}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-700">
                      {Number(row.token_amount).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p className="text-xs text-gray-400 text-center py-2">
                Showing first 50 of {rows.length} rows
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Import Results */}
      {results && (
        <Card
          className={
            results.errors?.length > 0
              ? "border-amber-200"
              : "border-emerald-200"
          }
        >
          <CardHeader title="Import Results" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-kayan-600">
                {results.created_investors}
              </p>
              <p className="text-xs text-gray-500">New Investors</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-kayan-600">
                {results.created_allocations}
              </p>
              <p className="text-xs text-gray-500">Allocations Created</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-400">
                {results.skipped}
              </p>
              <p className="text-xs text-gray-500">Skipped</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-500">
                {results.errors?.length || 0}
              </p>
              <p className="text-xs text-gray-500">Errors</p>
            </div>
          </div>

          {results.errors?.length > 0 && (
            <div className="mt-4 max-h-40 overflow-y-auto">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Error details:
              </p>
              <ul className="text-xs text-amber-700 space-y-1">
                {results.errors.map((err: any, i: number) => (
                  <li key={i}>
                    Row {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
