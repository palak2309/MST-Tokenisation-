/**
 * Cryptographic utilities for password hashing and secure session generation.
 * Uses PBKDF2-HMAC-SHA512 with 100,000 iterations and unique 16-byte random salts.
 * Works seamlessly across Web Crypto API and Node.js environments.
 */

// Generate a cryptographically secure random hex salt
export function generateSalt(bytes = 16): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("No secure random number generator available in environment.");
}

// Generate a secure session ID
export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return generateSalt(32);
}

// Hash password with salt using PBKDF2 with SHA-512 (100,000 iterations)
export async function hashPassword(password: string, salt: string): Promise<string> {
  if (!password || !salt) {
    throw new Error("Password and salt are required for hashing.");
  }

  // Use standard Web Crypto API (supported in Node.js 18+ and all modern browsers)
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: enc.encode(salt),
        iterations: 100000,
        hash: "SHA-512",
      },
      keyMaterial,
      512,
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  throw new Error("Web Crypto API (crypto.subtle) is required for password derivation.");
}

// Constant-time string comparison to prevent timing attacks
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyPassword(
  password: string,
  salt: string,
  hash: string,
): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  return constantTimeCompare(computedHash, hash);
}
