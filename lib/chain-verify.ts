/**
 * On-chain verification for crypto payment claims.
 *
 * Verifies that a transaction:
 *   1. Exists and is confirmed
 *   2. Transfers the correct token (USDC / USDT)
 *   3. Sends to our receiving wallet
 *   4. Amount >= expected amount (with small tolerance for gas rounding)
 *
 * Returns a result object with verified status + raw chain data.
 */

import {
  TOKEN_CONTRACTS,
  TOKEN_DECIMALS,
  EXPLORER_KEYS,
} from "./payment-config";

// ─── Types ──────────────────────────────────────────────────

export interface VerifyResult {
  verified: boolean;
  /** "confirmed" | "pending" | "not_found" | "wrong_token" | "wrong_recipient" | "insufficient_amount" | "error" */
  reason: string;
  /** Human-readable explanation */
  detail: string;
  /** Raw data from the blockchain API */
  chainData: Record<string, any>;
  /** Actual amount transferred (USD) */
  amountTransferred?: number;
  /** Sender wallet address from the on-chain transaction */
  senderAddress?: string;
}

// ─── Amount tolerance: 0.5% to account for rounding ─────────

const AMOUNT_TOLERANCE = 0.005;

// ─── Ethereum (Etherscan) ───────────────────────────────────

/**
 * Verify an ERC-20 token transfer on Ethereum.
 * Uses Etherscan's transaction receipt endpoint to parse Transfer logs.
 */
export async function verifyEthereumTx(
  txHash: string,
  expectedToken: "usdc" | "usdt",
  expectedAmountUsd: number,
  receivingWalletOverride?: string
): Promise<VerifyResult> {
  const contractKey = expectedToken === "usdc" ? "usdc_eth" : "usdt_eth";
  const contractAddr = TOKEN_CONTRACTS[contractKey].toLowerCase();
  const receivingWallet = (receivingWalletOverride || "").toLowerCase();
  const decimals = TOKEN_DECIMALS[contractKey];

  if (!receivingWallet) {
    return { verified: false, reason: "error", detail: "Receiving wallet not configured (RECEIVING_WALLET_ETH)", chainData: {} };
  }

  try {
    const apiKey = EXPLORER_KEYS.etherscan;
    const receiptUrl = `https://api.etherscan.io/v2/api?chainid=1&module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}${
      apiKey ? `&apikey=${apiKey}` : ""
    }`;

    const res = await fetch(receiptUrl);
    const data = await res.json();

    // Etherscan proxy returns { jsonrpc, id, result: {...} } on success.
    // On error (bad key, rate limit) it returns { status: "0", message: "NOTOK", result: "Error text" }.
    if (typeof data.result === "string") {
      // API-level error from Etherscan — surface the actual message
      return {
        verified: false,
        reason: "error",
        detail: `Etherscan API error: ${data.result}`,
        chainData: data,
      };
    }

    if (!data.result) {
      return { verified: false, reason: "not_found", detail: "Transaction not found on Ethereum — it may still be pending", chainData: data };
    }

    const receipt = data.result;

    // Check tx was successful
    // Etherscan returns status as hex string: "0x1", "0x01", etc.
    const txSuccess = receipt.status && parseInt(receipt.status, 16) === 1;
    if (!txSuccess) {
      return { verified: false, reason: "error", detail: "Transaction reverted/failed on-chain", chainData: receipt };
    }

    // Parse ERC-20 Transfer events from logs
    // Transfer event signature: Transfer(address,address,uint256)
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    const transferLogs = (receipt.logs || []).filter((log: any) =>
      log.topics?.[0] === TRANSFER_TOPIC &&
      log.address?.toLowerCase() === contractAddr
    );

    if (transferLogs.length === 0) {
      return { verified: false, reason: "wrong_token", detail: `No ${expectedToken.toUpperCase()} transfer found in this transaction`, chainData: receipt };
    }

    // Find a transfer to our receiving wallet
    const matchingTransfer = transferLogs.find((log: any) => {
      // topics[2] = 'to' address (zero-padded to 32 bytes)
      const to = "0x" + (log.topics[2] || "").slice(26).toLowerCase();
      return to === receivingWallet;
    });

    if (!matchingTransfer) {
      return { verified: false, reason: "wrong_recipient", detail: "Transfer recipient does not match our receiving wallet", chainData: { receipt, transferLogs } };
    }

    // Decode amount from log data (uint256)
    const rawAmount = BigInt(matchingTransfer.data);
    const amount = Number(rawAmount) / Math.pow(10, decimals);

    // Extract sender from the Transfer event (topics[1] = 'from' address)
    const sender = "0x" + (matchingTransfer.topics[1] || "").slice(26).toLowerCase();

    // For stablecoins, amount ≈ USD value
    const minExpected = expectedAmountUsd * (1 - AMOUNT_TOLERANCE);

    if (amount < minExpected) {
      return {
        verified: false,
        reason: "insufficient_amount",
        detail: `Transferred $${amount.toFixed(2)} but $${expectedAmountUsd.toFixed(2)} expected`,
        chainData: { receipt, amount, expected: expectedAmountUsd },
        amountTransferred: amount,
        senderAddress: sender,
      };
    }

    return {
      verified: true,
      reason: "confirmed",
      detail: `Verified: $${amount.toFixed(2)} ${expectedToken.toUpperCase()} received`,
      chainData: {
        block: parseInt(receipt.blockNumber, 16),
        from: sender,
        to: receivingWallet,
        amount,
        token: expectedToken,
        txHash,
      },
      amountTransferred: amount,
      senderAddress: sender,
    };
  } catch (err: any) {
    return { verified: false, reason: "error", detail: `Verification error: ${err.message}`, chainData: { error: err.message } };
  }
}

