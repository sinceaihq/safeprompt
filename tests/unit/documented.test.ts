import { describe, expect, it } from "vitest";
import { scan } from "../../src/engine";

// Example numbers published in official documentation or standard references.
const CASES: [string, string, string][] = [
  ["henkilötunnus 131052-308T", "fi_hetu", "131052-308T"],
  ["hetu 010594Y9032", "fi_hetu", "010594Y9032"],
  ["personnummer 811228-9874", "se_personnummer", "811228-9874"],
  ["Steuer-ID 86 095 742 719", "de_steuer_id", "86 095 742 719"],
  ["BSN 111222333", "nl_bsn", "111222333"],
  ["rijksregisternummer 85.07.30-033.28", "be_national_number", "85.07.30-033.28"],
  ["codice fiscale RSSMRA85T10A562S", "it_codice_fiscale", "RSSMRA85T10A562S"],
  ["PESEL 44051401359", "pl_pesel", "44051401359"],
  ["isikukood 37605030299", "ee_isikukood", "37605030299"],
  ["personas kods 161175-19997", "lv_personas_kods", "161175-19997"],
  ["personas kods 32579461005", "lv_personas_kods", "32579461005"],
  ["ЕГН 7523169263", "bg_egn", "7523169263"],
  ["DNI 12345678Z", "es_dni", "12345678Z"],
  ["NIE X1234567L", "es_nie", "X1234567L"],
  ["numéro de sécurité sociale 2 55 08 14 168 025 38", "fr_nir", "2 55 08 14 168 025 38"],
  ["rodné číslo 710319/2745", "cz_rodne_cislo", "710319/2745"],
  ["asmens kodas 33309240064", "lt_asmens_kodas", "33309240064"],
  ["OIB 69435151530", "hr_oib", "69435151530"],
  ["EMŠO 0101006500006", "si_emso", "0101006500006"],
  ["CNP 1800101221144", "ro_cnp", "1800101221144"],
  ["SVNR 1237 010180", "at_svnr", "1237 010180"],
  ["PPSN 1234567T", "ie_ppsn", "1234567T"],
  ["NIF 501964843", "pt_nif", "501964843"],
  ["cartão de cidadão 00000000 0 ZZ4", "pt_cc", "00000000 0 ZZ4"],
];

describe("documented example identifiers", () => {
  it.each(CASES)("%s", (text, detector, value) => {
    const found = scan(text).filter((f) => f.entity === "NATIONAL_ID");
    expect(found.map((f) => [f.detector, f.text])).toEqual([[detector, value]]);
  });
});
