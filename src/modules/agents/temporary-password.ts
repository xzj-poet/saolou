import { randomInt } from "node:crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*";
const ALL = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`;

function pick(characters: string) {
  return characters[randomInt(characters.length)];
}

export function generateTemporaryPassword(): string {
  const characters = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (characters.length < 16) characters.push(pick(ALL));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}
