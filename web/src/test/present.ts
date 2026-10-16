/** Narrows an optional test lookup, failing with a readable message when it is missing. */
export function present<T>(value: T | null | undefined, name = 'value'): T {
  if (value === null || value === undefined) throw new Error(`Expected ${name} to be present`);
  return value;
}
