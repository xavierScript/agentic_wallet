/**
 * views/dashboard.tsx
 *
 * Default view — quick overview of wallets and recent activity.
 */

import { Box, Text } from "ink";
import { useWallets } from "../hooks/use-wallets.js";
import { useLogs } from "../hooks/use-logs.js";
import { Section } from "../components/section.js";
import { Spinner } from "../components/spinner.js";
import { WalletRow } from "../components/wallet-row.js";
import { LogEntry } from "../components/log-entry.js";
import type { WalletServices } from "../services.js";

interface DashboardViewProps {
  services: WalletServices;
  refreshKey: number;
}

export function DashboardView({ services, refreshKey }: DashboardViewProps) {
  const { wallets, loading: wLoading } = useWallets(services, { refreshKey });
  const { logs, loading: lLoading } = useLogs(services, {
    count: 8,
    refreshKey,
  });

  const totalSol = wallets.reduce((s, w) => s + w.balanceSol, 0);
  const successCount = logs.filter((l) => l.success).length;

  return (
    <Box flexDirection="column">
      {/* ── Stat cards ─────────────────────────── */}
      <Box marginBottom={1} marginLeft={2}>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          marginRight={3}
          flexDirection="column"
        >
          <Text dimColor>WALLETS</Text>
          <Text bold color="white">
            {wLoading ? "…" : String(wallets.length)}
          </Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="green"
          paddingX={2}
          marginRight={3}
          flexDirection="column"
        >
          <Text dimColor>TOTAL SOL</Text>
          <Text bold color="green">
            {wLoading ? "…" : totalSol.toFixed(4)}
          </Text>
        </Box>
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={2}
          flexDirection="column"
        >
          <Text dimColor>CLUSTER</Text>
          <Text bold color="cyan">
            {services.config.cluster.toUpperCase()}
          </Text>
        </Box>
      </Box>

      {/* ── Wallet list ────────────────────────── */}
      <Section title="Wallets">
        {wLoading ? (
          <Spinner label="Loading wallets…" />
        ) : wallets.length === 0 ? (
          <Text dimColor>No wallets yet — create one via the MCP server.</Text>
        ) : (
          wallets.map((w) => <WalletRow key={w.id} wallet={w} />)
        )}
      </Section>

      {/* ── Recent activity ────────────────────── */}
      <Section
        title={
          "Recent Activity" +
          (logs.length > 0
            ? "  " + successCount + "/" + logs.length + " ok"
            : "")
        }
      >
        {lLoading ? (
          <Spinner label="Loading logs…" />
        ) : logs.length === 0 ? (
          <Text dimColor>No activity recorded yet.</Text>
        ) : (
          logs.map((log, i) => <LogEntry key={i} log={log} />)
        )}
      </Section>
    </Box>
  );
}
