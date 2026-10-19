### Models

| model | repo / file | ONNX MB | licence | PER thr | LOC thr | 1-thread ms / 128 tok | 4-thread ms | peak RSS MB |
|---|---|---:|---|---:|---:|---:|---:|---:|
| davlan-distilmbert-hrl-int8 | `Xenova/distilbert-base-multilingual-cased-ner-hrl` `onnx/model_quantized.onnx` | 135 | AFL-3.0 (Davlan original; Xenova ONNX port has no licence tag) | 0.5 | 0.5 | 209 | 183 | 305 |
| bardsai-mini-int8 | `bardsai/eu-pii-multi-mini-preview` `onnx/model_quantized.onnx` | 107 | NONE declared on the card (all rights reserved by default) | 0.5 | 0.75 | 74 | 45 | 489 |
| nym-small-edge-int8 | `Wismut/nym-pii-multilingual-small` `edge-int8/model_int8.onnx` | 108 | MIT | 0.4 | 0.45 | – | – | – |
| nym-small-int8 | `Wismut/nym-pii-multilingual-small` `int8/model_int8.onnx` | 139 | MIT | 0.5 | 0.55 | 171 | 177 | 590 |
| gliner-x-small-int8 | `knowledgator/gliner-x-small` `onnx/model_quantized.onnx` | 173 | Apache-2.0 | 0.8 | 0.75 | 332 | 149 | 1053 |
| davlan-mbert-hrl-int8 | `Xenova/bert-base-multilingual-cased-ner-hrl` `onnx/model_quantized.onnx` | 178 | AFL-3.0 (Davlan original) | 0.55 | 0.3 | 381 | 268 | 350 |
| bardsai-v1-int8 | `bardsai/eu-pii-anonimization-multilang` `onnx/model_quantized.onnx` | 279 | Apache-2.0 | 0.3 | 0.3 | 326 | 161 | 656 |
| bardsai-v2-int8 | `bardsai/eu-pii-anonimization-multilang-v2` `onnx/model_quantized.onnx` | 309 | Apache-2.0 | 0.35 | 0.3 | – | – | – |
| davlan-xlmr-hrl-int8 | `tjruesch/xlm-roberta-base-ner-hrl-onnx` `onnx/model_quantized.onnx` | 278 | AFL-3.0 (Davlan original; ONNX port tagged MIT) | 0.3 | 0.3 | 301 | 139 | 654 |

### Headline (test, each model at its own dev-selected thresholds)

Overlap metrics (a gold span counts as found if any character is covered by a same-type prediction). Primary = macro over 11 cased gold real-text sets (en de es nl fi pl sv pt da sk hr).

| model | PER ov-R | PER ov-P | PER ov-F1 | PER exact-F1 | PER any-type cov | LOC ov-F1 | ORG ov-F1 | EuroPII PER R | EuroPII PER P | chat PER R | chat PER P | chat LOC R | neg PER+LOC FP /1k tok |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| davlan-distilmbert-hrl-int8 | 88.4 | 93.1 | 90.6 | 84.2 | 91.5 | 88.1 | 76.8 | 93.1 | 98.2 | 72.7 | 97.3 | 81.0 | 1.1 |
| bardsai-mini-int8 | 87.0 | 85.2 | 86.0 | 78.0 | 93.4 | 81.9 | 67.7 | 95.5 | 99.1 | 93.9 | 84.5 | 89.7 | 3.2 |
| nym-small-edge-int8 | 78.3 | 89.8 | 83.4 | 74.6 | 81.5 | 78.3 | 60.6 | 85.0 | 99.7 | 83.8 | 100.0 | 89.7 | 0.0 |
| nym-small-int8 | 80.8 | 91.2 | 85.6 | 75.3 | 84.2 | 80.1 | 62.5 | 84.4 | 99.6 | 85.9 | 100.0 | 89.7 | 0.0 |
| gliner-x-small-int8 | 77.3 | 84.6 | 80.6 | 75.3 | 79.6 | 78.3 | 64.4 | 89.6 | 97.2 | 79.8 | 98.8 | 89.7 | 1.1 |
| davlan-mbert-hrl-int8 | 90.7 | 94.2 | 92.4 | 86.6 | 92.3 | 90.3 | 80.9 | 92.0 | 99.6 | 75.8 | 93.8 | 84.5 | 0.0 |
| bardsai-v1-int8 | 85.4 | 94.2 | 89.4 | 82.5 | 87.5 | 85.6 | 73.4 | 87.3 | 99.8 | 82.8 | 98.8 | 87.9 | 0.0 |
| bardsai-v2-int8 | 65.0 | 96.6 | 76.7 | 69.9 | 97.3 | 30.9 | 5.1 | 83.3 | 100.0 | 72.7 | 100.0 | 48.3 | 0.0 |
| davlan-xlmr-hrl-int8 | 88.9 | 94.2 | 91.4 | 85.1 | 90.7 | 88.5 | 77.6 | 86.0 | 99.9 | 78.8 | 96.3 | 82.8 | 0.0 |

