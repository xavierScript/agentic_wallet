/**
 * guardrails/human-only.ts
 *
 * Compile-time guardrail that prevents agent code paths from calling
 * operations that must only be initiated by a human (e.g. closing a wallet).
 *
 * ── How the guard works ───────────────────────────────────────────────────
 *
 * `HumanOnlyOpts` requires the literal type `true` for `humanInitiated`,
 * NOT the wider `boolean` type.
 *
 * MCP tool handlers receive their arguments from a Zod input schema.
 * Zod's `z.boolean()` resolves to `boolean`, not `true`, so TypeScript will
 * refuse to accept a Zod-provided value where `HumanOnlyOpts` is required.
 * This makes it a compile-time barrier — no runtime check needed.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *
 *   import { HUMAN_ONLY, type HumanOnlyOpts } from "../guardrails/human-only.js";
 *
 *   async function closeWallet(
 *     walletId: string,
 *     opts: HumanOnlyOpts = HUMAN_ONLY,
 *   ): Promise<void> { ... }
 *
 * ── DO NOT ────────────────────────────────────────────────────────────────
 *
 *  ✗  Change `humanInitiated: true` to `humanInitiated: boolean` — that
 *     defeats the entire guard.
 *  ✗  Pass `{ humanInitiated: someVariable }` — only the literal `true`
 *     satisfies this type.
 *  ✗  Register any function that accepts `HumanOnlyOpts` as an MCP tool.
 */

/** Literal-typed option object that acts as a compile-time human-only guard. */
export type HumanOnlyOpts = { humanInitiated: true };

/**
 * Pre-built constant to use as the default parameter value.
 *
 * @example
 *   async closeWallet(id: string, opts: HumanOnlyOpts = HUMAN_ONLY) { ... }
 */
export const HUMAN_ONLY: HumanOnlyOpts = { humanInitiated: true };
