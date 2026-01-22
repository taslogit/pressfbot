
// Mock Cloud / IPFS Service

export const uploadToIPFS = async (encryptedPayload: string): Promise<string> => {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 1500));
  const hash = 'Qm' + Array.from({ length: 44 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `ipfs://${hash}`;
};

export const checkNetworkStatus = async (): Promise<'online' | 'offline' | 'syncing'> => {
  const rand = Math.random();
  if (rand > 0.8) return 'syncing';
  if (rand > 0.95) return 'offline';
  return 'online';
};
