/**
 * prompts/index.ts
 *
 * Barrel that registers every MCP prompt on the server.
 * Prompts are pre-built conversation templates that guide AI agents
 * through complex multi-step workflows (trading, security review, etc.).
 *
 * Structure mirrors the tools/ directory: one file per prompt, grouped by domain.
 *   setup/    — wallet creation and initial configuration
 *   trading/  — token swaps and portfolio management
 *   analysis/ — risk, security, and operational reporting
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../services.js";

// setup/
import { registerWalletSetupPrompt } from "./setup/wallet-setup.js";

// trading/
import { registerTradingStrategyPrompt } from "./trading/trading-strategy.js";
import { registerPortfolioRebalancePrompt } from "./trading/portfolio-rebalance.js";

// analysis/
import { registerRiskAssessmentPrompt } from "./analysis/risk-assessment.js";
import { registerDailyReportPrompt } from "./analysis/daily-report.js";
import { registerSecurityAuditPrompt } from "./analysis/security-audit.js";

/**
 * Register all MCP prompts on the given server instance.
 */
export function registerAllPrompts(
  server: McpServer,
  services: WalletServices,
): void {
  // setup/
  registerWalletSetupPrompt(server, services);

  // trading/
  registerTradingStrategyPrompt(server, services);
  registerPortfolioRebalancePrompt(server, services);

  // analysis/
  registerRiskAssessmentPrompt(server, services);
  registerDailyReportPrompt(server, services);
  registerSecurityAuditPrompt(server, services);
}
