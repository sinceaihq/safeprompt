import { describe, expect, it } from "vitest";
import { redact, restore, scan } from "../../src/engine";

const values = (text: string, entity?: string): string[] =>
  scan(text)
    .filter((f) => !entity || f.entity === entity)
    .map((f) => f.text);

describe("contact and financial data", () => {
  it.each([
    ["Write to anna.virtanen@example.com today", "EMAIL", "anna.virtanen@example.com"],
    ["Write to anna(at)example.org today", "EMAIL", "anna(at)example.org"],
    ["Call +358 40 123 4567 tomorrow", "PHONE", "+358 40 123 4567"],
    ["Ruf an: 0049 30 12345678", "PHONE", "0049 30 12345678"],
    ["puh. 040 123 4567", "PHONE", "040 123 4567"],
    ["IBAN DE89 3704 0044 0532 0130 00", "IBAN", "DE89 3704 0044 0532 0130 00"],
    ["Karte 4111 1111 1111 1111", "PAYMENT_CARD", "4111 1111 1111 1111"],
    ["USt-IdNr. DE136695976", "VAT_ID", "DE136695976"],
    ["from 192.168.10.25 at noon", "IP_ADDRESS", "192.168.10.25"],
    ["from 2001:db8::1 at noon", "IP_ADDRESS", "2001:db8::1"],
  ])("%s", (text, entity, value) => {
    expect(values(text, entity)).toEqual([value]);
  });
});

describe("business numbers are not personal data", () => {
  it.each([
    "Order 4000123456 shipped on 2026-03-05.",
    "Invoice 2026-0042 totals 3 041,84 € incl. VAT.",
    "Amount due: €1,234.56 by 05/03/2026.",
    "Version 1.2.3.4 is installed.",
    "EAN 4006381333931, postcode 00100.",
    "IBAN DE89 3704 0044 0532 0130 01 (typo).",
    "Card 4111 1111 1111 1112 was declined.",
    "Revenue EUR 12 345 678 (Q2: 11 987 654); shares 98 765 432.",
    "SIRET 732 829 320 00074.",
    "Order 006045764416 was shipped.",
    "BSN-check, ordernummer 98765111222333",
    "Contract 541832256098 signed.",
  ])("%s", (text) => {
    expect(scan(text)).toEqual([]);
  });

  it("does not report a Latvian company number as a personal code", () => {
    expect(scan("personas kods 40003521600", { countries: ["LV"] }).filter((f) => f.entity === "NATIONAL_ID")).toEqual(
      [],
    );
  });

  it("reports a whole identifier, never a piece of a longer number", () => {
    const found = scan("Lithuanian personal code 84402155859", { countries: ["SE"] });
    expect(found.map((f) => f.text)).toEqual(["84402155859"]);
  });
});

describe("country hints and thresholds", () => {
  it("needs a label or a country hint for digit-only identifiers", () => {
    expect(values("Kowalski; 44051401359", "NATIONAL_ID")).toEqual([]);
    expect(scan("Kowalski; 44051401359", { countries: ["PL"] }).map((f) => f.detector)).toEqual(["pl_pesel"]);
  });

  it("lower threshold finds unlabelled weak identifiers", () => {
    expect(values("Jansen; 111222333", "NATIONAL_ID")).toEqual([]);
    // 111222333 is a valid Dutch BSN and also a valid pre-1954 Czech birth number.
    expect(scan("Jansen; 111222333", { threshold: 0.25 }).map((f) => f.entity)).toEqual(["NATIONAL_ID"]);
  });
});

describe("secrets", () => {
  it.each([
    ["key AKIAIOSFODNN7EXAMPLE in the config", "AKIAIOSFODNN7EXAMPLE"],
    ["token ghp_0123456789abcdefghijABCDEFGHIJ012345 leaked", "ghp_0123456789abcdefghijABCDEFGHIJ012345"],
    ["export HF_TOKEN=hf_AbCdEfGhIjKlMnOpQrStUvWxYz01234567", "hf_AbCdEfGhIjKlMnOpQrStUvWxYz01234567"],
    // Assembled at runtime so that repository secret scanners do not flag the fixture.
    [`STRIPE=${["sk", "test", "4eC39HqLyjWDarjtT1zdp7dc"].join("_")}`, ["sk", "test", "4eC39HqLyjWDarjtT1zdp7dc"].join("_")],
    [`SLACK=${["xoxb", "1234567890", "FAKEFAKEFAKEfake"].join("-")}`, ["xoxb", "1234567890", "FAKEFAKEFAKEfake"].join("-")],
    ["DATABASE_URL=postgres://app:s3cr3t-Pa55@db.internal:5432/app", "s3cr3t-Pa55"],
    ['password = "Summer2024!"', "Summer2024!"],
    ["salasana: Kissa123", "Kissa123"],
    ["Authorization: Bearer abcDEF0123456789xyz.token", "abcDEF0123456789xyz.token"],
  ])("%s", (text, secret) => {
    expect(values(text, "SECRET")).toEqual([secret]);
  });

  it("finds a whole private key block", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----";
    expect(values(`key:\n${pem}\nthanks`, "SECRET")).toEqual([pem]);
  });

  it.each([
    "Reset your password: click the link in the e-mail.",
    "password: string; token: string;",
    "api_key = os.environ['API_KEY']",
    "password=${DB_PASSWORD}",
    "token: <YOUR_TOKEN>",
    "password: ********",
    "The sk-learn library and the task-list feature.",
  ])("ignores %s", (text) => {
    expect(values(text, "SECRET")).toEqual([]);
  });
});

