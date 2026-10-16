export function monogramOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase();
}

export function hueOf(seed: string): number {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 360;
  return hash;
}
