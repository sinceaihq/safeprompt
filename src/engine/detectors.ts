// Detector definitions for European personal data.
//
// Ported from EuroPII Guard 0.1.2. Differences, each covered by tests (the
// first two are also fixed in EuroPII Guard 0.1.3):
//  * international phone numbers written with "00" ("0049 30 ...") are found;
//  * candidate patterns with alternatives are bounded on both sides, so a
//    long number (e.g. an EAN barcode) never yields a shorter ID candidate;
//  * Belgian IBANs are not checked against a bank-code register.

import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js/max";
import { hasContext, MEDIUM, PHONE_GROUPED, PHONE_PLAIN, STRONG, WEAK, type Detector, type Span } from "./core";
import { euVat, iban, paymentCard } from "./validators/financial";
import * as id from "./validators/national";

export const EMAIL = "EMAIL";
export const PHONE = "PHONE";
export const IBAN = "IBAN";
export const PAYMENT_CARD = "PAYMENT_CARD";
export const IP_ADDRESS = "IP_ADDRESS";
export const VAT_ID = "VAT_ID";
export const NATIONAL_ID = "NATIONAL_ID";

// Context words ---------------------------------------------------------------
export const GENERIC_ID_WORDS = [
  "personal id", "national id", "id number", "identity number", "identification number",
  "social security number", "personal number", "personal code", "personal identity code",
  "tax id", "tax identification number", "personal identification number",
  "identification code", "personal identification code", "personal numeric code",
  "national identity number", "national identification number", "citizen number",
]; // prettier-ignore

export const COUNTRY_ID_WORDS: Record<string, string[]> = {
  FI: ["henkilötunnus", "henkilötunnusta", "henkilötunnuksen", "hetu", "personbeteckning"],
  SE: ["personnummer", "personnr", "samordningsnummer", "pnr"],
  NO: ["fødselsnummer", "fodselsnummer", "personnummer", "fnr"],
  DK: ["cpr", "cpr-nr", "cpr-nummer", "personnummer"],
  DE: ["steuer-id", "steuer-identifikationsnummer", "steueridentifikationsnummer",
       "identifikationsnummer", "idnr", "steuerliche identifikationsnummer"],
  FR: ["sécurité sociale", "numéro de sécurité sociale", "nir", "insee", "n° ss"],
  NL: ["bsn", "burgerservicenummer", "sofinummer"],
  BE: ["rijksregisternummer", "numéro national", "registre national", "national number", "insz"],
  ES: ["dni", "nie", "nif", "documento nacional de identidad"],
  IT: ["codice fiscale", "c.f.", "cod. fisc."],
  PL: ["pesel"],
  PT: ["cartão de cidadão", "contribuinte", "número de contribuinte", "nif", "n.º cc"],
  CZ: ["rodné číslo", "r.č.", "rč"],
  SK: ["rodné číslo", "r.č.", "rč"],
  EE: ["isikukood"],
  LT: ["asmens kodas"],
  LV: ["personas kods"],
  AT: ["sozialversicherungsnummer", "svnr", "sv-nummer", "versicherungsnummer"],
  IE: ["pps", "ppsn", "pps number", "personal public service"],
  HR: ["oib"],
  SI: ["emšo", "emso"],
  RO: ["cnp", "cod numeric personal"],
  BG: ["егн", "egn"],
}; // prettier-ignore

