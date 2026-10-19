// EU VAT numbers, IBANs and payment cards.

import { bgEgn, czRodneCislo, esDni, esNie, hrOib, lvPvn, nlBsn, ptNif, roCnp } from "./national";
import {
  clean,
  int,
  isDigits,
  luhnChecksum,
  luhnValid,
  mod,
  mod11_10Valid,
  mod97_10,
  modDecimal,
  weighted,
} from "./util";

type Validator = (number: string) => boolean;

/** Upper-case, drop separators and an optional country prefix. */
function prep(value: string, remove: string, ...prefixes: string[]): string {
  let n = clean(value, remove).toUpperCase().trim();
  for (const p of prefixes) {
    if (n.startsWith(p)) {
      n = n.slice(2);
      break;
    }
  }
  return n;
}

const at: Validator = (v) => {
  const n = prep(v, " -./", "AT");
  if (n.slice(0, 1) !== "U" || !isDigits(n.slice(1)) || n.length !== 9) return false;
  return String(mod(6 - luhnChecksum(n.slice(1, 8)), 10)) === n[8];
};

const be: Validator = (v) => {
  let n = prep(v, " -./", "BE");
  if (n.startsWith("(0)")) n = "0" + n.slice(3);
  if (n.length === 9) n = "0" + n;
  if (!isDigits(n) || int(n) <= 0 || n.length !== 10 || !"01".includes(n[0])) return false;
  return (int(n.slice(0, -2)) + int(n.slice(-2))) % 97 === 0;
};

const bgPnf = (n: string): boolean => String(weighted(n, [21, 19, 17, 13, 11, 9, 7, 3, 1]) % 10) === n[9];

const bg: Validator = (v) => {
  const n = prep(v, " -.", "BG");
  if (!isDigits(n)) return false;
  if (n.length === 9) {
    let check = 0;
    for (let i = 0; i < 8; i++) check += (i + 1) * (n.charCodeAt(i) - 48);
    check %= 11;
    if (check === 10) {
      check = 0;
      for (let i = 0; i < 8; i++) check += (i + 3) * (n.charCodeAt(i) - 48);
      check %= 11;
    }
    return String(check % 10) === n[8];
  }
  if (n.length === 10) {
    const other = String(mod(11 - weighted(n, [4, 3, 2, 7, 6, 5, 4, 3, 2]), 11)) === n[9];
    return bgEgn(n) || bgPnf(n) || other;
  }
  return false;
};

const CY_ODD: Record<string, number> = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21 };
const cy: Validator = (v) => {
  const n = prep(v, " -", "CY");
  if (!isDigits(n.slice(0, -1)) || n.length !== 9 || n.startsWith("12")) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += i % 2 === 0 ? CY_ODD[n[i]] : int(n[i]);
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[sum % 26] === n[8];
};

const cz: Validator = (v) => {
  const n = prep(v, " /", "CZ");
  if (!isDigits(n)) return false;
  if (n.length === 8) {
    if (n.startsWith("9")) return false;
    let s = 0;
    for (let i = 0; i < 7; i++) s += (8 - i) * (n.charCodeAt(i) - 48);
    const check = mod(11 - s, 11);
    return String((check || 1) % 10) === n[7];
  }
  if (n.length === 9 && n.startsWith("6")) {
    let s = 0;
    const body = n.slice(1, 8);
    for (let i = 0; i < body.length; i++) s += (8 - i) * (body.charCodeAt(i) - 48);
    const check = s % 11;
    return String(mod(8 - mod(10 - check, 11), 10)) === n[8];
  }
  if (n.length === 9 || n.length === 10) return czRodneCislo(n);
  return false;
};

const de: Validator = (v) => {
  const n = prep(v, " -./,", "DE");
  return isDigits(n) && n[0] !== "0" && n.length === 9 && mod11_10Valid(n);
};

const dk: Validator = (v) => {
  const n = prep(v, " -.,/:", "DK");
  if (!isDigits(n) || n[0] === "0" || n.length !== 8) return false;
  return weighted(n, [2, 7, 6, 5, 4, 3, 2, 1]) % 11 === 0;
};

const ee: Validator = (v) => {
  const n = prep(v, " ", "EE");
  return isDigits(n) && n.length === 9 && weighted(n, [3, 7, 1, 3, 7, 1, 3, 7, 1]) % 10 === 0;
};

const gr: Validator = (v) => {
  let n = prep(v, " -./:", "EL", "GR");
  if (n.length === 8) n = "0" + n;
  if (!isDigits(n) || n.length !== 9) return false;
  let checksum = 0;
  for (let i = 0; i < 8; i++) checksum = checksum * 2 + (n.charCodeAt(i) - 48);
  return String(((checksum * 2) % 11) % 10) === n[8];
};

