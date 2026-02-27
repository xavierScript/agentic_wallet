/**
 * views/wallets.tsx
 *
 * Interactive wallet list with j/k cursor navigation and
 * x-to-close with an inline confirmation prompt.
 */

import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useWallets } from "../hooks/use-wallets.js";
import { Section } from "../components/section.js";
import { Spinner } from "../components/spinner.js";
import { WalletRow } from "../components/wallet-row.js";
import type { WalletServices } from "../services.js";
import { HUMAN_ONLY } from "@agentic-wallet/core";

interface WalletsViewProps {
  services: WalletServices;
  refreshKey: number;
}

interface ConfirmClose {
  id: string;
  label: string;
  balanceSol: number;
}

export function WalletsView({ services, refreshKey }: WalletsViewProps) {
  const ownerAddress = services.config.ownerAddress;

  const [cursor, setCursor] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmClose | null>(null);
  const [closing, setClosing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const [localKey, setLocalKey] = useState(0);

  const { wallets, loading, error } = useWallets(services, {
    refreshKey: refreshKey + localKey,
  });

  // Clamp cursor when list shrinks
  useEffect(() => {
    if (wallets.length > 0 && cursor >= wallets.length) {
      setCursor(wallets.length - 1);
    }
  }, [wallets.length, cursor]);

  useInput((input, key) => {
    // ── Confirmation mode: only y / n / Escape ──────────────────────
    if (confirm) {
      if (input === "y") {
        const { id, label } = confirm;
        setConfirm(null);
        setClosing(true);
        services.walletService
          .closeWallet(id, ownerAddress, HUMAN_ONLY)
          .then(({ sweptLamports }) => {
            const swept =
              sweptLamports > 0
                ? `  →  swept ${(sweptLamports / 1_000_000_000).toFixed(6)} SOL to owner`
                : "";
            setStatusMsg({
              text: `✓  "${label}" closed.${swept}`,
              ok: true,
            });
            setLocalKey((k) => k + 1);
          })
          .catch((err: Error) => {
            setStatusMsg({ text: `✗  ${err.message}`, ok: false });
          })
          .finally(() => {
            setClosing(false);
            setTimeout(() => setStatusMsg(null), 4_000);
          });
      } else if (input === "n" || key.escape) {
        setConfirm(null);
      }
      return;
    }

    // ── Normal navigation ────────────────────────────────
    if ((key.downArrow || input === "j") && wallets.length > 0) {
      setCursor((c) => Math.min(c + 1, wallets.length - 1));
    }
    if ((key.upArrow || input === "k") && wallets.length > 0) {
      setCursor((c) => Math.max(c - 1, 0));
    }
    if (input === "x" && wallets.length > 0 && !closing) {
      const w = wallets[cursor];
      if (w) setConfirm({ id: w.id, label: w.label, balanceSol: w.balanceSol });
    }
  });

  const totalSol = wallets.reduce((s, w) => s + w.balanceSol, 0);
  const walletCount = wallets.length;

  return (
    <Box flexDirection="column">
      <Section
        title={`Wallets${walletCount > 0 ? " (" + walletCount + ")" : ""}`}
      >
        {loading ? (
          <Spinner label="Fetching wallets…" />
        ) : error ? (
          <Text color="red">Error: {error}</Text>
        ) : wallets.length === 0 ? (
          <Text dimColor>No wallets found. Create one via the MCP server.</Text>
        ) : (
          wallets.map((w, i) => (
            <WalletRow key={w.id} wallet={w} selected={i === cursor} />
          ))
        )}
      </Section>

      {/* ── Aggregate total ──────────────────────── */}
      {!loading && walletCount > 0 && (
        <Box marginLeft={2} marginBottom={1}>
          <Text dimColor>Total </Text>
          <Text bold color="green">
            {totalSol.toFixed(6)} SOL
          </Text>
          <Text dimColor>
            {"  across " +
              walletCount +
              " wallet" +
              (walletCount !== 1 ? "s" : "")}
          </Text>
        </Box>
      )}

      {/* ── Confirmation dialog ──────────────────── */}
      {confirm && (
        <Box
          borderStyle="round"
          borderColor="red"
          flexDirection="column"
          paddingX={2}
          marginLeft={2}
        >
          <Text bold color="red">
            {" "}
            Close wallet?
          </Text>
          <Box>
            <Text> </Text>
            <Text bold color="white">
              {confirm.label}
            </Text>
            <Text dimColor>{"  " + confirm.id.substring(0, 8) + "…"}</Text>
          </Box>
          {confirm.balanceSol > 0 &&
            (ownerAddress ? (
              <Text color="green">
                {"  ↳  " +
                  confirm.balanceSol.toFixed(6) +
                  " SOL will be swept to owner  " +
                  ownerAddress.substring(0, 12) +
                  "…"}
              </Text>
            ) : (
              <Text color="yellow">
                {"  ⚠  Balance " +
                  confirm.balanceSol.toFixed(6) +
                  " SOL will become inaccessible — set OWNER_ADDRESS to auto-sweep!"}
              </Text>
            ))}
          <Text dimColor>
            {"  Encrypted keystore will be permanently deleted from disk."}
          </Text>
          <Box marginTop={1} marginLeft={2}>
            <Text backgroundColor="red" color="white" bold>
              {" y  Confirm "}
            </Text>
            <Text>{"   "}</Text>
            <Text color="gray">{" n  Cancel "}</Text>
          </Box>
        </Box>
      )}

      {/* ── Closing spinner ──────────────────────── */}
      {closing && (
        <Box marginLeft={2} marginTop={1}>
          <Spinner label="Closing wallet…" />
        </Box>
      )}

      {/* ── Status feedback ─────────────────────── */}
      {statusMsg && (
        <Box marginLeft={2} marginTop={1}>
          <Text bold color={statusMsg.ok ? "green" : "red"}>
            {statusMsg.text}
          </Text>
        </Box>
      )}

      {/* ── Tip ──────────────────────────────── */}
      {!confirm && !statusMsg && !loading && (
        <Box marginLeft={2}>
          <Text dimColor>
            {"Fund at  "}
            <Text color="cyan">https://faucet.solana.com</Text>
          </Text>
        </Box>
      )}
    </Box>
  );
}
