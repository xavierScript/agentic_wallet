/**
 * prompts/analysis/security-audit.ts
 *
 * MCP prompt — comprehensive security review of all wallets,
 * checking for policy gaps, funding issues, and operational anomalies.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerSecurityAuditPrompt(
  server: McpServer,
  _services: WalletServices,
): void {
  server.registerPrompt(
    "security-audit",
    {
      title: "Security Audit",
      description:
        "Full security review of the agentic wallet system. Checks all wallets for " +
        "missing policies, unusual activity, and configuration best practices.",
    },
    async () => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Perform a comprehensive security audit of the agentic wallet system.`,
                ``,
                `## Data Collection`,
                ``,
                `1. Read **wallet://system/status** for overall system state`,
                `2. Read **wallet://system/config** for configuration review`,
                `3. Read **wallet://wallets** to enumerate all wallets`,
                `4. Read **wallet://audit-logs** for recent activity`,
                `5. For each wallet, read its **wallet://wallets/{id}/policy** resource`,
                ``,
                `## Security Checks`,
                ``,
                `### Configuration`,
                `- [ ] Is the system running on **devnet** or mainnet? (devnet is expected for testing)`,
                `- [ ] Is an **owner address** configured for emergency sweeps?`,
                `- [ ] Is the RPC endpoint a public free endpoint? (warn about rate limits)`,
                ``,
                `### Wallet Security`,
                `For each wallet, check:`,
                `- [ ] **Policy attached?** — Wallets without policies are HIGH RISK`,
                `- [ ] **Rate limits set?** — No rate limits = unlimited transaction speed`,
                `- [ ] **Spend caps set?** — No caps = could drain wallet in one tx`,
                `- [ ] **Program allowlist?** — Open program lists mean more attack surface`,
                `- [ ] **Balance reasonable?** — Excessive balance on devnet is unusual`,
                ``,
                `### Activity Analysis`,
                `- [ ] Any **failed transactions** in the last 24h? What caused them?`,
                `- [ ] Any suspiciously **rapid transactions** (possible runaway agent)?`,
                `- [ ] Any transactions to **unknown addresses**?`,
                ``,
                `## Report`,
                ``,
                `Provide a security report with:`,
                `1. **Overall Score**: A/B/C/D/F grade`,
                `2. **Critical Issues**: Must fix immediately`,
                `3. **Warnings**: Should fix soon`,
                `4. **Recommendations**: Best practices to improve`,
                `5. **Action Items**: Specific tools/commands to run`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