function esCif(n: string): boolean {
  if (!isDigits(n.slice(1, -1)) || n.length !== 9) return false;
  if (!"ABCDEFGHJNPQRSUVW".includes(n[0])) return false;
  const body = n.slice(1, 8);
  const check = String(mod(-luhnChecksum(body + "0"), 10));
  return (check + "JABCDEFGHI"[int(check)]).includes(n[8]);
}

const es: Validator = (v) => {
  const n = prep(v, " -", "ES");
  if (!isDigits(n.slice(1, -1)) || n.length !== 9) return false;
  if ("KLM".includes(n[0])) return "TRWAGMYFPDXBNJZSQVHLCKE"[int(n.slice(1, 8)) % 23] === n[8];
  if (isDigits(n[0])) return esDni(n);
  if ("XYZ".includes(n[0])) return esNie(n);
  return esCif(n);
};

const fi: Validator = (v) => {
  const n = prep(v, " -", "FI");
  return isDigits(n) && n.length === 8 && weighted(n, [7, 9, 10, 5, 8, 4, 2, 1]) % 11 === 0;
};

const FR_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const fr: Validator = (v) => {
  const n = prep(v, " -.", "FR");
  if (![...n.slice(0, 2)].every((c) => FR_ALPHABET.includes(c))) return false;
  if (!isDigits(n.slice(2)) || n.length !== 11) return false;
  if (n.slice(2, 5) !== "000" && !luhnValid(n.slice(2))) return false;
  if (isDigits(n)) return int(n.slice(0, 2)) === modDecimal(n.slice(2) + "12", 97);
  const check = isDigits(n[0])
    ? FR_ALPHABET.indexOf(n[0]) * 24 + FR_ALPHABET.indexOf(n[1]) - 10
    : FR_ALPHABET.indexOf(n[0]) * 34 + FR_ALPHABET.indexOf(n[1]) - 100;
  return (int(n.slice(2)) + 1 + Math.floor(check / 11)) % 11 === mod(check, 11);
};

const hu: Validator = (v) => {
  const n = prep(v, " -", "HU");
  return isDigits(n) && n.length === 8 && weighted(n, [9, 7, 3, 1, 9, 7, 3, 1]) % 10 === 0;
};

const ie: Validator = (v) => {
  const n = prep(v, " -", "IE");
  const alphabet = "WABCDEFGHIJKLMNOPQRSTUV";
  if (!isDigits(n.slice(0, 1)) || !isDigits(n.slice(2, 7))) return false;
  if (![...n.slice(7)].every((c) => alphabet.includes(c))) return false;
  if (n.length !== 8 && n.length !== 9) return false;
  const calc = (s: string): string => {
    const x = s.padStart(7, "0");
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += (8 - i) * (x.charCodeAt(i) - 48);
    return alphabet[(sum + 9 * alphabet.indexOf(x.slice(7))) % 23];
  };
  if (isDigits(n.slice(0, 7))) return n[7] === calc(n.slice(0, 7) + n.slice(8));
  if ("ABCDEFGHIJKLMNOPQRSTUVWXYZ+*".includes(n[1])) return n[7] === calc(n.slice(2, 7) + n[0]);
  return false;
};

const it: Validator = (v) => {
  const n = prep(v, " -:", "IT");
  if (!isDigits(n) || int(n.slice(0, 7)) === 0 || n.length !== 11) return false;
  const office = n.slice(7, 10);
  if (!((office >= "001" && office <= "100") || ["120", "121", "888", "999"].includes(office))) {
    return false;
  }
  return luhnValid(n);
};

const lt: Validator = (v) => {
  const n = prep(v, " -", "LT");
  if (!isDigits(n)) return false;
  if (n.length === 9) {
    if (n[7] !== "1") return false;
  } else if (n.length === 12) {
    if (n[10] !== "1") return false;
  } else return false;
  const body = n.slice(0, -1);
  let check = 0;
  for (let i = 0; i < body.length; i++) check += (1 + (i % 9)) * (body.charCodeAt(i) - 48);
  check %= 11;
  if (check === 10) {
    check = 0;
    for (let i = 0; i < body.length; i++) check += (1 + ((i + 2) % 9)) * (body.charCodeAt(i) - 48);
  }
  return String((check % 11) % 10) === n[n.length - 1];
};

const lu: Validator = (v) => {
  const n = prep(v, " :.-", "LU");
  if (!isDigits(n) || n.length !== 8) return false;
  return String(int(n.slice(0, 6)) % 89).padStart(2, "0") === n.slice(-2);
};

const mt: Validator = (v) => {
  const n = prep(v, " -", "MT");
  if (!isDigits(n) || n[0] === "0" || n.length !== 8) return false;
  return weighted(n, [3, 4, 6, 7, 8, 9, 10, 1]) % 37 === 0;
};

