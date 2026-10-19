#!/usr/bin/env bash
# Regenerate SafePrompt-Bench and every result in eval/bench/results/.
# Needs: Node deps (npm ci), a Python env with europii-guard[presidio] 0.1.2 and
# en_core_web_lg, and a gitleaks binary (GITLEAKS=/path/to/gitleaks).
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PYTHON:-python}
D=eval/bench/data/test.jsonl
R=eval/bench/results
S=EMAIL,PHONE,IBAN,PAYMENT_CARD,IP_ADDRESS,VAT_ID,NATIONAL_ID
$PY eval/bench/generate.py --out eval/bench/data --seed 4242 --test-seed 20261020 --dev 300 --test 1500
mkdir -p $R/pred
$PY eval/bench/baselines.py --data $D --out $R/pred
$PY eval/bench/gitleaks_pred.py --gitleaks "${GITLEAKS:-gitleaks}" --data $D --out $R/pred/gitleaks.jsonl
for t in 0.5 0.25 0.7; do npx tsx eval/bench/evaluate.ts --data $D --threshold $t --out $R/safeprompt-t$t.json >/dev/null; done
for s in europii-guard presidio presidio+europii; do
  npx tsx eval/bench/evaluate.ts --data $D --pred "$R/pred/$s.jsonl" --labels $S --out "$R/$s.json" >/dev/null
done
npx tsx eval/bench/evaluate.ts --data $D --labels $S --out $R/safeprompt-structured.json >/dev/null
npx tsx eval/bench/evaluate.ts --data $D --labels SECRET --out $R/safeprompt-secrets.json >/dev/null
npx tsx eval/bench/evaluate.ts --data $D --labels SECRET --pred $R/pred/gitleaks.jsonl --out $R/gitleaks-secrets.json >/dev/null
npx tsx eval/bench/evaluate.ts --data tests/fixtures/europii-bench-test.jsonl.gz --out $R/safeprompt-on-europii-bench.json >/dev/null
$PY eval/bench/report.py