### PER per language (test, primary gold sets): overlap F1 / overlap recall

| model | uner_en_ewt | germeval14_de | conll2002_es | conll2002_nl | turku_fi | kpwr_pl | uner_sv_pud | uner_pt_bosque | uner_da_ddt | uner_sk_snk | uner_hr_set |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| davlan-distilmbert-hrl-int8 | 87 / 83 | 94 / 93 | 97 / 97 | 98 / 98 | 84 / 78 | 86 / 86 | 91 / 86 | 94 / 92 | 89 / 86 | 86 / 82 | 90 / 90 |
| bardsai-mini-int8 | 85 / 84 | 87 / 89 | 92 / 91 | 90 / 88 | 78 / 82 | 83 / 89 | 87 / 88 | 90 / 90 | 87 / 88 | 82 / 78 | 86 / 91 |
| nym-small-edge-int8 | 81 / 72 | 89 / 86 | 92 / 88 | 88 / 83 | 72 / 64 | 82 / 79 | 83 / 75 | 89 / 83 | 89 / 85 | 74 / 65 | 80 / 81 |
| nym-small-int8 | 83 / 76 | 89 / 86 | 92 / 89 | 91 / 87 | 77 / 69 | 83 / 80 | 87 / 80 | 90 / 83 | 89 / 86 | 76 / 68 | 85 / 86 |
| gliner-x-small-int8 | 80 / 78 | 83 / 79 | 87 / 84 | 88 / 87 | 72 / 64 | 74 / 73 | 82 / 78 | 88 / 84 | 83 / 83 | 70 / 59 | 81 / 80 |
| davlan-mbert-hrl-int8 | 88 / 85 | 95 / 94 | 98 / 97 | 100 / 100 | 85 / 81 | 91 / 92 | 94 / 91 | 95 / 93 | 90 / 88 | 87 / 82 | 93 / 94 |
| bardsai-v1-int8 | 79 / 70 | 90 / 85 | 96 / 95 | 90 / 83 | 86 / 79 | 90 / 86 | 93 / 91 | 94 / 93 | 90 / 88 | 84 / 77 | 92 / 92 |
| bardsai-v2-int8 | 67 / 50 | 80 / 69 | 93 / 88 | 89 / 81 | 65 / 49 | 71 / 57 | 79 / 67 | 81 / 71 | 88 / 80 | 51 / 35 | 81 / 69 |
| davlan-xlmr-hrl-int8 | 88 / 84 | 94 / 92 | 98 / 97 | 97 / 96 | 89 / 83 | 89 / 89 | 90 / 88 | 93 / 92 | 90 / 88 | 85 / 78 | 92 / 92 |

### LOC per language (test, primary gold sets): overlap F1 / overlap recall

