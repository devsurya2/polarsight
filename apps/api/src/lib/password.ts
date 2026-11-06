import bcrypt from "bcryptjs";

// bcryptjs is the pure-JS implementation: same algorithm and hash
// format as the native package, without its vulnerable build chain.
const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Minimum bar for an administrator password. */
export function assessPassword(plain: string): string[] {
  const problems: string[] = [];
  if (plain.length < 12) problems.push("must be at least 12 characters");
  if (!/[a-z]/.test(plain)) problems.push("must contain a lowercase letter");
  if (!/[A-Z]/.test(plain)) problems.push("must contain an uppercase letter");
  if (!/[0-9]/.test(plain)) problems.push("must contain a digit");
  return problems;
}
