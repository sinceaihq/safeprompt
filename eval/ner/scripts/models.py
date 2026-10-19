"""Model registry + ONNX Runtime inference for the NER study.

Two families:
  * "tc"     token classification (BERT / XLM-R / ModernBERT style) run with a
             plain onnxruntime session + the repo's tokenizer.json. Decoding is
             our own (described in README): per-token softmax, probabilities of
             all raw labels that map to the same coarse type are summed, argmax
             over {O, PER, LOC, ORG, OTHER}, tokens grouped into spans, spans
             expanded to word boundaries, adjacent same-type spans separated
             only by whitespace merged. Span score = mean token probability of
             the span's coarse type. This mirrors what a browser
             implementation on top of transformers.js / onnxruntime-web would
             do with the raw logits.
  * "gliner" span model run through the `gliner` package with its
             onnxruntime backend and the int8 ONNX file from the hub.

Every prediction is (start, end, type, score, raw_label) with type in
PER / LOC / ORG / OTHER (OTHER only counts for type-agnostic coverage).
"""

from __future__ import annotations

import json
import os
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

COARSE = ("PER", "LOC", "ORG", "OTHER")


def _map_hrl(raw):
    return {"PER": "PER", "LOC": "LOC", "ORG": "ORG"}.get(raw, "OTHER")


BARDS_PER = {"PERSON_NAME", "PERSON_ALIAS"}
BARDS_LOC = {"LOCATION", "GEO_LOCATION", "POSTAL_ADDRESS"}


def _map_bards(raw):
    if raw in BARDS_PER:
        return "PER"
    if raw in BARDS_LOC:
        return "LOC"
    if raw == "ORGANIZATION_NAME":
        return "ORG"
    return "OTHER"


NYM_LOC = {"CITY", "COUNTRY", "STATE", "STREET_ADDRESS", "STREET_NAME"}


def _map_nym(raw):
    if raw in ("GIVEN_NAME", "SURNAME"):
        return "PER"
    if raw in NYM_LOC:
        return "LOC"
    if raw == "COMPANY_NAME":
        return "ORG"
    return "OTHER"


@dataclass
class Spec:
    name: str
    kind: str  # tc | gliner
    repo: str
    onnx: str
    tokenizer: str = "tokenizer.json"
    config: str = "config.json"
    mapper: object = None
    licence: str = ""
    notes: str = ""
    gliner_labels: dict = field(default_factory=dict)
    extra_files: tuple = ()


GLINER_LABELS = {"person": "PER", "location": "LOC", "organization": "ORG"}

REGISTRY = {
    s.name: s
    for s in [
        Spec("davlan-distilmbert-hrl-int8", "tc", "Xenova/distilbert-base-multilingual-cased-ner-hrl", "onnx/model_quantized.onnx",
             mapper=_map_hrl, licence="AFL-3.0 (Davlan original; Xenova ONNX port has no licence tag)",
             notes="distilmBERT, trained on CoNLL-02/03, ANERcorp, MSRA, Europeana-fr, Italian I-CAB, Latvian, Portuguese (10 HRL)"),
        Spec("davlan-mbert-hrl-int8", "tc", "Xenova/bert-base-multilingual-cased-ner-hrl", "onnx/model_quantized.onnx",
             mapper=_map_hrl, licence="AFL-3.0 (Davlan original)", notes="mBERT-base, same training data as above"),
        Spec("davlan-xlmr-hrl-int8", "tc", "tjruesch/xlm-roberta-base-ner-hrl-onnx", "onnx/model_quantized.onnx",
             mapper=_map_hrl, licence="AFL-3.0 (Davlan original; ONNX port tagged MIT)", notes="XLM-R base, same data"),
        Spec("bardsai-v1-int8", "tc", "bardsai/eu-pii-anonimization-multilang", "onnx/model_quantized.onnx",
             mapper=_map_bards, licence="Apache-2.0", notes="XLM-R base PII model, 24 EU languages"),
        Spec("bardsai-v2-int8", "tc", "bardsai/eu-pii-anonimization-multilang-v2", "onnx/model_quantized.onnx",
             mapper=_map_bards, licence="Apache-2.0", notes="mmBERT-base PII model, 24 EU languages"),
        Spec("bardsai-mini-int8", "tc", "bardsai/eu-pii-multi-mini-preview", "onnx/model_quantized.onnx",
             tokenizer="onnx/tokenizer.json", config="onnx/config.json", mapper=_map_bards,
             licence="NONE declared on the card (all rights reserved by default)",
             notes="mMiniLMv2 L6 H384 PII model, 'preview, under training'"),
        Spec("nym-small-int8", "tc", "Wismut/nym-pii-multilingual-small", "int8/model_int8.onnx",
             tokenizer="int8/tokenizer.json", config="int8/config.json", mapper=_map_nym, licence="MIT",
             notes="mmBERT-small distilled PII model; int8 embeddings + fp16 weights"),
        Spec("nym-small-edge-int8", "tc", "Wismut/nym-pii-multilingual-small", "edge-int8/model_int8.onnx",
             tokenizer="edge-int8/tokenizer.json", config="edge-int8/config.json", mapper=_map_nym, licence="MIT",
             notes="same, full dynamic int8"),
        Spec("gliner-x-small-int8", "gliner", "knowledgator/gliner-x-small", "onnx/model_quantized.onnx",
             licence="Apache-2.0", notes="GLiNER with mT5-small encoder, 20+ languages", gliner_labels=GLINER_LABELS),
        Spec("gliner-multi-pii-int8", "gliner", "local:urchade/gliner_multi_pii-v1", "model_quantized.onnx",
             licence="Apache-2.0 (urchade/gliner_multi_pii-v1)",
             notes="GLiNER mDeBERTa-v3-base, PII fine-tune; exported + int8-quantised here with gliner.export_to_onnx "
                   "(the onnx-community export returns only ~0.15-0.19 scores with the gliner runtime)",
             gliner_labels=GLINER_LABELS),
        Spec("gliner-multi-v2.1-int8", "gliner", "onnx-community/gliner_multi-v2.1", "onnx/model_quantized.onnx",
             licence="Apache-2.0 (urchade/gliner_multi-v2.1)", notes="GLiNER mDeBERTa-v3-base general NER",
             gliner_labels=GLINER_LABELS),
    ]
}


