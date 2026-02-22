import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

/** Clean white card with subtle border — used everywhere on the dashboard */
export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
}

/** Consistent header for card sections */
export function CardHeader({ title, subtitle }: CardHeaderProps) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}
