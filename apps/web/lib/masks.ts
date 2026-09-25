/** Máscaras de digitação (progressivas) e conversões para os formulários de autenticação. */

const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

/** (11) 91234-5678 ou (11) 3333-4444. */
export function maskPhoneInput(value: string): string {
  const d = digits(value, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const local = d.slice(2);
  const split = d.length === 11 ? 5 : 4;
  if (local.length <= split) return `(${d.slice(0, 2)}) ${local}`;
  return `(${d.slice(0, 2)}) ${local.slice(0, split)}-${local.slice(split)}`;
}

/** 000.000.000-00 */
export function maskCpfInput(value: string): string {
  const d = digits(value, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** DD/MM/AAAA */
export function maskBirthDateInput(value: string): string {
  const d = digits(value, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "17/05/1990" -> "1990-05-17". Data incompleta -> "" (o schema acusa o erro). */
export function birthDateBrToIso(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}
