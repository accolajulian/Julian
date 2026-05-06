import CryptoJS from "crypto-js";

// ─── Key resolution ───────────────────────────────────────────────────────────

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
        "Generate a 32-byte random string and add it to your .env.local file."
    );
  }
  if (key.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY must be at least 32 characters long for AES-256 security."
    );
  }
  return key;
}

// ─── AES-256 encrypt / decrypt ────────────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-256 with a random IV.
 * The returned ciphertext is a base64-encoded string that includes
 * the IV, so decryption is self-contained.
 *
 * @param text - Plaintext string to encrypt.
 * @returns Base64-encoded ciphertext string.
 * @throws If ENCRYPTION_KEY is missing or the encryption fails.
 */
export function encrypt(text: string): string {
  if (!text) return text;

  try {
    const key = getEncryptionKey();
    // CryptoJS.AES.encrypt with a passphrase derives key + IV automatically
    // using OpenSSL-compatible PBKDF (salted). The result includes the salt.
    const ciphertext = CryptoJS.AES.encrypt(text, key).toString();
    return ciphertext;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Encryption failed: ${message}`);
  }
}

/**
 * Decrypts a ciphertext string previously produced by `encrypt`.
 *
 * @param ciphertext - Base64-encoded ciphertext from `encrypt`.
 * @returns The original plaintext string.
 * @throws If ENCRYPTION_KEY is missing, or if decryption fails (e.g. wrong key
 *         or corrupted data).
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;

  try {
    const key = getEncryptionKey();
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    if (!decrypted) {
      throw new Error(
        "Decryption produced an empty result — the key may be wrong or the data may be corrupted."
      );
    }

    return decrypted;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Decryption failed: ${message}`);
  }
}

/**
 * Encrypts a value only when it is non-null and non-empty.
 * Returns null / undefined as-is, making it safe for optional DB fields.
 */
export function encryptOptional(text: string | null | undefined): string | null {
  if (text == null || text === "") return null;
  return encrypt(text);
}

/**
 * Decrypts a value only when it is non-null and non-empty.
 * Returns null as-is.
 */
export function decryptOptional(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null || ciphertext === "") return null;
  return decrypt(ciphertext);
}

/**
 * One-way SHA-256 hash — suitable for storing API key hashes,
 * verifying integrity, etc. NOT reversible.
 *
 * @param text - Value to hash.
 * @returns Hex-encoded SHA-256 digest.
 */
export function sha256(text: string): string {
  return CryptoJS.SHA256(text).toString(CryptoJS.enc.Hex);
}

/**
 * Generate a cryptographically random hex token of `byteLength` bytes.
 * Useful for generating API keys, webhook secrets, etc.
 *
 * @param byteLength - Number of random bytes (default: 32 → 64-char hex string).
 */
export function generateToken(byteLength = 32): string {
  const words = CryptoJS.lib.WordArray.random(byteLength);
  return words.toString(CryptoJS.enc.Hex);
}
