/**
 * resources/index.ts
 *
 * Barrel that registers every MCP resource on the server.
 * Resources expose real-time, read-only data that AI agents can query
 * or subscribe to — wallet balances, audit trails, policies, and system
 * status — without needing to invoke a tool.
 *
 * Structure mirrors the tools/ directory: one file per resource, grouped by domain.
 *   wallet/   — wallet list, detail, policy
 *   audit/    — global audit log, per-wallet audit log
 *   system/   — system status, system config
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../services.js";

// wallet/
import { registerAllWalletsResource } from "./wallet/all-wallets.js";
import { registerWalletDetailResource } from "./wallet/wallet-detail.js";
import { registerWalletPolicyResource } from "./wallet/wallet-policy.js";

// audit/
import { registerAuditLogsResource } from "./audit/audit-logs.js";
import { registerWalletAuditLogsResource } from "./audit/wallet-audit-logs.js";

// system/
import { registerSystemStatusResource } from "./system/system-status.js";
import { registerSystemConfigResource } from "./system/system-config.js";

/**
 * Register all MCP resources on the given server instance.
 */
export function registerAllResources(
  server: McpServer,
  services: WalletServices,
): void {
  // wallet/
  registerAllWalletsResource(server, services);
  registerWalletDetailResource(server, services);
  registerWalletPolicyResource(server, services);

  // audit/
  registerAuditLogsResource(server, services);
  registerWalletAuditLogsResource(server, services);

  // system/
  registerSystemStatusResource(server, services);
  registerSystemConfigResource(server, services);
}
