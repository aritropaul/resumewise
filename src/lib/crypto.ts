// AES-256-GCM encryption for BYOK API keys.
// Uses Web Crypto API — works in both Node.js and Cloudflare Workers.

const ALGO = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

async function importKey(hexKey: string): Promise<CryptoKey> {
  const raw = new Uint8Array(
    hexKey.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  return crypto.subtle.importKey("raw", raw, ALGO, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export async function encryptApiKey(
  plaintext: string,
  masterKeyHex: string
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey(masterKeyHex);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoded
  );
  return {
    ciphertext: toBase64(encrypted),
    iv: toBase64(iv.buffer),
  };
}

export async function decryptApiKey(
  ciphertext: string,
  iv: string,
  masterKeyHex: string
): Promise<string> {
  const key = await importKey(masterKeyHex);
  const ivBuf = fromBase64(iv);
  const cipherBuf = fromBase64(ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv: ivBuf as unknown as ArrayBuffer },
    key,
    cipherBuf as unknown as ArrayBuffer
  );
  return new TextDecoder().decode(decrypted);
}
