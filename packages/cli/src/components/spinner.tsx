/**
 * components/spinner.tsx
 *
 * Animated loading indicator with a label.
 */

import { Text } from "ink";
import InkSpinner from "ink-spinner";

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = "Loading…" }: SpinnerProps) {
  return (
    <Text>
      <Text color="cyan">
        <InkSpinner type="arc" />
      </Text>
      <Text dimColor> {label}</Text>
    </Text>
  );
}