const nl: Validator = (v) => {
  let n = prep(v, " -.", "NL");
  n = clean(n.slice(0, -3), " -.").trim().padStart(9, "0") + n.slice(-3);
  if (!isDigits(n.slice(0, 9)) || int(n.slice(0, 9)) <= 0) return false;
  if (!isDigits(n.slice(10)) || int(n.slice(10)) <= 0) return false;
  if (n.length !== 12 || n[9] !== "B") return false;
  return nlBsn(n.slice(0, 9)) || mod97_10("NL" + n) === 1;
};

const pl: Validator = (v) => {
  const n = prep(v, " -", "PL");
  return isDigits(n) && n.length === 10 && mod(weighted(n, [6, 5, 7, 2, 3, 4, 5, 6, 7, -1]), 11) === 0;
};

const ro: Validator = (v) => {
  const n = clean(v, " -").toUpperCase().trim();
  const c = n.startsWith("RO") ? n.slice(2) : n;
  if (c.length === 13) return roCnp(c);
  if (c.length < 2 || c.length > 10) return false;
  if (!isDigits(c) || c[0] === "0") return false;
  const body = c.slice(0, -1).padStart(9, "0");
  const check = 10 * weighted(body, [7, 5, 3, 2, 1, 7, 5, 3, 2]);
  return String((check % 11) % 10) === c[c.length - 1];
};

const se: Validator = (v) => {
  const n = prep(v, " -.", "SE");
  if (!isDigits(n) || n.slice(-2) !== "01") return false;
  const org = n.slice(0, -2);
  return org.length === 10 && luhnValid(org);
};

const si: Validator = (v) => {
  const n = prep(v, " -", "SI");
  if (!isDigits(n) || n.startsWith("0") || n.length !== 8) return false;
  let s = 0;
  for (let i = 0; i < 7; i++) s += (8 - i) * (n.charCodeAt(i) - 48);
  const check = 11 - (s % 11);
  return (check === 10 ? "0" : String(check)) === n[7];
};

const sk: Validator = (v) => {
  const n = prep(v, " -", "SK");
  if (!isDigits(n) || n.length !== 10) return false;
  if (czRodneCislo(n)) return true;
  if (n[0] === "0" || ![2, 3, 4, 7, 8, 9].includes(int(n[2]))) return false;
  return modDecimal(n, 11) === 0;
};

const xi: Validator = (v) => {
  const n = prep(v, " -.", "GB", "XI");
  if (n.length === 5) {
    if (!isDigits(n.slice(2))) return false;
    const x = int(n.slice(2));
    return (n.startsWith("GD") && x < 500) || (n.startsWith("HA") && x >= 500);
  }
  if (n.length === 11 && ["GD8888", "HA8888"].includes(n.slice(0, 6))) {
    if (!isDigits(n.slice(6))) return false;
    const x = int(n.slice(6, 9));
    if (!((n.startsWith("GD") && x < 500) || (n.startsWith("HA") && x >= 500))) return false;
    return x % 97 === int(n.slice(9, 11));
  }
  if (n.length === 9 || n.length === 12) {
    if (!isDigits(n)) return false;
    const c = weighted(n.slice(0, 9), [8, 7, 6, 5, 4, 3, 2, 10, 1]) % 97;
    return int(n.slice(0, 3)) >= 100 ? [0, 42, 55].includes(c) : c === 0;
  }
  return false;
};

const VAT: Record<string, Validator> = {
  AT: at, BE: be, BG: bg, CY: cy, CZ: cz, DE: de, DK: dk, EE: ee, EL: gr, ES: es, FI: fi,
  FR: fr, HR: hrOib, HU: hu, IE: ie, IT: it, LT: lt, LU: lu, LV: lvPvn, MT: mt, NL: nl,
  PL: pl, PT: ptNif, RO: ro, SE: se, SI: si, SK: sk, XI: xi,
}; // prettier-ignore

/** EU VAT identification number with its country prefix ("DE136695976"). */
export function euVat(value: string): boolean {
  const n = clean(value).toUpperCase().trim();
  const validator = VAT[n.slice(0, 2)];
  return validator !== undefined && validator(n);
}

