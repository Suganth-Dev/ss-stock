/**
 * Generates a clean, readable 12-character activation code.
 * Example: "SS7K-92LP-X4QM"
 */
export function generateRandomActivationCode(): string {
  // Use characters that avoid visual confusion (omit 0, O, 1, I)
  const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    randomPart += charset[randomIndex];
  }
  const full = 'SS' + randomPart;
  return `${full.slice(0, 4)}-${full.slice(4, 8)}-${full.slice(8, 12)}`;
}

/**
 * Computes SHA-256 hash in browser using standard crypto.subtle.
 * Matches the mobile app's hashing algorithm.
 */
export async function hashActivationCode(rawCode: string): Promise<string> {
  const normalized = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const msgUint8 = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
