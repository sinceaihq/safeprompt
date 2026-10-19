// National personal identifiers of European countries.
//
// Each function receives a candidate string and returns true when it has the
// structure, birth date and check digit(s) of a valid identifier.

import { clean, int, isDate, isDigits, isFuture, luhnValid, mod, mod11_10Valid, weighted } from "./util";

// Finland: henkilötunnus. "-" and Y/X/W/V/U mean 1900s, A–F 2000s, "+" 1800s.
const HETU_RE = /^([0123]\d)([01]\d)(\d\d)([-+ABCDEFYXWVU])(\d\d\d)([0-9ABCDEFHJKLMNPRSTUVWXY])$/;
const HETU_CENTURY: Record<string, number> = { "+": 1800 };
for (const c of "-YXWVU") HETU_CENTURY[c] = 1900;
for (const c of "ABCDEF") HETU_CENTURY[c] = 2000;

export function fiHetu(value: string, allowTemporary = true): boolean {
  const m = HETU_RE.exec(clean(value).toUpperCase().trim());
  if (!m) return false;
  const [, dd, mm, yy, century, ind, control] = m;
  if (!isDate(HETU_CENTURY[century] + int(yy), int(mm), int(dd))) return false;
  const individual = int(ind);
  if (individual < 2 || (individual >= 900 && !allowTemporary)) return false;
  return "0123456789ABCDEFHJKLMNPRSTUVWXY"[int(dd + mm + yy + ind) % 31] === control;
}

// Italy: codice fiscale (16-character personal form).
const CF_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
const CF_ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
const cfValue = (ch: string): number => (ch <= "9" ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 65);
const cfDateDigit = (ch: string): number => (ch <= "9" ? ch.charCodeAt(0) - 48 : "LMNPQRSTUV".indexOf(ch));