| model | uner_en_ewt | germeval14_de | conll2002_es | conll2002_nl | turku_fi | kpwr_pl | uner_sv_pud | uner_pt_bosque | uner_da_ddt | uner_sk_snk | uner_hr_set |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| davlan-distilmbert-hrl-int8 | 81 / 85 | 87 / 83 | 89 / 89 | 97 / 95 | 88 / 89 | 87 / 86 | 92 / 91 | 87 / 92 | 80 / 80 | 88 / 88 | 94 / 94 |
| bardsai-mini-int8 | 78 / 82 | 83 / 81 | 79 / 79 | 85 / 84 | 88 / 97 | 83 / 83 | 88 / 84 | 83 / 84 | 76 / 84 | 75 / 73 | 83 / 86 |
| nym-small-edge-int8 | 77 / 74 | 80 / 72 | 80 / 83 | 86 / 83 | 80 / 79 | 77 / 74 | 70 / 58 | 82 / 81 | 80 / 80 | 72 / 64 | 77 / 69 |
| nym-small-int8 | 79 / 79 | 82 / 74 | 80 / 84 | 89 / 88 | 83 / 83 | 81 / 78 | 74 / 62 | 80 / 82 | 82 / 84 | 73 / 66 | 78 / 72 |
| gliner-x-small-int8 | 70 / 73 | 75 / 67 | 77 / 72 | 86 / 84 | 81 / 79 | 77 / 71 | 86 / 84 | 82 / 86 | 71 / 79 | 75 / 73 | 82 / 78 |
| davlan-mbert-hrl-int8 | 87 / 92 | 90 / 87 | 92 / 92 | 97 / 95 | 91 / 97 | 90 / 92 | 93 / 92 | 89 / 89 | 81 / 84 | 90 / 90 | 95 / 96 |
| bardsai-v1-int8 | 84 / 79 | 88 / 82 | 78 / 72 | 85 / 77 | 93 / 89 | 83 / 78 | 90 / 87 | 88 / 86 | 84 / 84 | 78 / 69 | 90 / 89 |
| bardsai-v2-int8 | 61 / 45 | 39 / 25 | 47 / 31 | 56 / 39 | 14 / 8 | 24 / 14 | 16 / 9 | 30 / 18 | 34 / 23 | 10 / 6 | 8 / 4 |
| davlan-xlmr-hrl-int8 | 85 / 86 | 88 / 86 | 89 / 91 | 93 / 91 | 93 / 90 | 87 / 87 | 92 / 91 | 89 / 93 | 78 / 85 | 86 / 80 | 93 / 91 |

### Other test groups (macro PER overlap F1 / recall at chosen thresholds)

| model | WikiANN 15 langs (silver) | MultiCoNER II 7 langs (lower-cased) | lower-cased probe (5 sets) | same 5 sets cased | WNUT-17 en (social media) |
|---|---:|---:|---:|---:|---:|
| davlan-distilmbert-hrl-int8 | 88.8 / 92.6 | 27.9 / 17.0 | 21.8 / 12.6 | 89.8 / 87.4 | 59.2 / 45.4 |
| bardsai-mini-int8 | 87.9 / 93.4 | 70.2 / 61.6 | 57.6 / 44.7 | 84.9 / 86.9 | 59.6 / 55.2 |
| nym-small-edge-int8 | 88.7 / 91.6 | 43.6 / 28.9 | 43.1 / 28.6 | 83.2 / 78.0 | 60.5 / 50.3 |
| nym-small-int8 | 89.2 / 92.5 | 50.9 / 35.4 | 48.5 / 33.4 | 84.8 / 80.0 | 61.4 / 52.1 |
| gliner-x-small-int8 | 85.4 / 83.4 | 59.5 / 44.1 | 48.1 / 33.3 | 79.1 / 75.7 | 57.0 / 44.8 |
| davlan-mbert-hrl-int8 | 89.7 / 93.6 | 34.8 / 22.2 | 29.9 / 17.7 | 91.5 / 89.9 | 66.7 / 52.8 |
| bardsai-v1-int8 | 88.6 / 85.2 | 63.2 / 48.7 | 52.3 / 38.1 | 88.3 / 83.1 | 65.5 / 58.9 |
| bardsai-v2-int8 | 84.6 / 76.1 | 48.1 / 32.2 | 29.2 / 19.1 | 75.1 / 62.6 | 46.3 / 30.7 |
| davlan-xlmr-hrl-int8 | 86.0 / 86.3 | 43.4 / 28.9 | 33.9 / 21.6 | 91.6 / 88.9 | 68.9 / 57.7 |

### False positives (test, chosen thresholds)

Negatives = 28 code/log snippets + 40 business-chat messages (10 languages) written for this study, containing no person or place. EuroPII: 'spurious' = PER predictions overlapping neither a gold PERSON nor another gold PII span.

Code (stdlib) = 300 six-line chunks of CPython standard-library code with comments/docstrings removed (6.7k tokens). Real text = PER predictions on the primary gold sets that overlap no gold entity at all (includes annotation gaps).

