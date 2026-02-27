/**
 * resources/system/system-config.ts
 *
 * MCP resource — non-sensitive server configuration (no keys or passphrases).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerSystemConfigResource(
  server: McpServer,
  services: WalletServices,
): void {
  const { config } = services;

  server.registerResource(
    "system-config",
    "wallet://system/config",
    {
      title: "System Configuration",
      description:
        "Non-sensitive server configuration: Solana cluster, RPC URL, log level, " +
        "and whether an owner address is set. Does NOT expose passphrases or keys.",
      mimeType: "application/json",
    },
    async () => {
      return {
        contents: [
          {
            uri: "wallet://system/config",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                cluster: config.cluster,
                rpcUrl: config.rpcUrl,
                logLevel: config.logLevel,
                hasOwnerAddress: !!config.ownerAddress,
                keystoreDir: config.keystoreDir,
                logDir: config.logDir,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
