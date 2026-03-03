import type { Metadata } from "next";
import { Toaster } from "sonner";
import { DisclaimerModal } from "@/components/ui/DisclaimerModal";
import { EntityConfigProvider } from "@/components/EntityConfigProvider";
import { getEntityConfig } from "@/lib/entity-config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getEntityConfig();
  return {
    title: config.portal_title,
    description: `Investor portal for ${config.project_name}.`,
    icons: { icon: config.favicon_url },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-gray-50 text-gray-900">
        <EntityConfigProvider>
          {children}
          <DisclaimerModal />
        </EntityConfigProvider>
        {/* Global toast notifications — used by admin actions */}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
