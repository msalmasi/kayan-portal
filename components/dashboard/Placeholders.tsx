import { Card, CardHeader } from "@/components/ui/Card";
import { KycBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

// ─── KYC Section ─────────────────────────────────────────────

interface KycSectionProps {
  status: string;
}

/** KYC verification card — disabled until KYC flow is enabled */
export function KycSection({ status }: KycSectionProps) {
  return (
    <Card>
      <CardHeader
        title="Identity Verification (KYC)"
        subtitle="Required before you can claim tokens"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </div>

          <div>
            <KycBadge status={status} />
            <p className="text-xs text-gray-400 mt-1">
              KYC verification will be available soon
            </p>
          </div>
        </div>

        <Button variant="secondary" disabled title="Coming soon">
          Start KYC
        </Button>
      </div>
    </Card>
  );
}

// ─── Wallet Section ──────────────────────────────────────────

interface WalletSectionProps {
  walletAddress: string | null;
}

/** Wallet connection card — disabled until TGE */
export function WalletSection({ walletAddress }: WalletSectionProps) {
  return (
    <Card>
      <CardHeader
        title="Wallet Connection"
        subtitle="Connect your Ethereum wallet to receive tokens"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Wallet icon */}
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6a2.25 2.25 0 012.25-2.25h13.5m-3 0V3.375c0-.621-.504-1.125-1.125-1.125h-2.25c-.621 0-1.125.504-1.125 1.125v.75"
              />
            </svg>
          </div>

          <div>
            {walletAddress ? (
              <p className="text-sm font-mono text-gray-700">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </p>
            ) : (
              <p className="text-sm text-gray-500">No wallet connected</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              Wallet connection will be enabled after TGE
            </p>
          </div>
        </div>

        <Button variant="secondary" disabled title="Coming soon">
          Connect Wallet
        </Button>
      </div>
    </Card>
  );
}
