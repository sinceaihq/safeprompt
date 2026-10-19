#!/usr/bin/env bash
# Run every model sequentially (one heavy job at a time, niced, 6 threads).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
PY=${PY:-.venv-ner/bin/python}
export HF_HOME="$HERE/../../cache/hf" HF_HUB_DISABLE_PROGRESS_BARS=1 OMP_NUM_THREADS=6 TOKENIZERS_PARALLELISM=false
MODELS=${MODELS:-"davlan-distilmbert-hrl-int8 bardsai-mini-int8 nym-small-int8 nym-small-edge-int8 gliner-x-small-int8 davlan-mbert-hrl-int8 bardsai-v1-int8 bardsai-v2-int8 davlan-xlmr-hrl-int8 gliner-multi-pii-fp32"}
for m in $MODELS; do
  echo "=== $m $(date -Is)"
  nice -n 15 "$PY" -I "$HERE/run_eval.py" "$m" --threads 6 2>&1 | grep -v -i "warn\|truncat\|regex pattern"
done
echo "=== done $(date -Is)"
