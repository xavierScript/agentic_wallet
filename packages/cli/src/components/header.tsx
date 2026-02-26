/**
 * components/header.tsx
 *
 * Top banner — shows branding and active cluster.
 */

import { Box, Text } from "ink";

interface HeaderProps {
  cluster: string;
}

export function Header({ cluster }: HeaderProps) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          {"  ◈  AGENTIC WALLET  "}
        </Text>
        <Text color="cyan" dimColor>
          {"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"}
        </Text>
        <Text dimColor>{"  " + cluster.toUpperCase()}</Text>
      </Box>
    </Box>
  );
}
