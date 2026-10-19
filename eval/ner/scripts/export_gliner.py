"""Export a GLiNER checkpoint to ONNX + dynamic int8 with the gliner package.

Needed because the onnx-community/gliner_multi_pii-v1 export produces
garbage with the current gliner Python runtime (all spans ~0.15-0.19 score,
verified with the original tokenizer), while the torch checkpoint works.

Usage: python -I scripts/export_gliner.py urchade/gliner_multi_pii-v1
Output: eval/cache/exports/<repo with / -> __>/{model.onnx, model_quantized.onnx, gliner_config.json, tokenizer files}
"""

import sys
from pathlib import Path

import torch

torch.set_num_threads(6)
from gliner import GLiNER  # noqa: E402

repo = sys.argv[1]
out = Path(__file__).resolve().parents[2] / "cache" / "exports" / repo.replace("/", "__")
m = GLiNER.from_pretrained(repo)
res = m.export_to_onnx(out, quantize=True)
print(res)
