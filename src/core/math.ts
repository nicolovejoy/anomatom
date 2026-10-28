export function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** Non-negative remainder. */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