export function itCodiceFiscale(value: string): boolean {
  const n = clean(value, " -:").trim().toUpperCase();
  if (n.length !== 16 || !CF_RE.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += i % 2 === 0 ? CF_ODD[cfValue(n[i])] : cfValue(n[i]);
  if (String.fromCharCode(65 + (sum % 26)) !== n[15]) return false;
  const day = (cfDateDigit(n[9]) * 10 + cfDateDigit(n[10])) % 40;
  const month = "ABCDEHLMPRST".indexOf(n[8]) + 1;
  let year = cfDateDigit(n[6]) * 10 + cfDateDigit(n[7]) + 1900;
  if (year < 1920) year += 100;
  return isDate(year, month, day);
}

// France: NIR (numéro de sécurité sociale); Corsica uses 2A/2B.
export function frNir(value: string): boolean {
  let n = clean(value, " .").trim().toUpperCase();
  if (!isDigits(n.slice(0, 5)) || !isDigits(n.slice(7))) return false;
  const dept = n.slice(5, 7);
  if (!isDigits(dept) && dept !== "2A" && dept !== "2B") return false;
  if (n.length !== 15) return false;
  const check = n.slice(13);
  if (dept === "2A") n = n.slice(0, 5) + "19" + n.slice(7);
  else if (dept === "2B") n = n.slice(0, 5) + "18" + n.slice(7);
  return String(97 - (int(n.slice(0, 13)) % 97)).padStart(2, "0") === check;
}

// Spain: DNI and NIE.
const dniLetter = (digits: string): string => "TRWAGMYFPDXBNJZSQVHLCKE"[int(digits) % 23];

export function esDni(value: string): boolean {
  const n = clean(value, " -").toUpperCase().trim();
  return isDigits(n.slice(0, -1)) && n.length === 9 && dniLetter(n.slice(0, 8)) === n[8];
}

export function esNie(value: string): boolean {
  const n = clean(value, " -").toUpperCase().trim();
  if (!isDigits(n.slice(1, -1)) || !"XYZ".includes(n.slice(0, 1)) || n.length === 0) return false;
  if (n.length !== 9) return false;
  return dniLetter("XYZ".indexOf(n[0]) + n.slice(1, 8)) === n[8];
}

// Ireland: PPS number (old and 2013 formats).
const IE_ALPHABET = "WABCDEFGHIJKLMNOPQRSTUV";
export function ieCheckChar(number: string): string {
  const n = number.padStart(7, "0");
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += (8 - i) * (n.charCodeAt(i) - 48);
  return IE_ALPHABET[(sum + 9 * IE_ALPHABET.indexOf(n.slice(7))) % 23];
}

export function iePps(value: string): boolean {
  const n = clean(value, " -").toUpperCase().trim();
  if (!/^\d{7}[A-W][ABHWTX]?$/.test(n)) return false;
  if (n.length === 9 && "ABH".includes(n[8])) return n[7] === ieCheckChar(n.slice(0, 7) + n[8]);
  return n[7] === ieCheckChar(n.slice(0, 7));
}

// Portugal: cartão de cidadão (document number with alphanumeric check).
const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function ptCc(value: string): boolean {
  const n = clean(value, " ").toUpperCase().trim();
  if (!/^\d*[A-Z0-9]{2}\d$/.test(n)) return false;
  const body = n.slice(0, -1);
  let s = 0;
  for (let i = 0; i < body.length; i++) {
    const v = ALNUM.indexOf(body[body.length - 1 - i]);
    if (i % 2 === 0) s += v * 2 > 9 ? v * 2 - 9 : v * 2;
    else s += v;
  }
  return String(mod(10 - s, 10)) === n[n.length - 1];
}

// Sweden: personnummer (10 or 12 digits; "+" marks age 100+).
export function sePersonnummer(value: string, today = new Date()): boolean {
  let n = clean(value, " :");
  if ((n.length === 10 || n.length === 12) && !"-+".includes(n[n.length - 5])) {
    n = `${n.slice(0, -4)}-${n.slice(-4)}`;
  }
  n = n.slice(0, -5).replace(/[-+]/g, "") + n.slice(-5);
  if (n.length !== 11 && n.length !== 13) return false;
  const digits = n.slice(0, -5) + n.slice(-4);
  if (!"-+".includes(n[n.length - 5]) || !isDigits(digits)) return false;
  let year: number, month: number, day: number;
  if (n.length === 13) {
    year = int(n.slice(0, 4));
    month = int(n.slice(4, 6));
    day = int(n.slice(6, 8));
  } else {
    const thisYear = today.getFullYear();
    let century = Math.floor(thisYear / 100);
    if (int(n.slice(0, 2)) > thisYear % 100) century -= 1;
    if (n[n.length - 5] === "+") century -= 1;
    year = int(`${century}${n.slice(0, 2)}`);
    month = int(n.slice(2, 4));
    day = int(n.slice(4, 6));
  }
  return isDate(year, month, day) && luhnValid(digits.slice(-10));
}

// Norway: fødselsnummer, D-numbers (day + 40) and H-numbers (month + 40).
export function noFodselsnummer(value: string, today = new Date()): boolean {
  const n = clean(value, " -:");
  if (n.length !== 11 || !isDigits(n)) return false;
  const c1 = mod(11 - weighted(n, [3, 7, 6, 1, 8, 9, 4, 5, 2]), 11);
  if (String(c1) !== n[9]) return false;
  const c2 = mod(11 - weighted(n, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]), 11);
  if (String(c2) !== n[10]) return false;
  let day = int(n.slice(0, 2));
  let month = int(n.slice(2, 4));
  let year = int(n.slice(4, 6));
  const ind = int(n.slice(6, 9));
  if (day >= 80) return false; // FH-number: no birth date by design
  if (day > 40) day -= 40;
  if (month > 40) month -= 40;
  if (ind < 500) year += 1900;
  else if (ind < 750 && year >= 54) year += 1800;
  else if (ind < 1000 && year < 40) year += 2000;
  else if (ind >= 900 && ind < 1000 && year >= 40) year += 1900;
  else return false;
  return isDate(year, month, day) && !isFuture(year, month, day, today);
}

// Belgium: national register number (rijksregisternummer).
export function beNationalNumber(value: string, today = new Date()): boolean {
  const n = clean(value, " -.").trim();
  if (!isDigits(n) || int(n) <= 0 || n.length !== 11) return false;
  const candidates: [number, string][] = [[1900, n]];
  if (int(n.slice(0, 2)) + 2000 <= today.getFullYear()) candidates.push([2000, "2" + n]);
  let century = 0;
  for (const [c, x] of candidates) {
    if (97 - (int(x.slice(0, -2)) % 97) === int(x.slice(-2))) {
      century = c;
      break;
    }
  }
  if (!century) return false;
  if (!["000001", "002001", "004001"].includes(n.slice(0, 6))) {
    const month = int(n.slice(2, 4)) % 20;
    if (month > 12) return false;
  }
  const rawMonth = int(n.slice(2, 4));
  return rawMonth >= 0 && rawMonth <= 12;
}

