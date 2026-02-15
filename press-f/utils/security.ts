/**
 * E2E encryption for letter content (AES-256-GCM).
 * Content is encrypted client-side before sending; only ciphertext reaches the server.
 * Server stores ciphertext in DB and never sees plaintext.
 * Key derived per-letter from master key (localStorage). Uses Web Crypto API.
 */

const MASTER_KEY_STORAGE = 'lastmeme_enc_key';
const AES_PREFIX = 'AES_GCM:';

function getOrCreateMasterKey(): Uint8Array {
  try {
    const stored = localStorage.getItem(MASTER_KEY_STORAGE);
    if (stored) {
      const raw = Uint8Array.from(JSON.parse(stored) as number[]);
      if (raw.length === 32) return raw;
    }
  } catch {}
  const key = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(MASTER_KEY_STORAGE, JSON.stringify(Array.from(key)));
  return key;
}

async function deriveKey(masterKey: Uint8Array, letterId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', masterKey, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode(letterId),
      iterations: 100000
    },
    material,
    256
  );
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Check if string is our AES-GCM encrypted payload */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(AES_PREFIX);
}

/** Encrypt content with AES-256-GCM. Returns "AES_GCM:" + base64(iv+ciphertext). */
export async function encryptPayload(content: string, letterId: string): Promise<string> {
  if (!content) return '';
  const masterKey = getOrCreateMasterKey();
  const key = await deriveKey(masterKey, letterId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    enc.encode(content)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  const b64 = btoa(String.fromCharCode(...combined));
  return AES_PREFIX + b64;
}

/** Decrypt content. Returns plaintext or empty on failure. */
export async function decryptPayload(encrypted: string, letterId: string): Promise<string> {
  if (!encrypted?.startsWith(AES_PREFIX)) return encrypted || '';
  try {
    const b64 = encrypted.slice(AES_PREFIX.length);
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const iv = binary.slice(0, 12);
    const ciphertext = binary.slice(12);
    const masterKey = getOrCreateMasterKey();
    const key = await deriveKey(masterKey, letterId);
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      ciphertext
    );
    return new TextDecoder().decode(dec);
  } catch {
    return '';
  }
}

/** Legacy: split key for Shamir (UI animation only, keys not used) */
export const splitKey = (key: string, parts: number, threshold: number): string[] => {
  const shards: string[] = [];
  for (let i = 0; i < parts; i++) {
    shards.push(`shard_${i + 1}_${key.substring(0, 5)}...`);
  }
  return shards;
};

export const generateHash = (content: string): string => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return '0x' + Math.abs(hash).toString(16);
};
