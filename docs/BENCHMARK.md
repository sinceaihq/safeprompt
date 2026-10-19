# SafePrompt-Bench

A benchmark of the text people paste into AI chats, with annotated personal data and secrets. Dataset:
[`sinceaihq/safeprompt-bench`](https://huggingface.co/datasets/sinceaihq/safeprompt-bench) (the data is not stored in
this repository: GitHub blocks even fake credentials in real token formats; the generator recreates it exactly) · generator:
[`eval/bench/generate.py`](../eval/bench/generate.py) · scorer: [`eval/bench/metrics.ts`](../eval/bench/metrics.ts).

## Why another benchmark

The [EuroPII benchmark](https://huggingface.co/datasets/sinceaihq/europii-bench) contains short messages with one
labelled value per sentence. Prompts look different: people paste `.env` files, log excerpts, JSON records, CSV
exports, `curl` commands, code, SQL inserts, stack traces and e-mails. Values appear in table columns and under
JSON keys rather than after a label word, next to many numbers that are not personal data (UUIDs, hashes,
timestamps, order numbers, barcodes). On such text, the version of the engine ported directly from EuroPII Guard
found only 42 % of national identifiers (development split), mostly because labels in a line above or a column
header were not understood. SafePrompt-Bench was built to measure and fix exactly that.

## Contents

|                |                                                                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| formats        | `.env` files, logs, JSON, CSV/TSV, `curl` commands, Python/JavaScript code, SQL `INSERT`, stack traces, e-mails (9 languages: en, fi, de, fr, sv, nl, es, it, pl), chat messages with unlabelled values, business text (no personal data), invalid identifiers (no personal data)                            |
| labels         | `EMAIL`, `PHONE`, `IBAN`, `PAYMENT_CARD`, `IP_ADDRESS`, `VAT_ID`, `NATIONAL_ID` (18 schemes), `SECRET` (13 kinds), and `PERSON` (annotated, not scored here)                                                                                                                                                 |
| splits         | dev 300 documents (seed 4242), test 1,500 documents (seed 20261020)                                                                                                                                                                                                                                          |
| hard negatives | UUIDs, SHA-1/SHA-256 hashes, base64, Unix timestamps, versions, order and invoice numbers, EAN codes, tracking codes, amounts, coordinates, IBANs and cards with wrong check digits, identifiers with a wrong check digit next to their label, placeholders (`<YOUR_API_KEY>`, `${DB_PASSWORD}`, `********`) |

Synthetic and safe by construction: identifiers that encode a birth date use real-world forms (for example the
Finnish `-` century sign and 12-digit Swedish numbers) with birth years 1900–1905, checked with python-stdnum, so they
look real without plausibly belonging to a living person; identifiers without a birth date are random
checksum-valid numbers not linked to anyone. E-mail addresses use reserved example domains, IP addresses
documentation or private ranges, payment cards public test numbers, and secrets are random strings in documented
formats with `EXAMPLE` or `FAKE` in them. Phone numbers are libphonenumber example numbers with randomised last digits and IBANs random
checksum-valid account numbers; they may coincide with real numbers but are not linked to any person.

## Method

The engine's label handling was developed on the **dev** split only. The test split was generated with a fresh
seed after the engine was frozen and evaluated once. (An earlier test split, seed 4243, was used for error analysis
during development and then discarded; its results are not reported. Before publication the data was regenerated
once more without Stripe and Slack tokens, because GitHub's push protection blocks repositories containing them even
when they are fake; the engine was not changed, and all numbers below come from that final data.)

Scoring is span-based. A prediction is correct if it overlaps an annotated value of the same type; precision counts
predictions of scored types that overlap no such value; recall counts annotated values found. _Values fully hidden_
counts annotated values whose every character is covered by some prediction (of any type) — what matters when the
value is replaced. _Clean documents flagged_ counts documents without any annotated value that get at least one
prediction. Other systems ran with default settings (`threshold` 0.5 for EuroPII Guard; Presidio
`AnalyzerEngine()` with the English spaCy model, entity names mapped to ours); none was tuned on this data.

## Results (test split)

<!-- tables:start -->
### Personal data (secrets excluded)

| system | precision | recall | F1 | values fully hidden | clean documents flagged | false alarms per 10k characters |
|---|---|---|---|---|---|---|
| **SafePrompt 0.1.0** | 99.7 | 97 | 98.3 | 97.3 | 1 of 299 | 0.25 |
| EuroPII Guard 0.1.2 | 93.7 | 83.9 | 88.6 | 87 | 79 of 299 | 4.46 |
| Presidio + EuroPII Guard | 81.7 | 91.2 | 86.2 | 94.8 | 194 of 299 | 16.26 |
| Presidio (default) | 80.8 | 70.5 | 75.3 | 73.7 | 177 of 299 | 13.37 |

### SafePrompt sensitivity settings (all labels, incl. secrets)

| system | precision | recall | F1 | values fully hidden | clean documents flagged | false alarms per 10k characters |
|---|---|---|---|---|---|---|
| Fewer alerts (0.7) | 100 | 90.4 | 94.9 | 90.4 | 1 of 299 | 0.02 |
| **Balanced (0.5, default)** | 99.7 | 97.5 | 98.6 | 97.7 | 1 of 299 | 0.25 |
| Catch more (0.25) | 94.6 | 99.7 | 97.1 | 99.9 | 184 of 299 | 5.28 |

### SafePrompt per type (default setting)

| type | values | precision | recall | exact span | false alarms | misses |
|---|---|---|---|---|---|---|
| e-mail | 1432 | 100 | 100 | 100 | 0 | 0 |
| phone | 879 | 98.4 | 99.5 | 99.5 | 14 | 4 |
| IBAN | 1064 | 100 | 100 | 100 | 0 | 0 |
| payment card | 67 | 100 | 100 | 100 | 0 | 0 |
| IP address | 189 | 100 | 100 | 100 | 0 | 0 |
| VAT number | 71 | 100 | 98.6 | 98.6 | 0 | 1 |
| national ID | 1064 | 99.9 | 87.2 | 87.2 | 1 | 136 |
| secret | 831 | 100 | 100 | 100 | 0 | 0 |

### SafePrompt per document format (default setting)

| format | values | precision | recall | false alarms | misses |
|---|---|---|---|---|---|
| business | 0 | — | — | 0 | 0 |
| chat | 620 | 97.4 | 83.9 | 14 | 100 |
| code | 106 | 100 | 100 | 0 | 0 |
| csv | 1596 | 100 | 98.6 | 0 | 22 |
| curl | 206 | 100 | 100 | 0 | 0 |
| email | 874 | 100 | 99.9 | 0 | 1 |
| env | 567 | 100 | 100 | 0 | 0 |
| invalid_ids | 0 | — | — | 1 | 0 |
| json | 564 | 100 | 98.4 | 0 | 9 |
| log | 462 | 100 | 100 | 0 | 0 |
| sql | 555 | 100 | 98.4 | 0 | 9 |
| trace | 47 | 100 | 100 | 0 | 0 |

### Secrets (not a meaningful comparison, see below)

| system | precision | recall |
|---|---|---|
| SafePrompt 0.1.0 | 100 | 100 |
| gitleaks 8.30.1 (default rules) | 88.1 | 44.4 |

On the EuroPII benchmark test split (2,075 messages, independent of SafePrompt-Bench): precision 97.2, recall 96.8 (EuroPII Guard 0.1.2: 96.9 / 96.8).

Speed on the test split (one CPU core, shared server): SafePrompt 0.75 ms per document in Node.js; EuroPII Guard 2.1 ms, Presidio 28.14 ms in Python.
<!-- tables:end -->

## Discussion and limitations

- **In-distribution.** Dev and test come from the same generator and templates. SafePrompt was tuned on dev; the
  other systems were not tuned at all. The comparison shows how each system handles these formats, not how they
  would do after equal tuning. Results on real text will be lower.
- **Secrets are circular.** The generator produces exactly the documented token formats that SafePrompt's detectors
  look for, so 100 % recall is expected by construction. gitleaks uses different rules (often requiring a keyword or
  entropy threshold) and deliberately ignores values containing words such as `EXAMPLE` or `FAKE` — which every
  benchmark secret contains, so that no scanner or reader mistakes them for leaked credentials. Its score here is
  therefore not meaningful, and nothing here suggests SafePrompt is better at finding secrets than gitleaks.
- **Unlabelled identifiers.** Most remaining misses are national IDs in running text without a label ("their number
  is …"). By design, digit strings that only pass a checksum are not reported without a label or a country hint,
  because they would also flag order and account numbers.
- **Names are not scored.** SafePrompt 0.1 does not detect names or addresses; `PERSON` spans are included for
  future work.
- **One annotator.** Labels come from the generator, so they are exact, but the choice of what counts as sensitive
  (e.g. private IP addresses) is ours.

## Reproduce

```bash
pip install "europii-guard[presidio] @ git+https://github.com/sinceaihq/europii-guard@v0.1.2"
python -m spacy download en_core_web_lg
python eval/bench/generate.py --out eval/bench/data --seed 4242 --test-seed 20261020 --dev 300 --test 1500
npx tsx eval/bench/evaluate.ts --data eval/bench/data/test.jsonl --out eval/bench/results/safeprompt-t0.5.json
python eval/bench/baselines.py --data eval/bench/data/test.jsonl --out eval/bench/results/pred
python eval/bench/gitleaks_pred.py --gitleaks ./gitleaks --data eval/bench/data/test.jsonl --out eval/bench/results/pred/gitleaks.jsonl
python eval/bench/report.py
```

`scripts/eval-all.sh` runs every step that produces `eval/bench/results/`.