// Poland: PESEL; the month encodes the century.
export function plPesel(value: string): boolean {
  const n = clean(value, " -").toUpperCase().trim();
  if (!isDigits(n) || n.length !== 11) return false;
  if (String(mod(10 - weighted(n, [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]), 10)) !== n[10]) return false;
  const m = int(n.slice(2, 4));
  const century = [1900, 2000, 2100, 2200, 1800][Math.floor(m / 20)];
  if (century === undefined) return false;
  return isDate(century + int(n.slice(0, 2)), m % 20, int(n.slice(4, 6)));
}

// Estonia (isikukood) and Lithuania (asmens kodas) share the scheme.
function balticBirthDate(n: string): boolean {
  const centuries: Record<string, number> = { 1: 1800, 2: 1800, 3: 1900, 4: 1900, 5: 2000, 6: 2000, 7: 2100, 8: 2100 };
  const century = centuries[n[0]];
  if (century === undefined) return false;
  return isDate(century + int(n.slice(1, 3)), int(n.slice(3, 5)), int(n.slice(5, 7)));
}

function balticCheck(n: string): string {
  let check = 0;
  for (let i = 0; i < 10; i++) check += ((i % 9) + 1) * (n.charCodeAt(i) - 48);
  check %= 11;
  if (check === 10) {
    check = 0;
    for (let i = 0; i < 10; i++) check += (((i + 2) % 9) + 1) * (n.charCodeAt(i) - 48);
    check %= 11;
  }
  return String(check % 10);
}

export function eeIsikukood(value: string): boolean {
  const n = clean(value, " ").trim();
  if (!isDigits(n) || n.length !== 11) return false;
  return balticBirthDate(n) && balticCheck(n) === n[10];
}

export function ltAsmensKodas(value: string): boolean {
  const n = clean(value, " ").trim();
  if (!isDigits(n) || n.length !== 11) return false;
  if (n[0] !== "9" && !balticBirthDate(n)) return false;
  return balticCheck(n) === n[10];
}

// Latvia: personas kods. Also validates 11-digit company numbers (first digit
// 4-9), which callers that want personal codes only must exclude.
export function lvPvn(value: string): boolean {
  let n = clean(value, " -").toUpperCase().trim();
  if (n.startsWith("LV")) n = n.slice(2);
  if (!isDigits(n) || n.length !== 11) return false;
  if (n[0] > "3") return weighted(n, [9, 1, 4, 8, 3, 10, 2, 5, 7, 6, 1]) % 11 === 3;
  const check = String(((1 + weighted(n, [10, 5, 8, 4, 2, 1, 6, 3, 7, 9])) % 11) % 10);
  if (n.startsWith("32")) return check === n[10];
  const year = 1800 + int(n[6]) * 100 + int(n.slice(4, 6));
  return isDate(year, int(n.slice(2, 4)), int(n.slice(0, 2))) && check === n[10];
}

export const lvPersonasKods = (value: string): boolean =>
  value.length === 11 && "0123".includes(value[0]) && lvPvn(value);

// Czechia and Slovakia: rodné číslo (9 digits before 1954, 10 after).
export function czRodneCislo(value: string): boolean {
  const n = clean(value, " /").toUpperCase().trim();
  if (!isDigits(n) || (n.length !== 9 && n.length !== 10)) return false;
  let year = 1900 + int(n.slice(0, 2));
  const month = (int(n.slice(2, 4)) % 50) % 20;
  const day = int(n.slice(4, 6));
  if (n.length === 9) {
    if (year >= 1980) year -= 100;
    if (year > 1953) return false;
  } else if (year < 1954) year += 100;
  if (!isDate(year, month, day)) return false;
  return n.length === 9 || String((int(n.slice(0, 9)) % 11) % 10) === n[9];
}

// Slovenia: EMŠO.
export function siEmso(value: string): boolean {
  const n = clean(value, " ").trim();
  if (n.length !== 13 || !isDigits(n)) return false;
  let year = int(n.slice(4, 7));
  year += year < 800 ? 2000 : 1000;
  if (!isDate(year, int(n.slice(2, 4)), int(n.slice(0, 2)))) return false;
  return String(mod(-weighted(n, [7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]), 11) % 10) === n[12];
}