// ─── Solana (RPC) ───────────────────────────────────────────

/**
 * Verify a USDC SPL token transfer on Solana.
 * Uses Solana JSON-RPC getTransaction to parse token transfers.
 */
export async function verifySolanaTx(
  txSignature: string,
  expectedAmountUsd: number,
  receivingWalletOverride?: string
): Promise<VerifyResult> {
  const receivingWallet = receivingWalletOverride || "";
  const usdcMint = TOKEN_CONTRACTS.usdc_sol;
  const decimals = TOKEN_DECIMALS.usdc_sol;

  if (!receivingWallet) {
    return { verified: false, reason: "error", detail: "Receiving wallet not configured (RECEIVING_WALLET_SOL)", chainData: {} };
  }

  try {
    const rpc = EXPLORER_KEYS.solana_rpc;

    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          txSignature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });

    const data = await res.json();

    if (!data.result) {
      return { verified: false, reason: "not_found", detail: "Transaction not found on Solana", chainData: data };
    }

    const tx = data.result;

    // Check tx was successful
    if (tx.meta?.err) {
      return { verified: false, reason: "error", detail: "Transaction failed on-chain", chainData: tx.meta };
    }

    // Parse token transfer instructions
    // Look in both inner instructions and top-level for SPL token transfers
    const allInstructions = [
      ...(tx.transaction?.message?.instructions || []),
      ...(tx.meta?.innerInstructions || []).flatMap((ix: any) => ix.instructions || []),
    ];

    // Find SPL token transfer/transferChecked to our wallet
    const tokenTransfers = allInstructions.filter((ix: any) => {
      const parsed = ix.parsed;
      if (!parsed) return false;
      const type = parsed.type;
      return (type === "transfer" || type === "transferChecked") &&
        parsed.info?.mint === usdcMint;
    });

    // Also check pre/post token balances for our wallet
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Find balance change for our wallet's USDC account
    let amountReceived = 0;

    for (const post of postBalances) {
      if (post.mint !== usdcMint) continue;
      if (post.owner !== receivingWallet) continue;

      const postAmount = Number(post.uiTokenAmount?.amount || 0);
      const pre = preBalances.find(
        (p: any) => p.accountIndex === post.accountIndex && p.mint === usdcMint
      );
      const preAmount = Number(pre?.uiTokenAmount?.amount || 0);
      amountReceived = (postAmount - preAmount) / Math.pow(10, decimals);
    }

    if (amountReceived <= 0) {
      // Fallback: check parsed transfer instructions
      for (const ix of tokenTransfers) {
        const info = ix.parsed?.info;
        if (info?.destination && info?.authority) {
          // For transferChecked, amount is in info.tokenAmount.uiAmount
          const amt = info.tokenAmount?.uiAmount || Number(info.amount || 0) / Math.pow(10, decimals);
          amountReceived = Math.max(amountReceived, amt);
        }
      }
    }

    if (amountReceived <= 0) {
      return { verified: false, reason: "wrong_recipient", detail: "No USDC transfer to our wallet found in this transaction", chainData: { tx: tx.transaction?.message, meta: tx.meta } };
    }

    // Extract sender — first signer in the transaction
    const accountKeys = tx.transaction?.message?.accountKeys || [];
    const solSender = (accountKeys[0]?.pubkey || accountKeys[0] || "").toString().toLowerCase();

    const minExpected = expectedAmountUsd * (1 - AMOUNT_TOLERANCE);
    if (amountReceived < minExpected) {
      return {
        verified: false,
        reason: "insufficient_amount",
        detail: `Transferred $${amountReceived.toFixed(2)} but $${expectedAmountUsd.toFixed(2)} expected`,
        chainData: { amountReceived, expected: expectedAmountUsd },
        amountTransferred: amountReceived,
        senderAddress: solSender,
      };
    }

    return {
      verified: true,
      reason: "confirmed",
      detail: `Verified: $${amountReceived.toFixed(2)} USDC received on Solana`,
      chainData: {
        slot: tx.slot,
        blockTime: tx.blockTime,
        amountReceived,
        token: "usdc",
        chain: "solana",
        signature: txSignature,
      },
      amountTransferred: amountReceived,
      senderAddress: solSender,
    };
  } catch (err: any) {
    return { verified: false, reason: "error", detail: `Verification error: ${err.message}`, chainData: { error: err.message } };
  }
}

// ─── Unified verify function ────────────────────────────────

/**
 * Verify a payment claim based on method.
 * Routes to the correct chain verifier.
 *
 * @param receivingWallet — wallet address loaded from DB payment_settings
 */
export async function verifyOnChain(
  method: string,
  txHash: string,
  expectedAmountUsd: number,
  receivingWallet?: string
): Promise<VerifyResult> {
  switch (method) {
    case "usdc_eth":
      return verifyEthereumTx(txHash, "usdc", expectedAmountUsd, receivingWallet);
    case "usdt_eth":
      return verifyEthereumTx(txHash, "usdt", expectedAmountUsd, receivingWallet);
    case "usdc_sol":
      return verifySolanaTx(txHash, expectedAmountUsd, receivingWallet);
    default:
      return { verified: false, reason: "error", detail: `Unsupported method: ${method}`, chainData: {} };
  }
}
