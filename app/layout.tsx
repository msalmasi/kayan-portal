import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kayan Token — Investor Portal",
  description:
    "Track your $KAYAN token allocation, vesting schedule, and verification status.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        {children}
        {/* Global toast notifications — used by admin actions */}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
