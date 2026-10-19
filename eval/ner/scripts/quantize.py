"""Dynamic int8 quantisation variants of an ONNX file (onnxruntime.quantization).

Usage: python -I scripts/quantize.py IN.onnx OUT.onnx [--per-channel] [--matmul-only] [--uint8]

Used for the self-exported GLiNER mDeBERTa model: the gliner default
(QUInt8, all ops) degrades it badly; QInt8 per-channel MatMul-only is the
variant evaluated.
"""

import argparse

from onnxruntime.quantization import QuantType, quantize_dynamic

ap = argparse.ArgumentParser()
ap.add_argument("inp")
ap.add_argument("out")
ap.add_argument("--per-channel", action="store_true")
ap.add_argument("--matmul-only", action="store_true")
ap.add_argument("--uint8", action="store_true")
a = ap.parse_args()
quantize_dynamic(
    model_input=a.inp,
    model_output=a.out,
    weight_type=QuantType.QUInt8 if a.uint8 else QuantType.QInt8,
    per_channel=a.per_channel,
    op_types_to_quantize=["MatMul"] if a.matmul_only else None,
)
print("wrote", a.out)