describe("redaction", () => {
  const text = "Mail anna@example.com or anna@example.com, IBAN FI21 1234 5600 0007 85, ben@example.org.";

  it("numbers distinct values and restores them", () => {
    const r = redact(text, scan(text));
    expect(r.text).toBe("Mail <EMAIL_1> or <EMAIL_1>, IBAN <IBAN_1>, <EMAIL_2>.");
    expect(restore("Dear <EMAIL_2>, see <IBAN_1>.", r.mapping)).toBe(
      "Dear ben@example.org, see FI21 1234 5600 0007 85.",
    );
  });

  it("supports plain placeholders and masks", () => {
    expect(redact(text, scan(text), "placeholder").text).toBe("Mail <EMAIL> or <EMAIL>, IBAN <IBAN>, <EMAIL>.");
    expect(redact("x anna@example.com", scan("x anna@example.com"), "mask").text).toBe("x " + "*".repeat(16));
  });

  it("handles empty and emoji text with UTF-16 offsets", () => {
    expect(scan("")).toEqual([]);
    const t = "🚀🚀 anna@example.com";
    const [f] = scan(t);
    expect(t.slice(f.start, f.end)).toBe("anna@example.com");
  });
});

describe("labels and tables", () => {
  const ids = (text: string) => scan(text).map((f) => [f.entity, f.text]);

  it("uses the nearest label, not one from the line above", () => {
    expect(ids("Telefon: +49 1512 3452082\nSteuer-ID: 86 095 742 719")).toEqual([
      ["PHONE", "+49 1512 3452082"],
      ["NATIONAL_ID", "86 095 742 719"],
    ]);
  });

  it("an identifier label directly before a number is not a phone label", () => {
    expect(scan("SVNR: 5698 180401")).toEqual([]); // invalid SVNR, also a valid-looking phone
  });

  it("does not let a label in another sentence or language count against a value", () => {
    // Polish "nie" (not) is also the Spanish NIE label.
    expect(ids("Paczka nie dotarła. Proszę o kontakt pod numerem 512 442 354.")).toEqual([["PHONE", "512 442 354"]]);
  });

  it("reads JSON keys as labels", () => {
    const json = '{\n  "phone": "+45 34 41 12 81",\n  "cpr": "031201-0815"\n}';
    expect(ids(json)).toEqual([
      ["PHONE", "+45 34 41 12 81"],
      ["NATIONAL_ID", "031201-0815"],
    ]);
  });

  it("reads CSV and TSV column headers as labels", () => {
    const csv = "no;name;email;phone;bsn\n1001;Jan Jansen;jan@example.com;06 12342273;111222333\n";
    expect(ids(csv)).toEqual([
      ["EMAIL", "jan@example.com"],
      ["PHONE", "06 12342273"],
      ["NATIONAL_ID", "111222333"],
    ]);
    const tsv = "name\tpesel\nJan Kowalski\t44051401359\n";
    expect(ids(tsv)).toEqual([["NATIONAL_ID", "44051401359"]]);
  });

  it("finds phone numbers between commas in CSV rows", () => {
    expect(ids("name,email,phone,cpr\nJens,jens@example.com,0045 34 41 77 11,200302-1660\n")).toContainEqual([
      "PHONE",
      "0045 34 41 77 11",
    ]);
  });

  it("reads SQL INSERT column names as labels", () => {
    const sql =
      "INSERT INTO customers (id, name, rodne_cislo, steuer_id) VALUES\n  (1, 'Jan', '710319/2745', '86095742719');";
    expect(ids(sql)).toEqual([
      ["NATIONAL_ID", "710319/2745"],
      ["NATIONAL_ID", "86095742719"],
    ]);
  });

  it("does not read pieces of UUIDs or invoice numbers as phones", () => {
    expect(scan("GET /api/orders 200 req=10094937-33be-4606-af34-c91f2300a1b2")).toEqual([]);
    expect(scan("invoice 2026-8129 (68 739,52 €) is overdue")).toEqual([]);
  });

  it("knows newer formats", () => {
    expect(ids("PPSN: 1234560IH")).toEqual([["NATIONAL_ID", "1234560IH"]]); // 2013 format, second letter H
    expect(ids("VAT: RO102558")).toEqual([["VAT_ID", "RO102558"]]); // short Romanian CUI
  });
});

describe("business numbers and hex tokens", () => {
  it("does not read parts of UUIDs or hashes as identifiers", () => {
    expect(scan("curl -X POST https://api.example.com/v1/items/8647635a-7c31-4390-a97b-932210ab44c1")).toEqual([]);
  });

  it("a business-number label before a value outweighs a chance checksum match", () => {
    expect(scan("Shipped with EAN 4360020287854 today.")).toEqual([]); // also passes Luhn as a 13-digit Visa
    expect(scan("Card 4111 1111 1111 1111")).toHaveLength(1);
  });

  it("finds undivided 00-prefixed numbers in a phone column", () => {
    const tsv = "name\temail\tphone\nMax\tmax@example.com\t004915123452704\n";
    expect(scan(tsv).map((f) => f.text)).toContain("004915123452704");
  });
});
