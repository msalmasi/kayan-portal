interface BadgeProps {
  variant: "green" | "yellow" | "gray" | "red";
  children: React.ReactNode;
}

/** Color-coded pill badge for status indicators (KYC, vesting, etc.) */
export function Badge({ variant, children }: BadgeProps) {
  const styles = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    yellow: "bg-amber-50 text-amber-700 ring-amber-600/20",
    gray: "bg-gray-100 text-gray-600 ring-gray-500/20",
    red: "bg-red-50 text-red-700 ring-red-600/20",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

/** Maps KYC status strings to the appropriate badge variant */
export function KycBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeProps["variant"]; label: string }> =
    {
      verified: { variant: "green", label: "Verified" },
      pending: { variant: "yellow", label: "Pending" },
      unverified: { variant: "gray", label: "Unverified" },
    };

  const { variant, label } = map[status] || map.unverified;
  return <Badge variant={variant}>{label}</Badge>;
}
