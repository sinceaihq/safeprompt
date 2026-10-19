# Detection engine

`src/engine/` is a dependency-light TypeScript library (its only dependency is libphonenumber-js) that runs in the
extension, in the web demo and in Node.js.

```ts
import { scan, redact, restore } from "./src/engine";

const findings = scan(text, { threshold: 0.5, countries: ["FI"] });
const { text: safe, mapping } = redact(text, findings); // "<EMAIL_1>", "<IBAN_1>", ...
restore(aiAnswer, mapping);
```

Offsets are UTF-16 indices (JavaScript strings and the DOM).

## Pipeline

1. **Candidates.** Each detector proposes spans with a regular expression bounded by non-word characters, or with a
   finder function (phone numbers, payment cards, IP addresses, secrets).
2. **Validation.** Candidates are stripped of separators and validated: national check digits and encoded birth
   dates (`validators/national.ts`), EU VAT check digits for every member state and IBAN mod-97 plus the BBAN layout
   of the SWIFT registry and national check digits (`validators/financial.ts`), Luhn and issuer/length for cards,
   libphonenumber metadata for phone numbers. Candidates inside UUIDs and hexadecimal hashes are dropped.
3. **Label.** The label of a value is the closest label word before it (the same line, if that line is a field such
   as `"cpr": "…"` or `Name = …`), or — in a CSV/TSV table or an SQL `INSERT` — the column name. Labels are matched
   case-insensitively, without diacritics, with `_` and `-` treated as spaces (`rodne_cislo` matches _rodné číslo_).
4. **Score.** Base confidence by evidence strength (strong: structure random text rarely has; medium: digit-only
   identifier with checksum and date; weak: digit string whose checksum passes often by chance) plus a bonus if the
   label belongs to the detector and if the caller expects that country. If the label directly before the value
   belongs to another kind of data (`SVNR: …` for a phone reading) or to a business number (`EAN`, `order no.`,
   `invoice` …), the score is lowered. Values below the threshold (default 0.5) are dropped.
5. **Overlaps.** The higher score wins, then the longer span.

## Validators and python-stdnum

The validators implement the published algorithms. Their behaviour is kept identical to
[python-stdnum](https://arthurdejong.org/python-stdnum/) (the library behind EuroPII Guard), which serves as a test
oracle only — no code from it is included. `eval/parity/make_fixture.py` generates candidates with realistic layouts
(every century sign and separator, real calendar dates of all centuries, occasional impossible dates) and brute-forces
check characters, giving 16,351 valid and 27,118 near-miss values; the TypeScript validators agree with the oracle on
all 43,469 (`tests/unit/parity-validators.test.ts`). Known divergence: Belgian IBANs are not checked against a register
of bank codes.

## Differences from EuroPII Guard 0.1.2

Changed in SafePrompt (and reported upstream for EuroPII Guard 0.1.3):

| change                                                                                                            | why                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| International numbers written with `00` (`0049 30 …`) are found (when grouped after the country code or labelled) | EuroPII Guard parsed them without a region and never found them                                                                                                                                             |
| Patterns with alternatives are bounded on both sides                                                              | EuroPII Guard bounded only the first/last alternative, so pieces of longer numbers became candidates (a 13-digit EAN yielded a BSN candidate; a Lithuanian code was reported truncated as a Swedish number) |
| Irish PPSNs with second letter `H`                                                                                | missing from the pattern                                                                                                                                                                                    |
| Nearest-label rule, field lines, table headers, SQL columns                                                       | a label on the line above ("Telefon:") turned the next line's tax ID into a phone number; column headers were ignored                                                                                       |
| Penalty for labels of other types or business numbers directly before a value                                     | invalid identifiers after their label were reported as phone numbers; EANs as payment cards                                                                                                                 |
| Phone candidates: commas in CSV rows, unclosed brackets, letters after digits                                     | missed phone numbers between commas; `2026-8129 (68 …` and UUID pieces read as phones                                                                                                                       |
| Short Romanian VAT numbers                                                                                        | the pattern required at least 7 characters                                                                                                                                                                  |
| Secrets detectors                                                                                                 | new                                                                                                                                                                                                         |

The engine is evaluated on both benchmarks; see [BENCHMARK.md](BENCHMARK.md).