def fp32_variant(spec: Spec, fp32_file: str) -> Spec:
    import dataclasses
    return dataclasses.replace(spec, name=spec.name.replace("-int8", "-fp32"), onnx=fp32_file)


REGISTRY["bardsai-v1-fp32"] = fp32_variant(REGISTRY["bardsai-v1-int8"], "onnx/model.onnx")
REGISTRY["davlan-distilmbert-hrl-fp32"] = fp32_variant(REGISTRY["davlan-distilmbert-hrl-int8"], "onnx/model.onnx")
REGISTRY["nym-small-fp32"] = fp32_variant(REGISTRY["nym-small-int8"], "model.onnx")
REGISTRY["nym-small-fp32"].tokenizer = "tokenizer.json"
REGISTRY["nym-small-fp32"].config = "config.json"
REGISTRY["bardsai-mini-fp32"] = fp32_variant(REGISTRY["bardsai-mini-int8"], "onnx/model.onnx")
REGISTRY["gliner-x-small-fp32"] = fp32_variant(REGISTRY["gliner-x-small-int8"], "onnx/model.onnx")
REGISTRY["bardsai-v2-fp32"] = fp32_variant(REGISTRY["bardsai-v2-int8"], "onnx/model.onnx")
REGISTRY["bardsai-v2-torch-fp32"] = fp32_variant(REGISTRY["bardsai-v2-int8"], "torch")
REGISTRY["bardsai-v2-torch-fp32"].name = "bardsai-v2-torch-fp32"
REGISTRY["gliner-multi-pii-fp32"] = fp32_variant(REGISTRY["gliner-multi-pii-int8"], "model.onnx")


def fetch(spec: Spec) -> dict:
    """Download only the files we need. Returns local paths + revision + sizes."""
    from huggingface_hub import HfApi, hf_hub_download

    if spec.repo.startswith("local:"):
        repo = spec.repo[len("local:"):]
        d = Path(__file__).resolve().parents[2] / "cache" / "exports" / repo.replace("/", "__")
        files = [spec.onnx, spec.tokenizer] + [f.name for f in d.iterdir() if f.suffix in (".json", ".model")]
        files = list(dict.fromkeys(files))
        rev = HfApi().model_info(repo).sha
        return {"paths": {f: str(d / f) for f in files}, "revision": f"{repo}@{rev} (local export)",
                "onnx_bytes": (d / spec.onnx).stat().st_size, "tokenizer_bytes": (d / spec.tokenizer).stat().st_size,
                "download_bytes": sum((d / f).stat().st_size for f in files), "files": files}
    info = HfApi().model_info(spec.repo, files_metadata=True)
    sizes = {s.rfilename: s.size for s in info.siblings}
    files = [spec.tokenizer] + ([spec.onnx] if spec.onnx != "torch" else [])
    if spec.kind == "tc":
        files.append(spec.config)
    else:
        files += [f for f in sizes if f.endswith((".json", ".model")) and "/" not in f]
    files = list(dict.fromkeys(files + [f for f in spec.extra_files]))
    if spec.onnx + "_data" in sizes:
        files.append(spec.onnx + "_data")
    paths = {f: hf_hub_download(spec.repo, f, revision=info.sha) for f in files}
    return {
        "paths": paths,
        "revision": info.sha,
        "onnx_bytes": sizes.get(spec.onnx) + sizes.get(spec.onnx + "_data", 0) if sizes.get(spec.onnx) else sizes.get("model.safetensors"),
        "tokenizer_bytes": sizes.get(spec.tokenizer),
        "download_bytes": sum(sizes.get(f) or 0 for f in files),
        "files": files,
    }


