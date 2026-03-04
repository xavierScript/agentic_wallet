import { Keypair } from "@solana/web3.js";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
} from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import bs58 from "bs58";

/**
 * Encrypted keystore entry stored on disk.
 * Private keys are AES-256-GCM encrypted using a PBKDF2-derived key.
 * Format inspired by Ethereum keystores, adapted for Solana Ed25519 keys.
 */
export interface KeystoreEntry {
  /** Unique wallet identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Solana public key (base58) */
  publicKey: string;
  /** Encrypted private key payload */
  crypto: {
    /** Encryption algorithm */
    cipher: "aes-256-gcm";
    /** Hex-encoded encrypted data */
    ciphertext: string;
    /** Key derivation function */
    kdf: "pbkdf2";
    kdfparams: {
      /** Number of PBKDF2 iterations */
      iterations: number;
      /** Hex-encoded salt */
      salt: string;
      /** Key length in bytes */
      dklen: number;
      /** Hash algorithm */
      digest: "sha512";
    };
    /** Hex-encoded initialization vector */
    iv: string;
    /** Hex-encoded GCM auth tag */
    authTag: string;
  };
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Wallet metadata */
  metadata: Record<string, unknown>;
}

const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * KeyManager handles generation, encryption, storage, and retrieval
 * of Solana keypairs. Private keys never exist in plaintext on disk.
 *
 * Security model:
 * - Keys encrypted with AES-256-GCM
 * - Encryption key derived via PBKDF2 (210k iterations, SHA-512)
 * - Each keystore has its own random salt and IV
 * - Auth tags prevent tampering
 */
export class KeyManager {
  private keystoreDir: string;
  private passphrase: string;

  constructor(keystoreDir: string, passphrase: string) {
    this.keystoreDir = keystoreDir;
    this.passphrase = passphrase;
    mkdirSync(this.keystoreDir, { recursive: true });
  }

  /**
   * Generate a new Solana keypair, encrypt the private key, and store it.
   */
  createWallet(
    label: string = "agent-wallet",
    metadata: Record<string, unknown> = {},
  ): KeystoreEntry {
    const keypair = Keypair.generate();
    const id = uuidv4();
    const publicKey = keypair.publicKey.toBase58();

    // Encrypt the private key (full 64-byte secret key)
    const secretKeyB58 = bs58.encode(keypair.secretKey);
    const encrypted = this.encrypt(secretKeyB58);

    const entry: KeystoreEntry = {
      id,
      label,
      publicKey,
      crypto: {
        cipher: "aes-256-gcm",
        ciphertext: encrypted.ciphertext,
        kdf: "pbkdf2",
        kdfparams: {
          iterations: PBKDF2_ITERATIONS,
          salt: encrypted.salt,
          dklen: KEY_LENGTH,
          digest: "sha512",
        },
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      createdAt: new Date().toISOString(),
      metadata,
    };

    // Write to disk
    const filePath = join(this.keystoreDir, `${id}.json`);
    writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
    this.restrictPermissions(filePath);

    return entry;
  }

  /**
   * Import an existing keypair from a base58-encoded secret key.
   */
  importWallet(
    secretKeyB58: string,
    label: string = "imported-wallet",
    metadata: Record<string, unknown> = {},
  ): KeystoreEntry {
    const secretKey = bs58.decode(secretKeyB58);
    const keypair = Keypair.fromSecretKey(secretKey);
    const id = uuidv4();
    const publicKey = keypair.publicKey.toBase58();

    const encrypted = this.encrypt(secretKeyB58);

    const entry: KeystoreEntry = {
      id,
      label,
      publicKey,
      crypto: {
        cipher: "aes-256-gcm",
        ciphertext: encrypted.ciphertext,
        kdf: "pbkdf2",
        kdfparams: {
          iterations: PBKDF2_ITERATIONS,
          salt: encrypted.salt,
          dklen: KEY_LENGTH,
          digest: "sha512",
        },
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      createdAt: new Date().toISOString(),
      metadata: { ...metadata, imported: true },
    };

    const filePath = join(this.keystoreDir, `${id}.json`);
    writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
    this.restrictPermissions(filePath);

    return entry;
  }

  /**
   * Load a keystore entry from disk (does NOT decrypt the key).
   */
  loadKeystore(walletId: string): KeystoreEntry {
    const filePath = join(this.keystoreDir, `${walletId}.json`);
    if (!existsSync(filePath)) {
      throw new Error(`Wallet keystore not found: ${walletId}`);
    }
    return JSON.parse(readFileSync(filePath, "utf-8"));
  }

  /**
   * Decrypt and return the Solana Keypair for a wallet.
   * The private key exists in memory only during the calling scope.
   */
  unlockWallet(walletId: string): Keypair {
    const entry = this.loadKeystore(walletId);
    const secretKeyB58 = this.decrypt(
      entry.crypto.ciphertext,
      entry.crypto.kdfparams.salt,
      entry.crypto.iv,
      entry.crypto.authTag,
      entry.crypto.kdfparams.iterations,
    );
    const secretKey = bs58.decode(secretKeyB58);
    return Keypair.fromSecretKey(secretKey);
  }

  /**
   * List all wallet IDs stored on disk.
   */
  listWallets(): KeystoreEntry[] {
    if (!existsSync(this.keystoreDir)) return [];
    const files = readdirSync(this.keystoreDir).filter((f) =>
      f.endsWith(".json"),
    );
    return files.map((f) => {
      const content = readFileSync(join(this.keystoreDir, f), "utf-8");
      return JSON.parse(content) as KeystoreEntry;
    });
  }

  /**
   * Find the first keystore entry whose label matches exactly.
   * Returns `null` when no match is found.
   */
  findByLabel(label: string): KeystoreEntry | null {
    const entries = this.listWallets();
    return entries.find((e) => e.label === label) ?? null;
  }

  /**
   * Decrypt and return the Keypair for the first wallet whose label matches.
   * Returns `null` when no wallet with that label exists in the keystore.
   */
  unlockByLabel(label: string): Keypair | null {
    const entry = this.findByLabel(label);
    if (!entry) return null;
    return this.unlockWallet(entry.id);
  }

  /**
   * Delete a wallet keystore from disk.
   */
  deleteWallet(walletId: string): void {
    const filePath = join(this.keystoreDir, `${walletId}.json`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  // --- Encryption / Decryption ---

  /**
   * Restrict file permissions to owner-only (0600) on POSIX systems.
   * On Windows this is a no-op since Windows uses ACLs, not POSIX permissions.
   */
  private restrictPermissions(filePath: string): void {
    try {
      if (process.platform !== "win32") {
        chmodSync(filePath, 0o600);
      }
    } catch {
      // Non-critical — best-effort permission restriction
    }
  }

  private deriveKey(
    passphrase: string,
    salt: Buffer,
    iterations: number,
  ): Buffer {
    return pbkdf2Sync(passphrase, salt, iterations, KEY_LENGTH, "sha512");
  }

  private encrypt(plaintext: string): {
    ciphertext: string;
    salt: string;
    iv: string;
    authTag: string;
  } {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = this.deriveKey(this.passphrase, salt, PBKDF2_ITERATIONS);

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plaintext, "utf-8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  }

  private decrypt(
    ciphertext: string,
    saltHex: string,
    ivHex: string,
    authTagHex: string,
    iterations: number,
  ): string {
    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = this.deriveKey(this.passphrase, salt, iterations);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, "hex", "utf-8");
    decrypted += decipher.final("utf-8");
    return decrypted;
  }
}
