"use client";

import { ReactNode } from "react";

// ─── Tab Bar ─────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * Horizontal tab bar with underline indicator.
 * Optionally shows a count badge next to the label.
 */
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-6" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Tab Panel ───────────────────────────────────────────────

interface TabPanelProps {
  id: string;
  active: string;
  children: ReactNode;
}

/**
 * Wraps tab content — only renders when active.
 * Uses display:none instead of unmount to preserve state.
 */
export function TabPanel({ id, active, children }: TabPanelProps) {
  return (
    <div className={id === active ? "" : "hidden"}>
      {children}
    </div>
  );
}