| model | neg: PER /1k tok | neg: LOC /1k tok | neg: ORG /1k tok | neg: msgs with any PER/LOC | code: PER /1k | code: LOC /1k | real text: spurious PER /1k | real text: spurious LOC /1k | EuroPII spurious PER /1k tok | EuroPII PER on other PII /1k | EuroPII no-person msgs: PER /1k | EuroPII LOC preds /1k (unannotated) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| davlan-distilmbert-hrl-int8 | 1.1 | 0.0 | 1.1 | 1 | 0.00 | 0.00 | 0.80 | 0.74 | 0.87 | 0.00 | 0.00 | 0.84 |
| bardsai-mini-int8 | 0.0 | 3.2 | 0.0 | 2 | 1.79 | 0.00 | 2.09 | 2.09 | 0.46 | 0.00 | 0.00 | 4.99 |
| nym-small-edge-int8 | 0.0 | 0.0 | 1.1 | 0 | 0.00 | 0.00 | 1.20 | 1.39 | 0.09 | 0.03 | 0.00 | 4.90 |
| nym-small-int8 | 0.0 | 0.0 | 0.0 | 0 | 0.15 | 0.00 | 1.08 | 1.40 | 0.17 | 0.00 | 0.00 | 6.18 |
| gliner-x-small-int8 | 0.0 | 1.1 | 15.0 | 1 | 0.00 | 0.00 | 1.20 | 1.44 | 0.03 | 1.28 | 8.91 | 5.48 |
| davlan-mbert-hrl-int8 | 0.0 | 0.0 | 0.0 | 0 | 0.00 | 0.00 | 0.70 | 0.68 | 0.20 | 0.00 | 0.00 | 0.03 |
| bardsai-v1-int8 | 0.0 | 0.0 | 0.0 | 0 | 0.00 | 0.00 | 0.50 | 0.77 | 0.06 | 0.03 | 0.00 | 0.41 |
| bardsai-v2-int8 | 0.0 | 0.0 | 0.0 | 0 | 0.00 | 0.00 | 0.17 | 0.12 | 0.00 | 0.00 | 0.00 | 7.40 |
| davlan-xlmr-hrl-int8 | 0.0 | 0.0 | 0.0 | 0 | 0.00 | 0.00 | 0.65 | 0.61 | 0.03 | 0.00 | 0.00 | 0.38 |

### Threshold sweep: davlan-distilmbert-hrl-int8 (PER, macro over primary gold sets; EuroPII; negatives)

| thr | dev macro ov-F1 (sel. objective) | test ov-R | test ov-P | test ov-F1 | test exact-F1 | EuroPII R | EuroPII P | chat R | chat P | neg PER /1k tok | EuroPII spurious /1k |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.3 | 90.6 | 88.6 | 93.0 | 90.7 | 84.3 | 93.2 | 98.2 | 72.7 | 94.7 | 1.1 | 0.90 |
| 0.35 | 90.6 | 88.6 | 93.0 | 90.7 | 84.3 | 93.2 | 98.2 | 72.7 | 94.7 | 1.1 | 0.90 |
| 0.4 | 90.6 | 88.6 | 93.1 | 90.7 | 84.3 | 93.2 | 98.2 | 72.7 | 96.0 | 1.1 | 0.90 |
| 0.45 | 90.6 | 88.4 | 93.1 | 90.6 | 84.2 | 93.2 | 98.2 | 72.7 | 96.0 | 1.1 | 0.87 |
| 0.5 | 90.6 | 88.4 | 93.1 | 90.6 | 84.2 | 93.1 | 98.2 | 72.7 | 97.3 | 1.1 | 0.87 |
| 0.55 | 90.5 | 87.6 | 93.3 | 90.3 | 83.9 | 92.8 | 98.3 | 71.7 | 98.6 | 1.1 | 0.81 |
| 0.6 | 90.4 | 86.9 | 93.4 | 89.9 | 83.7 | 92.6 | 98.4 | 71.7 | 98.6 | 1.1 | 0.78 |
| 0.65 | 90.5 | 86.4 | 93.5 | 89.7 | 83.5 | 92.2 | 98.4 | 70.7 | 98.6 | 1.1 | 0.78 |
| 0.7 | 89.7 | 85.6 | 93.7 | 89.3 | 83.1 | 91.8 | 98.4 | 70.7 | 98.6 | 1.1 | 0.78 |
| 0.75 | 89.5 | 85.2 | 93.8 | 89.2 | 83.0 | 91.5 | 98.4 | 70.7 | 98.6 | 1.1 | 0.78 |
| 0.8 | 88.9 | 84.6 | 94.5 | 89.1 | 82.8 | 91.2 | 98.4 | 70.7 | 98.6 | 1.1 | 0.75 |
| 0.85 | 88.3 | 83.6 | 94.7 | 88.7 | 82.5 | 90.3 | 98.4 | 69.7 | 98.6 | 1.1 | 0.75 |
| 0.9 | 87.3 | 82.3 | 95.3 | 88.1 | 82.0 | 88.8 | 98.4 | 68.7 | 98.6 | 1.1 | 0.73 |
| 0.95 | 86.7 | 80.0 | 95.9 | 87.0 | 80.8 | 87.3 | 98.4 | 66.7 | 98.5 | 0.0 | 0.73 |

