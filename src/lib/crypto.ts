// ============================================================
// Nythos — Client-side Encryption Helpers
// AES-GCM with PBKDF2 key derivation.
//
// SECURITY MODEL:
//  - No default key fallback. Key MUST be provided by the caller.
//  - Salt is random per-operation (16 bytes), stored in the payload.
//  - Payload format: [salt 16B] + [iv 12B] + [ciphertext]
//  - Key should come from NEXT_PUBLIC_ENCRYPTION_KEY env var.
//    Generate with: openssl rand -base64 32
// ============================================================

const ENCRYPTION_PREFIX = "ENC::v2:";

function requireKey(key: string | undefined): string {
  if (!key || key.trim() === "") {
    throw new Error(
      "[nythos/crypto] Encryption key is required but was not provided. " +
      "Set NEXT_PUBLIC_ENCRYPTION_KEY in your environment variables. " +
      "Generate one with: openssl rand -base64 32"
    );
  }
  return key;
}

/**
 * Encrypt sensitive text using AES-GCM with a random salt and IV per operation.
 * @param plainText  Text to encrypt.
 * @param key        Passphrase — must be provided (use NEXT_PUBLIC_ENCRYPTION_KEY).
 */
export async function encryptText(plainText: string, key: string): Promise<string> {
  if (!plainText) return plainText;

  const passphrase = requireKey(key);
  const encoder = new TextEncoder();

  // Random salt (16 bytes) — unique per encryption operation
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,                  // random per operation
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Random IV (12 bytes) — unique per encryption operation
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(plainText)
  );

  // Payload: [salt 16B] + [iv 12B] + [ciphertext]
  const cipherBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(16 + 12 + cipherBytes.length);
  combined.set(salt, 0);
  combined.set(iv, 16);
  combined.set(cipherBytes, 28);

  return ENCRYPTION_PREFIX + btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt text produced by encryptText.
 * @param encryptedText  Ciphertext starting with the ENCRYPTION_PREFIX.
 * @param key            Same passphrase used for encryption.
 */
export async function decryptText(encryptedText: string, key: string): Promise<string> {
  if (!encryptedText) return encryptedText;

  // Passthrough for legacy v1 format (ENC:: without v2 marker) or plain text
  if (!encryptedText.startsWith(ENCRYPTION_PREFIX)) {
    return encryptedText;
  }

  const passphrase = requireKey(key);
  const encoder = new TextEncoder();

  const base64Data = encryptedText.slice(ENCRYPTION_PREFIX.length);
  const combined = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

  // Extract salt (bytes 0–15), iv (bytes 16–27), ciphertext (rest)
  const salt = combined.slice(0, 16);
  const iv   = combined.slice(16, 28);
  const data = combined.slice(28);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,                  // extracted from payload
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Check if a text was encrypted by this module (v2 format).
 */
export function isEncrypted(text: string): boolean {
  return text?.startsWith(ENCRYPTION_PREFIX) ?? false;
}
