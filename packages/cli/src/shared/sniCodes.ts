export function validateSniCode(code: string): boolean {
  return /^\d{5}$/.test(code);
}
