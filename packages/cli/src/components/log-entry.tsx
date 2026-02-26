/**
 * components/log-entry.tsx
 *
 * Single audit-log row with color-coded action icon and compact timestamp.
 */

import { Box, Text } from "ink";
import type { AuditLogEntry } from "@agentic-wallet/core";

interface LogEntryProps {
  log: AuditLogEntry;
  verbose?: boolean;
}

/** Map action prefix → icon + color for quick visual scanning. */
function actionStyle(action: string): { icon: string; color: string } {
  if (action.startsWith("wallet:")) return { icon: "◆", color: "cyan" };
  if (action.startsWith("sol:")) return { icon: "◎", color: "green" };
  if (action.startsWith("spl-token:")) return { icon: "⬡", color: "yellow" };
  if (action.startsWith("swap:")) return { icon: "⇌", color: "magenta" };
  if (action.startsWith("memo:")) return { icon: "✎", color: "white" };
  if (action.startsWith("airdrop:")) return { icon: "▼", color: "blue" };
  if (action.startsWith("mint:")) return { icon: "✦", color: "yellow" };
  return { icon: "●", color: "gray" };
}

/** ISO timestamp → HH:MM:SS */
function fmtTime(iso: string): string {
  try {
    return new Date(iso).toTimeString().substring(0, 8);
  } catch {
    return iso;
  }
}

export function LogEntry({ log, verbose = false }: LogEntryProps) {
  const { icon, color } = actionStyle(log.action);
  const statusIcon = log.success ? "✓" : "✗";
  const statusColor = log.success ? "green" : "red";

  return (
    <Box flexDirection="column" marginBottom={verbose ? 1 : 0}>
      <Box>
        <Text color={color}>{icon + " "}</Text>
        <Text color={statusColor} bold>
          {statusIcon + " "}
        </Text>
        <Text bold={!log.success} color={log.success ? "white" : "red"}>
          {log.action.padEnd(24)}
        </Text>
        {log.walletId && (
          <Text dimColor>{log.walletId.substring(0, 8) + "  "}</Text>
        )}
        <Text dimColor>{fmtTime(log.timestamp)}</Text>
      </Box>

      {verbose && log.txSignature && (
        <Box marginLeft={4}>
          <Text color="cyan" dimColor>
            {"tx  "}
          </Text>
          <Text dimColor>{log.txSignature.substring(0, 48) + "…"}</Text>
        </Box>
      )}

      {verbose && log.error && (
        <Box marginLeft={4}>
          <Text color="red">{"✗  " + log.error}</Text>
        </Box>
      )}
    </Box>
  );
}
