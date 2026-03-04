#!/usr/bin/env node
/**
 * import-system-keys.ts
 *
 * ONE-TIME SETUP SCRIPT — run once to migrate raw base58 secret keys out of
 * .env and into the AES-256-GCM encrypted keystore managed by KeyManager.
 *
 * What it does:
 *   1. Reads MASTER_WALLET_SECRET_KEY (base58) from the environment.
 *   2. Encrypts it with WALLET_PASSPHRASE via AES-256-GCM + PBKDF2 and
 *      stores it under the label "master-funder" in ~/.agentic-wallet/keys/.
 *   3. Prints the public key and the replacement env var to add to .env.
 *   4. The raw secret key is NEVER written to disk — only the encrypted form.
 *
 * After running this script:
 *   - Remove MASTER_WALLET_SECRET_KEY from your .env
 *   - Add:  MASTER_WALLET_KEY_LABEL=master-funder
 *   - The runtime will load the key from the keystore via WALLET_PASSPHRASE.
 *
 * Usage:
 *   pnpm key:import
 *   # or directly:
 *   node --loader ts-node/esm packages/wallet-core/src/scripts/import-system-keys.js
 *
 * Custom label (optional):
 *   MASTER_WALLET_KEY_LABEL=my-label pnpm key:import
 */

import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { KeyManager } from "../core/key-manager.js";
import { getDefaultConfig } from "../core/config.js";

// ── Load environment ──────────────────────────────────────────────────────────

loadEnv();
loadEnv({ path: resolve(process.cwd(), "..", ".env") });
loadEnv({ path: resolve(process.cwd(), "..", "..", ".env") });

// ── Helpers ───────────────────────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function ok(msg: string) {
  console.log(`${GREEN}✔${RESET}  ${msg}`);
}
function warn(msg: string) {
  console.log(`${YELLOW}⚠${RESET}  ${msg}`);
}
function error(msg: string) {
  console.error(`${RED}✖${RESET}  ${msg}`);
}
function info(msg: string) {
  console.log(`${DIM}   ${msg}${RESET}`);
}
function heading(msg: string) {
  console.log(`\n${BOLD}${msg}${RESET}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  heading("Agentic Wallet — System Key Import");
  console.log(
    "Migrates raw base58 private keys from .env into the encrypted keystore.\n",
  );

  const config = getDefaultConfig();
  const keyManager = new KeyManager(config.keystoreDir, config.passphrase);

  let imported = 0;
  let skipped = 0;

  // ── MASTER_WALLET_SECRET_KEY ────────────────────────────────────────────────

  heading("1. Master Funder Wallet (MASTER_WALLET_SECRET_KEY)");

  const rawMasterKey = process.env.MASTER_WALLET_SECRET_KEY;
  const masterLabel =
    process.env.MASTER_WALLET_KEY_LABEL?.trim() || "master-funder";

  if (!rawMasterKey) {
    warn(
      "MASTER_WALLET_SECRET_KEY is not set in .env — skipping master funder import.",
    );
    info("Set MASTER_WALLET_SECRET_KEY=<base58> in .env and re-run to import.");
    skipped++;
  } else {
    // Check whether this label already exists in the keystore
    const existing = keyManager.findByLabel(masterLabel);
    if (existing) {
      warn(
        `A keystore entry with label "${masterLabel}" already exists (id: ${existing.id}).`,
      );
      info("Delete it first if you want to re-import: remove the .json file");
      info(
        `from ${config.keystoreDir} whose label is "${masterLabel}", then re-run.`,
      );
      skipped++;
    } else {
      try {
        const entry = keyManager.importWallet(rawMasterKey, masterLabel, {
          role: "master-funder",
          importedBy: "import-system-keys",
          importedAt: new Date().toISOString(),
        });

        ok(`Encrypted and stored as "${masterLabel}"`);
        info(`Keystore ID : ${entry.id}`);
        info(`Public key  : ${entry.publicKey}`);
        info(`Stored at   : ${config.keystoreDir}/${entry.id}.json`);
        imported++;
      } catch (err: any) {
        error(`Failed to import master wallet key: ${err.message}`);
        info(
          "Make sure MASTER_WALLET_SECRET_KEY is a valid base58-encoded secret key.",
        );
        process.exit(1);
      }
    }
  }

  // ── Summary & next steps ────────────────────────────────────────────────────

  heading("Done");

  if (imported === 0 && skipped > 0) {
    warn("Nothing was imported. See warnings above.");
    return;
  }

  if (imported > 0) {
    ok(`${imported} key(s) imported into the encrypted keystore.`);
    console.log("");
    console.log(`${BOLD}Next steps — update your .env:${RESET}`);
    console.log("");

    if (rawMasterKey) {
      console.log(`  ${RED}# Remove this line:${RESET}`);
      console.log(`  ${DIM}MASTER_WALLET_SECRET_KEY=<your-raw-key>${RESET}`);
      console.log("");
      console.log(`  ${GREEN}# Add this line instead:${RESET}`);
      console.log(`  MASTER_WALLET_KEY_LABEL=${masterLabel}`);
      console.log("");
    }

    console.log(
      `${DIM}The runtime will unlock the key from the keystore using WALLET_PASSPHRASE.${RESET}`,
    );
    console.log(
      `${DIM}Your passphrase (WALLET_PASSPHRASE) is still needed in .env — it is not a secret key.${RESET}`,
    );
    console.log("");

    warn(
      "IMPORTANT: Remove MASTER_WALLET_SECRET_KEY from .env and from your shell history.",
    );
    info("On bash/zsh: `history -d <line>` or clear history with `history -c`");
    info(
      "On PowerShell: `(Get-PSReadLineOption).HistorySavePath` — edit or delete the file",
    );
  }
}

main().catch((err) => {
  console.error(`\x1b[31mFatal error: ${err.message}\x1b[0m`);
  process.exit(1);
});
