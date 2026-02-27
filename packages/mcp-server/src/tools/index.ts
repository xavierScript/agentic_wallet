/**
 * tools/index.ts
 *
 * Barrel that registers every MCP tool on the server.
 * Add new tools here — one import + one call.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../services.js";

import { registerCreateWalletTool } from "./wallet/create-wallet.js";
import { registerListWalletsTool } from "./wallet/list-wallets.js";
import { registerGetBalanceTool } from "./wallet/get-balance.js";
// close-wallet is intentionally NOT registered here.
// Wallet closure is a destructive, irreversible operation and must only be
// initiated by a human via the CLI. Agents must never be able to close wallets.
import { registerGetAuditLogsTool } from "./wallet/get-audit-logs.js";
import { registerGetStatusTool } from "./wallet/get-status.js";
import { registerGetPolicyTool } from "./wallet/get-policy.js";
import { registerSendSolTool } from "./transfers/send-sol.js";
import { registerSendTokenTool } from "./transfers/send-token.js";
import { registerWriteMemoTool } from "./transfers/write-memo.js";
import { registerRequestAirdropTool } from "./transfers/request-airdrop.js";
import { registerSwapTokensTool } from "./tokens/swap-tokens.js";
import { registerMintTokenTool } from "./tokens/mint-token.js";

/**
 * Register all wallet tools on the given MCP server instance.
 */
export function registerAllTools(
  server: McpServer,
  services: WalletServices,
): void {
  registerCreateWalletTool(server, services);
  registerListWalletsTool(server, services);
  registerGetBalanceTool(server, services);
  // registerCloseWalletTool is deliberately omitted — human-only via CLI.
  registerSendSolTool(server, services);
  registerSendTokenTool(server, services);
  registerSwapTokensTool(server, services);
  registerWriteMemoTool(server, services);
  registerRequestAirdropTool(server, services);
  registerMintTokenTool(server, services);
  registerGetAuditLogsTool(server, services);
  registerGetStatusTool(server, services);
  registerGetPolicyTool(server, services);
}
