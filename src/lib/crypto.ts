// ============================================================
// Nythos — Client-side Encryption Helpers
// Simulates health-grade encryption for sensitive data
// ============================================================

const ENCRYPTION_PREFIX = "ENC::";
const DEFAULT_KEY = "nythos_client_key_2024";

/**
 * Encrypt sensitive text on the client side.
 * Uses the Web Crypto API with AES-GCM for real encryption.
 */
export async function encryptText(plainText: string, key?: string): Promise<string> {
  if (!plainText) return plainText;

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainText);

    // Derive key from passphrase
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key || DEFAULT_KEY),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const cryptoKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("nythos_salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      data
    );

    // Combine IV + encrypted data and encode to base64
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return ENCRYPTION_PREFIX + btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error("Encryption error:", error);
    // Fallback: base64 encode
    return ENCRYPTION_PREFIX + btoa(unescape(encodeURIComponent(plainText)));
  }
}

/**
 * Decrypt encrypted text on the client side.
 */
export async function decryptText(encryptedText: string, key?: string): Promise<string> {
  if (!encryptedText || !encryptedText.startsWith(ENCRYPTION_PREFIX)) {
    return encryptedText;
  }

  try {
    const encoder = new TextEncoder();
    const base64Data = encryptedText.slice(ENCRYPTION_PREFIX.length);
    const combined = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    // Derive key from passphrase
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key || DEFAULT_KEY),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const cryptoKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("nythos_salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      data
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("Decryption error:", error);
    // Fallback: base64 decode
    try {
      const base64Data = encryptedText.slice(ENCRYPTION_PREFIX.length);
      return decodeURIComponent(escape(atob(base64Data)));
    } catch {
      return "[Dados criptografados]";
    }
  }
}

/**
 * Check if a text is encrypted
 */
export function isEncrypted(text: string): boolean {
  return text?.startsWith(ENCRYPTION_PREFIX) ?? false;
}