export const PHONE_WORDS = [
  "phone", "tel", "telephone", "mobile", "mob", "cell", "call", "puh", "puhelin",
  "matkapuhelin", "gsm", "telefon", "mobil", "mobiltelefon", "handy", "rufnummer",
  "téléphone", "tél", "portable", "telefoon", "mobiel", "telefono", "cellulare", "cell.",
  "teléfono", "móvil", "telefone", "telemóvel", "telefonu", "tlf", "tlf.", "nr tel",
  "soita", "ring", "ringer", "anrufen", "rufen sie", "appelez", "appeler", "bel", "bellen",
  "chiamare", "chiamate", "llame", "llamar", "zadzwoń", "ligue", "ligar", "volejte", "fax",
]; // prettier-ignore
const ACCOUNT_WORDS = [
  "iban", "account", "bank account", "tilinumero", "tili", "konto", "kontonummer",
  "bankkonto", "bankverbindung", "compte", "rib", "rekening", "rekeningnummer", "conto",
  "cuenta", "numer konta", "conta", "nib", "účet", "číslo účtu", "kontonr",
]; // prettier-ignore
const CARD_WORDS = [
  "card", "credit card", "debit card", "visa", "mastercard", "amex", "kortti",
  "luottokortti", "kort", "kreditkort", "betalkort", "karte", "kreditkarte", "carte",
  "carte bancaire", "cb", "kaart", "creditcard", "carta", "carta di credito", "tarjeta",
  "karta", "karty", "cartão", "kartu",
]; // prettier-ignore
const VAT_WORDS = [
  "vat", "vat number", "alv", "moms", "momsreg", "ust", "ust-idnr", "umsatzsteuer",
  "tva", "btw", "iva", "partita iva", "nif-iva", "dph", "dič", "nip", "cvr",
]; // prettier-ignore

// Candidate patterns ------------------------------------------------------------
const W = "\\p{L}\\p{N}_";

/** Pattern bounded by non-word characters (and not part of an e-mail address). */
function bounded(pattern: string, ignoreCase = false): RegExp {
  return new RegExp(`(?<![${W}@])(?:${pattern})(?![${W}@])`, ignoreCase ? "giu" : "gu");
}

const EMAIL_RE = new RegExp(
  `(?<![${W}.+-])[${W}.+-]+\\s?(?:@|\\((?:at|AT)\\)|\\[(?:at|AT)\\])\\s?[${W}-]+(?:\\.[${W}-]+)*\\.[A-Za-z]{2,}(?![${W}-])`,
  "gu",
);
const IPV4_RE = bounded("(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}");
const IPV6_RE = bounded("(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{1,4}){0,6}");
const IBAN_RE = bounded("[A-Z]{2}\\d{2}(?:[ ]?[A-Z0-9]){11,30}");
const CARD_RE = bounded("\\d(?:[ -]?\\d){12,18}");
const VAT_RE = bounded(
  "(?:AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)" +
    "[ ]?[0-9A-Z](?:[ .]?[0-9A-Z]){4,13}", // Romanian VAT numbers can be short
);

export const COUNTRY_CODES_EU = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE",
  "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "NO", "IS", "LI",
] as const; // prettier-ignore

