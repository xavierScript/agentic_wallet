/**
 * components/section.tsx
 *
 * Reusable section block with a full-width title rule.
 */

import { Box, Text } from "ink";
import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  children: ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="white">
          {"  " + title.toUpperCase() + " "}
        </Text>
        <Text color="cyan" dimColor>
          {"─────────────────────────────────────────────"}
        </Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        {children}
      </Box>
    </Box>
  );
}
