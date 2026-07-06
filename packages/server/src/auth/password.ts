import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return bcrypt.compare(plain, hash);
  } catch {
    // Malformed hash or other error → treat as invalid
    return false;
  }
}