function isIp(value: string): boolean {
  if (value.includes(":")) return isIpv6(value);
  const parts = value.split(".");
  // Python's ipaddress rejects leading zeros ("01.2.3.4").
  return parts.length === 4 && parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

function isIpv6(value: string): boolean {
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const groups = (s: string): string[] => (s === "" ? [] : s.split(":"));
  const all = halves.flatMap(groups);
  if (!all.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
  return halves.length === 2 ? all.length <= 7 : all.length === 8;
}

function* ipFinder(text: string): Iterable<Span> {
  for (const rx of [IPV4_RE, IPV6_RE]) {
    for (const m of text.matchAll(rx)) {
      const value = m[0];
      if (!isIp(value)) continue;
      // "1.2.3.4" as a version number is the usual false positive.
      if (!value.includes(":") && value.split(".").every((o) => o.length === 1)) continue;
      yield [m.index, m.index + value.length];
    }
  }
}

// Dates and year-prefixed references ("2026-0042") that libphonenumber accepts.
const DATE_LIKE_RE = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}$|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$|^(?:19|20)\d{2}[-/]\d{2,6}$/;
// Optional (0)/(CC) prefix, then digit groups joined by single separators.
// A comma may precede a number only when it is not a decimal comma
// ("anna@example.com,040 123 4567" in a CSV row, but not "1,234 567"), and
// may follow it unless a decimal part follows ("…4567,1234" but not "…,50").
// A letter right after the digits means a code or hex string, not a number.
const PHONE_CANDIDATE_RE =
  /(?<![\p{L}\p{N}_+./-])(?<!\d,)(?:\+|00)?(?:\(\d{1,4}\) ?)?\d{1,5}(?:[ .\-/]?\(?\d{1,5}\)?){1,6}(?![\p{L}\p{N}_./-]?\d)(?!,\d{1,2}(?!\d))(?![\p{L}_])/gu;
const MONEY_AFTER_RE = /^\s*(?:[.,]\d{2}(?!\d)|€|kr|zł|kč|eur|sek|dkk|pln|czk)/iu;
const MONEY_BEFORE_RE = /(?:€|\$|£|kr\.?|eur|sek|dkk)\s*$/iu;
const IPV4_LIKE_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
// "11 987 654", "1.234.567": a number written with thousands separators.
const THOUSANDS_RE = /^\d{1,2}(?:[ .\u00a0\u202f]\d{3})+$/;
const MAX_NATIONAL_DIGITS = 12;

function validPhone(raw: string, region?: CountryCode): boolean {
  try {
    return isValidPhoneNumber(raw, region);
  } catch {
    return false;
  }
}

function* phoneFinder(text: string, countries: ReadonlySet<string>): Iterable<Span> {
  const regions = (countries.size ? [...countries].sort() : COUNTRY_CODES_EU) as CountryCode[];
  for (const m of text.matchAll(PHONE_CANDIDATE_RE)) {
    let raw = m[0].replace(/[ .\-/(]+$/, "");
    const opens = raw.split("(").length - 1;
    if (raw.split(")").length - 1 > opens) raw = raw.replace(/\)+$/, "");
    // An opening bracket that is never closed starts the next token:
    // "2026-8129 (68 739,52 €)" is an invoice number and an amount.
    const unclosed = raw.lastIndexOf("(");
    if (unclosed > 0 && raw.indexOf(")", unclosed) < 0) raw = raw.slice(0, unclosed).replace(/[ .\-/]+$/, "");
    const start = m.index;
    const end = start + raw.length;
    const compact = raw.replace(/\D/g, "");
    const international = raw.startsWith("+") || raw.startsWith("00");
    if (DATE_LIKE_RE.test(raw) || IPV4_LIKE_RE.test(raw)) continue;
    if (
      MONEY_AFTER_RE.test(text.slice(end, end + 5)) ||
      MONEY_BEFORE_RE.test(text.slice(Math.max(0, start - 5), start))
    ) {
      continue;
    }
    const space = raw.indexOf(" ");
    const body = international && space >= 0 ? raw.slice(space + 1) : raw;
    if (body.includes(".") && body.includes(" ")) continue; // two adjacent tokens, not one number
    if (
      !international &&
      (compact.length < 7 ||
        compact.length > MAX_NATIONAL_DIGITS ||
        (/^\d+$/.test(raw) && compact.length >= 12) ||
        THOUSANDS_RE.test(raw))
    ) {
      continue;
    }
    if (raw.startsWith("00")) {
      // "00" is also how many order and customer numbers begin: require the
      // usual grouping after the country code ("0049 30 ...") or a phone label.
      const grouped = /^00\d{1,3}[ -]\d/.test(raw);
      if ((grouped || hasContext(text, start, PHONE_WORDS)) && validPhone("+" + raw.slice(2))) yield [start, end];
    } else if (international) {
      if (validPhone(raw)) yield [start, end];
    } else if (regions.some((r) => validPhone(raw, r))) {
      yield [start, end];
    }
  }
}

const isInternational = (v: string): boolean => /^\s*(?:\+|00)/.test(v);
/** National number written with phone-style grouping ("040 123 4567"). */
const isGrouped = (v: string): boolean => /\d[ -]\d/.test(v) || v.includes("(");

function* cardFinder(text: string): Iterable<Span> {
  for (const m of text.matchAll(CARD_RE)) {
    // Digits that continue an IBAN ("DE89 3704 0044 ...") are not a card.
    if (/[A-Z]{2}\d{2} ?$/.test(text.slice(Math.max(0, m.index - 5), m.index))) continue;
    yield [m.index, m.index + m[0].length];
  }
}

function nationalId(
  name: string,
  country: string,
  pattern: string,
  validate: (v: string) => boolean,
  strength: number,
  description: string,
  options: { ignoreCase?: boolean; strip?: string } = {},
): Detector {
  return {
    name,
    entity: NATIONAL_ID,
    pattern: bounded(pattern, options.ignoreCase),
    strength,
    validate,
    context: [...GENERIC_ID_WORDS, ...COUNTRY_ID_WORDS[country]],
    country,
    strip: options.strip,
    description,
  };
}

const I = { ignoreCase: true };

export const NATIONAL_DETECTORS: Detector[] = [
  nationalId("fi_hetu", "FI", "\\d{6}[-+A-FU-Y]\\d{3}[0-9A-Y]", id.fiHetu, STRONG,
    "Finnish personal identity code (henkilötunnus)", { ignoreCase: true, strip: "" }),
  nationalId("it_codice_fiscale", "IT",
    "[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]",
    id.itCodiceFiscale, STRONG, "Italian tax code (codice fiscale)", I),
  nationalId("fr_nir", "FR", "[123478] ?\\d{2} ?(?:0[1-9]|1[0-2]|[2-9]\\d) ?(?:\\d{2}|2[AB]) ?\\d{3} ?\\d{3} ?\\d{2}",
    id.frNir, STRONG, "French social security number (NIR)"),
  nationalId("es_nie", "ES", "[XYZ]-?\\d{7}-?[A-Z]", id.esNie, STRONG, "Spanish foreigner identity number (NIE)", I),
  nationalId("es_dni", "ES", "\\d{8}-?[A-Z]", id.esDni, STRONG, "Spanish national identity number (DNI)", I),
  nationalId("ie_ppsn", "IE", "\\d{7}[A-W][ABHWTXZ]?", id.iePps, STRONG, "Irish Personal Public Service Number (PPSN)", I),
  nationalId("pt_cc", "PT", "\\d{8} ?\\d ?[A-Z]{2}\\d", id.ptCc, STRONG,
    "Portuguese citizen card number (cartão de cidadão)", I),
  nationalId("se_personnummer", "SE", "(?:\\d{2})?\\d{6}[-+]\\d{4}", (v) => id.sePersonnummer(v), STRONG,
    "Swedish personal identity number (personnummer), with separator"),
  nationalId("se_personnummer_compact", "SE", "(?:19|20)\\d{10}|\\d{10}", (v) => id.sePersonnummer(v), WEAK,
    "Swedish personal identity number without separator"),
  nationalId("no_fodselsnummer", "NO", "\\d{6} ?\\d{5}", (v) => id.noFodselsnummer(v), MEDIUM,
    "Norwegian national identity number (fødselsnummer)"),
  nationalId("be_national_number", "BE", "\\d{2}\\.?\\d{2}\\.?\\d{2}[- ]?\\d{3}\\.?\\d{2}",
    (v) => id.beNationalNumber(v), MEDIUM, "Belgian national register number"),
  nationalId("pl_pesel", "PL", "\\d{11}", id.plPesel, MEDIUM, "Polish PESEL number"),
  nationalId("ee_isikukood", "EE", "[1-8]\\d{10}", id.eeIsikukood, MEDIUM, "Estonian personal identification code"),
  nationalId("lt_asmens_kodas", "LT", "[1-8]\\d{10}", id.ltAsmensKodas, MEDIUM, "Lithuanian personal code"),
  nationalId("lv_personas_kods", "LV", "\\d{6}-?\\d{5}", id.lvPersonasKods, MEDIUM, "Latvian personal code"),
  nationalId("cz_rodne_cislo", "CZ", "\\d{6}/?\\d{3,4}", id.czRodneCislo, MEDIUM, "Czech birth number (rodné číslo)"),
  nationalId("sk_rodne_cislo", "SK", "\\d{6}/?\\d{3,4}", id.czRodneCislo, MEDIUM, "Slovak birth number (rodné číslo)"),
  nationalId("si_emso", "SI", "\\d{13}", id.siEmso, MEDIUM, "Slovenian personal number (EMŠO)"),
  nationalId("ro_cnp", "RO", "[1-9]\\d{12}", id.roCnp, MEDIUM, "Romanian personal numeric code (CNP)"),
  nationalId("bg_egn", "BG", "\\d{10}", id.bgEgn, MEDIUM, "Bulgarian personal number (EGN)"),
  nationalId("dk_cpr", "DK", "\\d{6}-?\\d{4}", (v) => id.dkCpr(v), WEAK, "Danish CPR number (no checksum since 2007)"),
  nationalId("de_steuer_id", "DE", "\\d{2} ?\\d{3} ?\\d{3} ?\\d{3}", id.deSteuerId, WEAK, "German tax identification number"),
  nationalId("nl_bsn", "NL", "\\d{4}\\.?\\d{2}\\.?\\d{3}|\\d{3}\\.\\d{3}\\.\\d{3}|\\d{9}", id.nlBsn, WEAK,
    "Dutch citizen service number (BSN)"),
  nationalId("at_svnr", "AT", "\\d{4} ?\\d{6}", id.atSvnr, WEAK, "Austrian social insurance number"),
  nationalId("hr_oib", "HR", "\\d{11}", id.hrOib, WEAK, "Croatian personal identification number (OIB)"),
  nationalId("pt_nif", "PT", "[1-35-9]\\d{8}", id.ptNif, WEAK, "Portuguese tax number (NIF)"),
]; // prettier-ignore

export const CONTACT_DETECTORS: Detector[] = [
  { name: "email", entity: EMAIL, pattern: EMAIL_RE, strength: STRONG, description: "E-mail address, also name(at)domain" },
  {
    name: "phone_international", entity: PHONE, strength: STRONG, context: PHONE_WORDS,
    finder: function* (t, c) { for (const s of phoneFinder(t, c)) if (isInternational(t.slice(s[0], s[1]))) yield s; },
    description: "Phone number in international format (+CC or 00CC)",
  },
  {
    name: "phone_national", entity: PHONE, strength: PHONE_GROUPED, context: PHONE_WORDS,
    finder: function* (t, c) {
      for (const s of phoneFinder(t, c)) {
        const v = t.slice(s[0], s[1]);
        if (!isInternational(v) && isGrouped(v)) yield s;
      }
    },
    description: "Phone number in a national format of an EU/EEA country, grouped",
  },
  {
    name: "phone_national_plain", entity: PHONE, strength: PHONE_PLAIN, context: PHONE_WORDS,
    finder: function* (t, c) {
      for (const s of phoneFinder(t, c)) {
        const v = t.slice(s[0], s[1]);
        if (!isInternational(v) && !isGrouped(v)) yield s;
      }
    },
    description: "Undivided digit string that is a valid national phone number",
  },
  { name: "ip_address", entity: IP_ADDRESS, strength: PHONE_GROUPED, finder: ipFinder, description: "IPv4 or IPv6 address" },
]; // prettier-ignore

export const FINANCIAL_DETECTORS: Detector[] = [
  { name: "iban", entity: IBAN, pattern: IBAN_RE, strength: STRONG, validate: iban, context: ACCOUNT_WORDS,
    description: "IBAN with valid check digits" },
  { name: "payment_card", entity: PAYMENT_CARD, strength: STRONG, validate: paymentCard, context: CARD_WORDS,
    strip: " -", finder: cardFinder, description: "Payment card number (issuer prefix, length, Luhn)" },
  { name: "eu_vat", entity: VAT_ID, pattern: VAT_RE, strength: STRONG, validate: euVat, context: VAT_WORDS,
    description: "EU VAT identification number with valid checksum" },
]; // prettier-ignore

export const PII_DETECTORS: Detector[] = [...CONTACT_DETECTORS, ...FINANCIAL_DETECTORS, ...NATIONAL_DETECTORS];