// IBAN: BBAN layouts from the SWIFT IBAN registry ("n" digits, "a" upper-case
// letters, "c" alphanumerics).
const BBAN: Record<string, string> = {
  AD: "4n4n12c", AE: "3n16n", AL: "8n16c", AT: "5n11n", AZ: "4a20c", BA: "3n3n8n2n",
  BE: "3n7n2n", BG: "4a4n2n8c", BH: "4a14c", BI: "5n5n11n2n", BR: "8n5n10n1a1c", BY: "4c4n16c",
  CH: "5n12c", CR: "4n14n", CY: "3n5n16c", CZ: "4n16n", DE: "8n10n", DJ: "5n5n11n2n",
  DK: "4n9n1n", DO: "4c20n", EE: "2n14n", EG: "4n4n17n", ES: "4n4n1n1n10n", FI: "3n11n",
  FK: "2a12n", FO: "4n9n1n", FR: "5n5n11c2n", GB: "4a6n8n", GE: "2a16n", GI: "4a15c",
  GL: "4n9n1n", GR: "3n4n16c", GT: "4c20c", HN: "4a20n", HR: "7n10n", HU: "3n4n1n15n1n",
  IE: "4a6n8n", IL: "3n3n13n", IQ: "4a3n12n", IS: "4n2n6n10n", IT: "1a5n5n12c", JO: "4a4n18c",
  KW: "4a22c", KZ: "3n13c", LB: "4n20c", LC: "4a24c", LI: "5n12c", LT: "5n11n", LU: "3n13c",
  LV: "4a13c", LY: "3n3n15n", MC: "5n5n11c2n", MD: "2c18c", ME: "3n13n2n", MK: "3n10c2n",
  MN: "4n12n", MR: "5n5n11n2n", MT: "4a5n18c", MU: "4a2n2n12n3n3a", NI: "4a20n", NL: "4a10n",
  NO: "4n6n1n", OM: "3n16c", PK: "4a16c", PL: "8n16n", PS: "4a21c", PT: "4n4n11n2n",
  QA: "4a21c", RO: "4a16c", RS: "3n13n2n", RU: "9n5n15c", SA: "2n18c", SC: "4a2n2n16n3a",
  SD: "2n12n", SE: "3n16n1n", SI: "5n8n2n", SK: "4n6n10n", SM: "1a5n5n12c", SO: "4n3n12n",
  ST: "4n4n11n2n", SV: "4a20n", TL: "3n14n2n", TN: "2n3n13n2n", TR: "5n1n16c", UA: "6n19c",
  VA: "3n15n", VG: "4a16n", XK: "4n10n2n", YE: "4a4n18c",
}; // prettier-ignore

const CLASS = { n: "[0-9]", a: "[A-Z]", c: "[A-Za-z0-9]" } as const;
const BBAN_RE: Record<string, RegExp> = {};
for (const [cc, layout] of Object.entries(BBAN)) {
  const re = layout.replace(/(\d+)([nac])/g, (_, len: string, k: keyof typeof CLASS) => `${CLASS[k]}{${len}}`);
  BBAN_RE[cc] = new RegExp(`^${re}$`);
}

function esCcc(n: string): boolean {
  if (n.length !== 20 || !isDigits(n)) return false;
  const digit = (s: string): string => {
    let c = 0;
    for (let i = 0; i < s.length; i++) c += (s.charCodeAt(i) - 48) * 2 ** i;
    c %= 11;
    return String(c < 2 ? c : 11 - c);
  };
  return n.slice(8, 10) === digit("00" + n.slice(0, 8)) + digit(n.slice(10));
}

function noKontonr(value: string): boolean {
  let n = clean(value, " .-").trim();
  if (n.startsWith("0000")) n = n.slice(4);
  if (!isDigits(n)) return false;
  if (n.length === 7) return luhnValid(n);
  if (n.length === 11) return String(weighted(n, [6, 7, 8, 9, 4, 5, 6, 7, 8, 9]) % 11) === n[10];
  return false;
}

const IBAN_NATIONAL: Record<string, (bban: string) => boolean> = {
  BE: (b) => String(modDecimal(b.slice(0, -2), 97) || 97).padStart(2, "0") === b.slice(-2),
  ES: esCcc,
  ME: (b) => modDecimal(b, 97) === 1,
  NO: noKontonr,
};

export function iban(value: string): boolean {
  const n = clean(value, " -.").trim().toUpperCase();
  if (mod97_10(n.slice(4) + n.slice(0, 4)) !== 1) return false;
  const bban = BBAN_RE[n.slice(0, 2)];
  if (!bban || !bban.test(n.slice(4))) return false;
  const national = IBAN_NATIONAL[n.slice(0, 2)];
  return national ? national(n.slice(4)) : true;
}

// Payment cards: issuer prefix, length and Luhn.
const CARD_LENGTHS: [RegExp, number[]][] = [
  [/^3[47]/, [15]], // American Express
  [/^4/, [13, 16, 19]], // Visa
  [/^(?:5[1-5]|2(?:2[2-9]|[3-6]\d|7[01]|720))/, [16]], // Mastercard
  [/^(?:6011|65|64[4-9])/, [16, 17, 18, 19]], // Discover
  [/^35/, [16, 17, 18, 19]], // JCB
];

export function paymentCard(compact: string): boolean {
  for (const [prefix, lengths] of CARD_LENGTHS) {
    if (prefix.test(compact)) return lengths.includes(compact.length) && luhnValid(compact);
  }
  return false;
}
