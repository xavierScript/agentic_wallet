/**
 * guardrails/index.ts
 *
 * Barrel export for all policy enforcement and guardrail components.
 * Includes PolicyEngine (rate limits, spend caps, program allowlists),
 * and the Policy / PolicyRule type definitions.
 */

export { PolicyEngine, type Policy, type PolicyRule } from "./policy-engine.js";