### Bootstrap 95% CIs (davlan-distilmbert-hrl-int8, chosen thresholds, 500 resamples of sentences)

| set/type | ov-R CI | ov-F1 CI |
|---|---|---|
| uner_en_ewt/PER | 73.7–90.6 | 80.8–92.5 |
| uner_en_ewt/LOC | 74.0–94.2 | 70.6–88.5 |
| germeval14_de/PER | 89.4–96.7 | 91.5–96.7 |
| germeval14_de/LOC | 75.4–89.2 | 82.0–91.8 |
| conll2002_es/PER | 95.3–99.0 | 95.7–98.4 |
| conll2002_es/LOC | 84.7–92.1 | 86.0–91.5 |
| conll2002_nl/PER | 94.0–100.0 | 95.6–100.0 |
| conll2002_nl/LOC | 88.6–100.0 | 93.0–100.0 |
| turku_fi/PER | 70.1–86.1 | 78.5–89.3 |
| turku_fi/LOC | 82.1–94.9 | 82.5–92.8 |
| kpwr_pl/PER | 78.4–93.7 | 79.6–92.0 |
| kpwr_pl/LOC | 80.3–91.7 | 82.4–92.4 |
| uner_sv_pud/PER | 81.0–90.6 | 87.7–93.7 |
| uner_sv_pud/LOC | 87.5–94.4 | 88.7–94.3 |
| uner_pt_bosque/PER | 88.0–96.1 | 90.9–96.3 |
| uner_pt_bosque/LOC | 86.4–95.9 | 81.6–91.0 |
| uner_da_ddt/PER | 80.7–91.5 | 84.8–92.6 |
| uner_da_ddt/LOC | 71.1–88.2 | 70.7–86.4 |
| uner_sk_snk/PER | 77.4–86.3 | 82.2–88.8 |
| uner_sk_snk/LOC | 81.7–92.5 | 83.6–91.3 |
| uner_hr_set/PER | 84.8–94.7 | 86.1–93.2 |
| uner_hr_set/LOC | 91.3–96.5 | 92.0–96.0 |
| europii/PER | 91.8–94.1 | 94.9–96.2 |
| europii/LOC | 0.0–0.0 | 0.0–0.0 |
| chat_prompts/PER | 63.0–82.8 | 76.1–89.3 |
| chat_prompts/LOC | 70.6–90.0 | 79.3–92.9 |

### Threshold sweep: davlan-mbert-hrl-int8 (PER, macro over primary gold sets; EuroPII; negatives)

