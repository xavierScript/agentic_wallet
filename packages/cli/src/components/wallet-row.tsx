/**
 * components/wallet-row.tsx
 *
 * Single wallet row — shows cursor indicator, label, ID, address,
 * and SOL balance. Highlighted when `selected` is true.
 */

import { Box, Text } from "ink";
import type { WalletInfo } from "@agentic-wallet/core";

interface WalletRowProps {
  wallet: WalletInfo;
  selected?: boolean;
  /** Show full public key. Default false. */
  full?: boolean;
}

export function WalletRow({
  wallet,
  selected = false,
  full = false,
}: WalletRowProps) {
  const pk = full ? wallet.publicKey : wallet.publicKey.substring(0, 18) + "…";
  const emptyBalance = wallet.balanceSol === 0;

  return (
    <Box>
      <Text color="cyan" bold>
        {selected ? "▸ " : "  "}
      </Text>
      <Text color={selected ? "cyan" : "white"} bold={selected}>
        {"◆  "}
      </Text>
      <Text bold={selected} color={selected ? "white" : "white"}>
        {wallet.label.padEnd(20)}
      </Text>
      <Text dimColor>{wallet.id.substring(0, 8) + "  "}</Text>
      <Text color="gray">{pk + "  "}</Text>
      <Text bold color={emptyBalance ? "yellow" : "green"}>
        {wallet.balanceSol.toFixed(6) + " SOL"}
      </Text>
    </Box>
  );
}
