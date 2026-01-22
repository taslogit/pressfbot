
// Simulation of AES-256 and Shamir's Secret Sharing
// In a real app, use 'crypto-js' or 'shamir-secret-sharing' libraries

export const generateKey = (): string => {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

export const encryptPayload = async (content: string, key: string): Promise<string> => {
  // Mock encryption delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Handle Unicode strings (Cyrillic) correctly for Base64
  // Standard btoa() fails on non-Latin1 characters
  try {
      const text = `ENCRYPTED_AES256::${key}::${content}`;
      const bytes = new TextEncoder().encode(text);
      const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
      return btoa(binString);
  } catch (e) {
      console.error("Encryption mock failed:", e);
      // Fallback
      return btoa(unescape(encodeURIComponent(`ENCRYPTED_AES256::${key}::${content}`)));
  }
};

export const splitKey = (key: string, parts: number, threshold: number): string[] => {
  // Mock SSS splitting
  const shards = [];
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