// Romania: CNP.
const RO_COUNTIES = new Set([
  ...Array.from({ length: 48 }, (_, i) => String(i + 1).padStart(2, "0")),
  "51", "52", "70", "80", "81", "82", "83",
]); // prettier-ignore

export function roCnp(value: string): boolean {
  const n = clean(value, " -").trim();
  if (!isDigits(n) || !"123456789".includes(n[0]) || n.length !== 13) return false;
  const centuries: Record<string, number> = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000 };
  const year = int(n.slice(1, 3)) + (centuries[n[0]] ?? 1900);
  if (!isDate(year, int(n.slice(3, 5)), int(n.slice(5, 7)))) return false;
  if (!RO_COUNTIES.has(n.slice(7, 9))) return false;
  const check = weighted(n, [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9]) % 11;
  return (check === 10 ? "1" : String(check)) === n[12];
}

// Bulgaria: EGN; the month encodes the century.
export function bgEgn(value: string): boolean {
  const n = clean(value, " -.").toUpperCase().trim();
  if (!isDigits(n) || n.length !== 10) return false;
  let year = int(n.slice(0, 2)) + 1900;
  let month = int(n.slice(2, 4));
  if (month > 40) {
    year += 100;
    month -= 40;
  } else if (month > 20) {
    year -= 100;
    month -= 20;
  }
  if (!isDate(year, month, int(n.slice(4, 6)))) return false;
  return String((weighted(n, [2, 4, 8, 5, 10, 9, 7, 3, 6]) % 11) % 10) === n[9];
}

// Denmark: CPR (no check digit since 2007; only the date can be validated).
export function dkCpr(value: string, today = new Date()): boolean {
  const n = clean(value, " -").trim();
  if (!isDigits(n) || n.length !== 10) return false;
  let year = int(n.slice(4, 6));
  const seventh = n[6];
  if ("5678".includes(seventh) && year >= 58) year += 1800;
  else if ("0123".includes(seventh) || ("49".includes(seventh) && year >= 37)) year += 1900;
  else year += 2000;
  const month = int(n.slice(2, 4));
  const day = int(n.slice(0, 2));
  return isDate(year, month, day) && !isFuture(year, month, day, today);
}

// Germany: steuerliche Identifikationsnummer.
export function deSteuerId(value: string): boolean {
  const n = clean(value, " -./,").trim();
  if (n.length !== 11 || !isDigits(n) || n[0] === "0") return false;
  const counts = new Map<string, number>();
  for (const ch of n.slice(0, 10)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const repeated = [...counts.values()].filter((c) => c > 1);
  if (repeated.length !== 1 || (repeated[0] !== 2 && repeated[0] !== 3)) return false;
  return mod11_10Valid(n);
}

// Netherlands: BSN (elfproef).
export function nlBsn(value: string): boolean {
  const n = clean(value, " -.").trim().padStart(9, "0");
  if (!isDigits(n) || int(n) <= 0 || n.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (9 - i) * (n.charCodeAt(i) - 48);
  return mod(sum - int(n[8]), 11) === 0;
}

// Austria: Sozialversicherungsnummer (check digit is the 4th digit).
export function atSvnr(value: string): boolean {
  const n = clean(value, " ");
  if (!isDigits(n) || n.startsWith("0") || n.length !== 10) return false;
  return String(weighted(n, [3, 7, 9, 0, 5, 8, 4, 2, 1, 6]) % 11) === n[3];
}

// Croatia: OIB.
export function hrOib(value: string): boolean {
  let n = clean(value, " -").toUpperCase().trim();
  if (n.startsWith("HR")) n = n.slice(2);
  return isDigits(n) && n.length === 11 && mod11_10Valid(n);
}

// Portugal: NIF.
export function ptNif(value: string): boolean {
  let n = clean(value, " -.").toUpperCase().trim();
  if (n.startsWith("PT")) n = n.slice(2);
  if (!isDigits(n) || n[0] === "0" || n.length !== 9) return false;
  let s = 0;
  for (let i = 0; i < 8; i++) s += (9 - i) * (n.charCodeAt(i) - 48);
  return String(mod(11 - s, 11) % 10) === n[8];
}