def _is_word_char(c: str) -> bool:
    return c.isalnum() or unicodedata.category(c) == "Mn"


import re

WORD_RE = re.compile(r"[^\s,;|\"<>()\[\]{}*^]+")
LEAD = "([{<\"'«„“‘"
TRAIL = ")]}>\"'».,;:!?”’"
EDGE_STRIP = set(" \t\n\r,.;:!?()[]{}\"'«»„“”‘’`*|/<>=")


def tidy(text: str, s: int, e: int) -> tuple[int, int]:
    """Expand to whole words, then strip edge punctuation / whitespace."""
    while s > 0 and _is_word_char(text[s - 1]) and s < len(text) and _is_word_char(text[s]):
        s -= 1
    while e < len(text) and e > 0 and _is_word_char(text[e]) and _is_word_char(text[e - 1]):
        e += 1
    while s < e and text[s] in EDGE_STRIP:
        s += 1
    while e > s and text[e - 1] in EDGE_STRIP and not (text[e - 1] == "." and e - s <= 4):
        e -= 1
    return s, e


def merge_adjacent(text: str, ents: list) -> list:
    ents = sorted(ents, key=lambda x: (x[0], x[1]))
    out = []
    for ent in ents:
        if out and out[-1][2] == ent[2] and ent[0] >= out[-1][1] and text[out[-1][1]:ent[0]].strip() == "":
            p = out[-1]
            lp, le = p[1] - p[0], ent[1] - ent[0]
            out[-1] = (p[0], ent[1], p[2], (p[3] * lp + ent[3] * le) / max(lp + le, 1), p[4])
        elif out and ent[0] < out[-1][1]:  # overlap after tidy: keep higher score
            if ent[3] > out[-1][3]:
                out[-1] = ent
        else:
            out.append(ent)
    return out


