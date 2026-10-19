// Small helpers shared by the identifier validators.
//
// The validators in this directory implement published check-digit and
// date rules. Their behaviour is kept identical to python-stdnum (the
// validation library behind EuroPII Guard), which the parity tests use as an
// oracle; no code is copied from it.

export const isDigits = (s: string): boolean => /^[0-9]+$/.test(s);

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeap(year) ? 29 : DAYS[month - 1];
}

/** True for a real calendar date in years 1..9999 (Python's date range). */
export function isDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  return Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month);
}

/** Compare a date with today (local time); used by "not born yet" checks. */
export function isFuture(year: number, month: number, day: number, today = new Date()): boolean {
  const t = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  return year * 10000 + month * 100 + day > t[0] * 10000 + t[1] * 100 + t[2];
}

export const int = (s: string): number => parseInt(s, 10);

/** Python-style modulo: the result has the sign of the divisor. */
export const mod = (a: number, m: number): number => ((a % m) + m) % m;

/** Weighted digit sum. */
export function weighted(digits: string, weights: readonly number[]): number {
  let sum = 0;
  const n = Math.min(digits.length, weights.length);
  for (let i = 0; i < n; i++) sum += weights[i] * (digits.charCodeAt(i) - 48);
  return sum;
}

/** Remainder of a long decimal string, without overflowing doubles. */
export function modDecimal(digits: string, m: number): number {
  let r = 0;
  for (let i = 0; i < digits.length; i++) r = (r * 10 + (digits.charCodeAt(i) - 48)) % m;
  return r;
}

/** Luhn checksum over an alphabet (0 means valid). */
export function luhnChecksum(value: string, alphabet = "0123456789"): number {
  const n = alphabet.length;
  let sum = 0;
  for (let i = value.length - 1, pos = 0; i >= 0; i--, pos++) {
    const v = alphabet.indexOf(value[i]);
    if (v < 0) return -1;
    if (pos % 2 === 0) sum += v;
    else {
      const d = v * 2;
      sum += Math.floor(d / n) + (d % n);
    }
  }
  return sum % n;
}

export const luhnValid = (value: string): boolean => value.length > 0 && luhnChecksum(value) === 0;

export function luhnCheckDigit(body: string): string {
  const ck = luhnChecksum(body + "0");
  return "0123456789"[mod(-ck, 10)];
}

/** ISO 7064 MOD 11,10 (German tax ID, Croatian OIB, German VAT). */
export function mod11_10Valid(digits: string): boolean {
  if (!isDigits(digits)) return false;
  let check = 5;
  for (const ch of digits) check = ((((check || 10) * 2) % 11) + (ch.charCodeAt(0) - 48)) % 10;
  return check === 1;
}

/** ISO 7064 MOD 97-10 over an alphanumeric string (IBAN, Dutch VAT). */
export function mod97_10(value: string): number {
  let expanded = "";
  for (const ch of value) {
    const v = parseInt(ch, 36);
    if (Number.isNaN(v)) return -1;
    expanded += String(v);
  }
  return modDecimal(expanded, 97);
}

/**
 * Normalise look-alike characters (dashes, spaces, dots, slashes, full-width
 * digits) to ASCII and drop the characters in `remove`.
 */
const LOOKALIKE: Record<string, string> = {};
for (const [chars, to] of [
  ["‐‑‒–—―−﹣－", "-"],
  ["              　", " "],
  ["·•․‧・．", "."],
  ["⁄∕／", "/"],
  ["：", ":"],
] as const) {
  for (const c of chars) LOOKALIKE[c] = to;
}
for (let d = 0; d < 10; d++) LOOKALIKE[String.fromCharCode(0xff10 + d)] = String(d);

export function clean(value: string, remove = ""): string {
  let out = "";
  for (const ch of value) {
    const c = LOOKALIKE[ch] ?? ch;
    if (!remove.includes(c)) out += c;
  }
  return out;
}
