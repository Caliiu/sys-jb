const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Confere só o formato (algo@dominio.ext, sem espaços). Quem valida de fato é o servidor. */
export function isPlausibleEmail(value: string): boolean {
  return EMAIL_FORMAT.test(value);
}