| thr | dev macro ov-F1 (sel. objective) | test ov-R | test ov-P | test ov-F1 | test exact-F1 | EuroPII R | EuroPII P | chat R | chat P | neg PER /1k tok | EuroPII spurious /1k |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.3 | 92.4 | 91.7 | 94.0 | 92.8 | 87.0 | 92.2 | 99.5 | 76.8 | 93.8 | 0.0 | 0.26 |
| 0.35 | 92.4 | 91.7 | 94.0 | 92.8 | 87.0 | 92.2 | 99.5 | 76.8 | 93.8 | 0.0 | 0.26 |
| 0.4 | 92.4 | 91.7 | 94.0 | 92.8 | 87.0 | 92.2 | 99.5 | 76.8 | 93.8 | 0.0 | 0.26 |
| 0.45 | 92.4 | 91.6 | 94.1 | 92.8 | 87.0 | 92.2 | 99.5 | 76.8 | 93.8 | 0.0 | 0.26 |
| 0.5 | 92.4 | 91.6 | 94.2 | 92.8 | 87.0 | 92.2 | 99.5 | 76.8 | 93.8 | 0.0 | 0.26 |
| 0.55 | 92.4 | 90.7 | 94.2 | 92.4 | 86.6 | 92.0 | 99.6 | 75.8 | 93.8 | 0.0 | 0.20 |
| 0.6 | 92.2 | 90.6 | 94.3 | 92.4 | 86.6 | 91.8 | 99.7 | 75.8 | 93.8 | 0.0 | 0.15 |
| 0.65 | 92.0 | 89.9 | 94.4 | 92.0 | 86.2 | 91.7 | 99.8 | 75.8 | 93.8 | 0.0 | 0.09 |
| 0.7 | 91.8 | 89.1 | 94.4 | 91.6 | 85.9 | 91.6 | 99.9 | 75.8 | 94.9 | 0.0 | 0.06 |
| 0.75 | 91.5 | 88.3 | 94.6 | 91.3 | 85.7 | 91.0 | 99.9 | 75.8 | 94.9 | 0.0 | 0.06 |
| 0.8 | 91.5 | 87.7 | 94.7 | 91.0 | 85.4 | 90.4 | 99.9 | 74.7 | 94.9 | 0.0 | 0.06 |
| 0.85 | 91.2 | 86.7 | 95.3 | 90.7 | 85.1 | 89.4 | 99.9 | 73.7 | 94.8 | 0.0 | 0.06 |
| 0.9 | 90.6 | 85.6 | 95.7 | 90.2 | 84.6 | 88.6 | 99.9 | 71.7 | 94.7 | 0.0 | 0.03 |
| 0.95 | 89.9 | 83.5 | 95.8 | 89.0 | 83.4 | 86.5 | 100.0 | 71.7 | 95.9 | 0.0 | 0.00 |

### Bootstrap 95% CIs (davlan-mbert-hrl-int8, chosen thresholds, 500 resamples of sentences)

| set/type | ov-R CI | ov-F1 CI |
|---|---|---|
| uner_en_ewt/PER | 77.1–91.7 | 82.4–93.2 |
| uner_en_ewt/LOC | 85.3–98.2 | 79.5–91.4 |
| germeval14_de/PER | 90.3–97.7 | 91.7–97.4 |
| germeval14_de/LOC | 81.8–92.0 | 85.7–92.9 |
| conll2002_es/PER | 95.5–99.2 | 96.4–98.9 |
| conll2002_es/LOC | 88.0–94.5 | 89.3–94.1 |
| conll2002_nl/PER | 100.0–100.0 | 98.6–100.0 |
| conll2002_nl/LOC | 88.6–100.0 | 93.0–100.0 |
| turku_fi/PER | 73.5–87.9 | 79.9–90.2 |
| turku_fi/LOC | 92.5–100.0 | 84.9–94.9 |
| kpwr_pl/PER | 86.6–97.3 | 85.5–95.5 |
| kpwr_pl/LOC | 88.0–96.7 | 85.8–94.4 |
| uner_sv_pud/PER | 86.5–95.2 | 91.1–96.2 |
| uner_sv_pud/LOC | 88.4–95.0 | 90.1–95.4 |
| uner_pt_bosque/PER | 88.8–96.5 | 92.1–97.2 |
| uner_pt_bosque/LOC | 82.9–93.8 | 83.5–92.3 |
| uner_da_ddt/PER | 81.8–92.5 | 85.1–93.0 |
| uner_da_ddt/LOC | 75.8–92.3 | 71.0–88.3 |
| uner_sk_snk/PER | 77.1–86.7 | 84.1–90.5 |
| uner_sk_snk/LOC | 84.5–94.0 | 86.5–93.3 |
| uner_hr_set/PER | 89.8–97.5 | 90.2–95.9 |
| uner_hr_set/LOC | 93.4–98.5 | 93.0–96.8 |
| europii/PER | 90.6–93.3 | 94.9–96.4 |
| europii/LOC | 0.0–0.0 | 0.0–0.0 |
| chat_prompts/PER | 65.0–86.1 | 76.6–90.6 |
| chat_prompts/LOC | 73.7–92.9 | 84.8–96.3 |

### int8 vs fp32 (same thresholds = the int8 model's chosen ones)

| model | variant | primary PER ov-F1 | primary PER ov-R | primary LOC ov-F1 | EuroPII PER R | chat PER R | neg PER /1k |
|---|---|---:|---:|---:|---:|---:|---:|
| davlan-distilmbert-hrl | int8 | 90.6 | 88.4 | 88.1 | 93.1 | 72.7 | 1.1 |
| davlan-distilmbert-hrl | fp32 | 90.8 | 89.2 | 88.4 | 93.5 | 76.8 | 1.1 |