class TokenClassifier:
    def __init__(self, spec: Spec, threads: int = 6, fetched: dict | None = None):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self.spec = spec
        self.fetched = fetched or fetch(spec)
        p = self.fetched["paths"]
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        if spec.onnx == "torch":  # reference only: PyTorch fp32 weights from the repo
            import torch
            from transformers import AutoModelForTokenClassification

            torch.set_num_threads(threads)
            self.torch_model = AutoModelForTokenClassification.from_pretrained(spec.repo, revision=self.fetched["revision"]).eval()
            self.inputs = ["input_ids", "attention_mask"]
        else:
            self.torch_model = None
            self.sess = ort.InferenceSession(p[spec.onnx], sess_options=so, providers=["CPUExecutionProvider"])
            self.inputs = [i.name for i in self.sess.get_inputs()]
        self.tok = Tokenizer.from_file(p[spec.tokenizer])
        self.tok.no_padding()
        self.tok.enable_truncation(512)
        cfg = json.load(open(p[spec.config]))
        id2label = {int(k): v for k, v in cfg["id2label"].items()}
        self.n_labels = len(id2label)
        self.pad_id = cfg.get("pad_token_id") or 0
        # coarse index per raw label; B-flag per raw label
        order = ["O", "PER", "LOC", "ORG", "OTHER"]
        self.coarse_of = np.zeros(self.n_labels, dtype=np.int64)
        self.is_b = np.zeros(self.n_labels, dtype=bool)
        self.raw_type = {}
        for i, lab in id2label.items():
            if lab == "O":
                continue
            pre, typ = lab.split("-", 1) if lab[:2] in ("B-", "I-", "E-", "S-") else ("I", lab)
            self.coarse_of[i] = order.index(spec.mapper(typ))
            self.is_b[i] = pre in ("B", "S")
            self.raw_type[i] = typ
        self.order = order
        self.M = np.zeros((self.n_labels, len(order)), dtype=np.float32)
        self.M[np.arange(self.n_labels), self.coarse_of] = 1.0
        self.Mb = self.M * self.is_b[:, None]

    def _run(self, encs):
        L = max(len(e.ids) for e in encs)
        ids = np.full((len(encs), L), self.pad_id, dtype=np.int64)
        am = np.zeros((len(encs), L), dtype=np.int64)
        for i, e in enumerate(encs):
            ids[i, : len(e.ids)] = e.ids
            am[i, : len(e.ids)] = 1
        feed = {"input_ids": ids, "attention_mask": am}
        if "token_type_ids" in self.inputs:
            feed["token_type_ids"] = np.zeros_like(ids)
        feed = {k: v for k, v in feed.items() if k in self.inputs}
        if self.torch_model is not None:
            import torch

            with torch.inference_mode():
                return self.torch_model(**{k: torch.from_numpy(v) for k, v in feed.items()}).logits.float().numpy()
        return self.sess.run(None, feed)[0]

    def predict(self, texts: list[str], batch_size: int = 16) -> list[list]:
        encs = self.tok.encode_batch(texts)
        order = sorted(range(len(texts)), key=lambda i: len(encs[i].ids))
        out = [None] * len(texts)
        for b in range(0, len(order), batch_size):
            idx = order[b : b + batch_size]
            logits = self._run([encs[i] for i in idx])
            for j, i in enumerate(idx):
                n = len(encs[i].ids)
                out[i] = self._decode(texts[i], encs[i], logits[j, :n])
        return out

    def _decode(self, text, enc, logits):
        """Word-level decoding (same scheme as bardsai's reference pii_detector.py,
        but pooling labels into coarse types): a word's distribution is the mean
        of its sub-token distributions; words of the same coarse type are merged
        when only whitespace/hyphen separates them and the next word does not
        look like a new entity (B-mass < 0.5, or a different fine type such as
        GIVEN_NAME -> SURNAME)."""
        x = logits - logits.max(-1, keepdims=True)
        p = np.exp(x)
        p /= p.sum(-1, keepdims=True)
        pc = p @ self.M  # (T, 5) coarse probs
        pb = p @ self.Mb  # (T, 5) B-label mass per coarse type
        words = []
        for m in WORD_RE.finditer(text):
            ws, we = m.start(), m.end()
            while ws < we and text[ws] in LEAD:
                ws += 1
            while we > ws and text[we - 1] in TRAIL:
                we -= 1
            if we > ws:
                words.append([ws, we, []])
        if not words:
            return []
        starts = [w[0] for w in words]
        import bisect

        for t, (s, e) in enumerate(enc.offsets):
            if s == e:
                continue
            while s < e - 1 and text[s].isspace():
                s += 1
            k = bisect.bisect_right(starts, s) - 1
            if k >= 0 and s < words[k][1]:
                words[k][2].append(t)
        res = []
        for ws, we, toks in words:
            if not toks:
                continue
            wp = pc[toks].mean(0)
            c = int(wp.argmax())
            if c == 0:
                res.append(None)
                continue
            raw_sum = p[toks].sum(0)
            raw_sum = np.where(self.coarse_of == c, raw_sum, -1)
            fine = self.raw_type.get(int(raw_sum.argmax()), "")
            bratio = float(pb[toks[0], c] / max(pc[toks[0], c], 1e-9))
            prev = res[-1] if res else None
            if (prev is not None and prev["c"] == c and text[prev["e"]:ws].strip(" -") == ""
                    and (bratio < 0.5 or fine != prev["fine"])):
                prev["e"] = we
                prev["ps"].append(float(wp[c]))
                prev["fine"] = fine
            else:
                res.append({"c": c, "s": ws, "e": we, "ps": [float(wp[c])], "fine": fine, "raw": fine})
        return [(r["s"], r["e"], self.order[r["c"]], float(np.mean(r["ps"])), r["raw"]) for r in res if r]


class GlinerModel:
    def __init__(self, spec: Spec, threads: int = 6, fetched: dict | None = None, min_threshold: float = 0.3):
        import onnxruntime as ort
        import gliner.data_processing.tokenizer as gtok
        from gliner import GLiNER

        # gliner-x is configured for the Stanza word splitter, which does not
        # exist in a browser (gliner.js splits with a regex). Use the regex
        # splitter for every GLiNER model so the evaluation matches deployment.
        gtok.StanzaWordsSplitter = gtok.WhitespaceTokenSplitter
        self.spec = spec
        self.fetched = fetched or fetch(spec)
        local_dir = os.path.dirname(self.fetched["paths"][spec.tokenizer])
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.model = GLiNER.from_pretrained(local_dir, load_onnx_model=True, onnx_model_file=spec.onnx,
                                            local_files_only=True, session_options=so)
        self.labels = list(spec.gliner_labels)
        self.min_threshold = min_threshold

    def predict(self, texts: list[str], batch_size: int = 8) -> list[list]:
        res = self.model.inference(texts, self.labels, flat_ner=True, threshold=self.min_threshold, batch_size=batch_size)
        out = []
        for text, ents in zip(texts, res):
            r = []
            for en in ents:
                s, e = tidy(text, en["start"], en["end"])
                if e > s:
                    r.append((s, e, self.spec.gliner_labels[en["label"]], float(en["score"]), en["label"]))
            out.append(merge_adjacent(text, r))
        return out


def load(name: str, threads: int = 6):
    spec = REGISTRY[name]
    return (TokenClassifier if spec.kind == "tc" else GlinerModel)(spec, threads=threads)
