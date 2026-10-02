import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const ALGORITHM = "scrypt";
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_MEMORY = 32 * 1024 * 1024;

function validatePassword(password: string) {
  if (password.length < 10 || password.length > 128) {
    throw new Error("Password must contain between 10 and 128 characters.");
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_BYTES,
      {
        N: COST,
        maxmem: MAX_MEMORY,
        p: PARALLELIZATION,
        r: BLOCK_SIZE,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);

  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt);

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    const [algorithm, cost, blockSize, parallelization, saltValue, keyValue] =
      encodedHash.split("$");

    if (
      algorithm !== ALGORITHM ||
      Number(cost) !== COST ||
      Number(blockSize) !== BLOCK_SIZE ||
      Number(parallelization) !== PARALLELIZATION ||
      !saltValue ||
      !keyValue
    ) {
      return false;
    }

    const salt = Buffer.from(saltValue, "base64url");
    const expectedKey = Buffer.from(keyValue, "base64url");
    if (salt.length !== SALT_BYTES || expectedKey.length !== KEY_BYTES) {
      return false;
    }

    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
