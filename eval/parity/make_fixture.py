"""Generate differential-test cases for the TypeScript engine.

The oracle is EuroPII Guard (Python) — the detectors' own ``check`` method,
which strips separators and calls python-stdnum. For every detector we draw
random candidates with realistic layouts (real calendar dates of all
centuries, every separator and century sign, occasional impossible dates)
and complete the check character(s) by brute force, so that both valid and
near-miss invalid values are well represented.

    pip install "europii-guard @ git+https://github.com/sinceaihq/europii-guard@v0.1.2"
    python eval/parity/make_fixture.py --out tests/fixtures/parity-validators.json.gz
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import random
import string
from collections.abc import Callable

import europii
from europii.detectors import ALL_DETECTORS

DET = {d.name: d for d in ALL_DETECTORS}
D = string.digits
U = string.ascii_uppercase


def digits(rng: random.Random, n: int) -> str:
    return "".join(rng.choice(D) for _ in range(n))


def date_parts(rng: random.Random, y0: int = 1890, y1: int = 2030) -> tuple[int, int, int]:
    if rng.random() < 0.1:  # impossible or edge dates
        return rng.randint(1900, 2030), rng.choice([0, 2, 13, 12]), rng.choice([0, 29, 30, 31, 32])
    day = dt.date(y0, 1, 1) + dt.timedelta(days=rng.randint(0, (dt.date(y1, 12, 31) - dt.date(y0, 1, 1)).days))
    return day.year, day.month, day.day


# Shape generators return a template with "?" marking the position(s) that
# are brute-forced over ``alphabet`` (the check character).
Shape = Callable[[random.Random], str]


def fi(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1850, 2029)
    sign = rng.choice("-+ABCDEFYXWVU")
    return f"{d:02d}{m:02d}{y % 100:02d}{sign}{digits(rng, 3)}?"


def it_cf(rng: random.Random) -> str:
    letters = "".join(rng.choice(U) for _ in range(6))
    y, m, d = date_parts(rng, 1920, 2019)
    d += rng.choice([0, 40])
    omo = lambda s: "".join("LMNPQRSTUV"[int(c)] if rng.random() < 0.05 else c for c in s)  # noqa: E731
    month = "ABCDEHLMPRST"[(m - 1) % 12] if 1 <= m <= 12 else rng.choice("FGIJ")
    return f"{letters}{omo(f'{y % 100:02d}')}{month}{omo(f'{d:02d}')}{rng.choice(U)}{omo(digits(rng, 3))}?"


def fr_nir(rng: random.Random) -> str:
    dept = rng.choice([f"{rng.randint(1, 95):02d}", "2A", "2B", "97", "99"])
    return f"{rng.choice('1278')}{digits(rng, 2)}{rng.randint(1, 12):02d}{dept}{digits(rng, 6)}??"


def es_dni(rng: random.Random) -> str:
    return digits(rng, 8) + "?"


def es_nie(rng: random.Random) -> str:
    return rng.choice("XYZ") + digits(rng, 7) + "?"


def ie_pps(rng: random.Random) -> str:
    return digits(rng, 7) + "?" + rng.choice(["", "", "A", "B", "H", "W", "T", "X", "Z"])


def pt_cc(rng: random.Random) -> str:
    return digits(rng, 8) + rng.choice(D) + rng.choice(U + D) + rng.choice(U + D) + "?"


def se(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1890, 2025)
    d += rng.choice([0, 0, 60])
    form = rng.random()
    if form < 0.4:
        return f"{y % 100:02d}{m:02d}{d:02d}{rng.choice('-+')}{digits(rng, 3)}?"
    if form < 0.7:
        return f"{y}{m:02d}{d:02d}-{digits(rng, 3)}?"
    return f"{y}{m:02d}{d:02d}{digits(rng, 3)}?" if rng.random() < 0.5 else f"{y % 100:02d}{m:02d}{d:02d}{digits(rng, 3)}?"


def no(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1855, 2030)
    d += rng.choice([0, 0, 40])
    m += rng.choice([0, 0, 40])
    return f"{d:02d}{m:02d}{y % 100:02d}{digits(rng, 3)}??"


def be(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1900, 2025)
    return f"{y % 100:02d}{m:02d}{d:02d}{digits(rng, 3)}??"


def pl(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1800, 2299)
    m += {18: 80, 19: 0, 20: 20, 21: 40, 22: 60}.get(y // 100, 0)
    return f"{y % 100:02d}{m:02d}{d:02d}{digits(rng, 4)}?"


def ee(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1800, 2199)
    first = {18: "12", 19: "34", 20: "56", 21: "78"}[y // 100]
    return f"{rng.choice(first + '09')}{y % 100:02d}{m:02d}{d:02d}{digits(rng, 3)}?"


def lv(rng: random.Random) -> str:
    if rng.random() < 0.2:
        return "32" + digits(rng, 8) + "?"
    if rng.random() < 0.15:
        return rng.choice("456789") + digits(rng, 9) + "?"  # company numbers
    y, m, d = date_parts(rng, 1800, 2099)
    return f"{d:02d}{m:02d}{y % 100:02d}{(y // 100) - 18}{digits(rng, 3)}?"


def cz(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1900, 2053)
    m += rng.choice([0, 50, 20, 70])
    if y < 1954 and rng.random() < 0.5:
        return f"{y % 100:02d}{m:02d}{d:02d}{digits(rng, 3)}"
    return f"{y % 100:02d}{m:02d}{d:02d}{digits(rng, 3)}?"


def si(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1900, 2099)
    return f"{d:02d}{m:02d}{y % 1000:03d}{rng.choice(['50', '10', '20'])}{digits(rng, 3)}?"


def ro(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1800, 2099)
    first = {18: "34", 19: "1279", 20: "56"}[y // 100]
    county = rng.choice([f"{rng.randint(1, 52):02d}", "70", "99", "00"])
    return f"{rng.choice(first)}{y % 100:02d}{m:02d}{d:02d}{county}{digits(rng, 3)}?"


def bg(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1800, 2099)
    m += {18: 20, 19: 0, 20: 40}[y // 100]
    return f"{y % 100:02d}{m:02d}{d:02d}{digits(rng, 3)}?"


def dk(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1858, 2036)
    return f"{d:02d}{m:02d}{y % 100:02d}-{digits(rng, 4)}"


def de(rng: random.Random) -> str:
    return f"{rng.randint(1, 9)}{digits(rng, 9)}?"


def nl(rng: random.Random) -> str:
    return digits(rng, 8) + "?"


def at(rng: random.Random) -> str:
    y, m, d = date_parts(rng, 1900, 2025)
    return f"{rng.randint(1, 9)}{digits(rng, 2)}? {d:02d}{m:02d}{y % 100:02d}"


def hr(rng: random.Random) -> str:
    return digits(rng, 10) + "?"


def pt_nif(rng: random.Random) -> str:
    return rng.choice("12356789") + digits(rng, 7) + "?"


VAT_SHAPES = {
    "AT": lambda r: "ATU" + digits(r, 7) + "?",
    "BE": lambda r: "BE" + r.choice("01") + digits(r, 7) + "??",
    "BG": lambda r: "BG" + digits(r, r.choice([8, 9])) + "?",
    "CY": lambda r: "CY" + r.choice("013459") + digits(r, 7) + "?",
    "CZ": lambda r: "CZ" + r.choice([digits(r, 7), "6" + digits(r, 7), digits(r, 9)]) + "?",
    "DE": lambda r: "DE" + str(r.randint(1, 9)) + digits(r, 7) + "?",
    "DK": lambda r: "DK" + str(r.randint(1, 9)) + digits(r, 6) + "?",
    "EE": lambda r: "EE10" + digits(r, 6) + "?",
    "EL": lambda r: "EL" + digits(r, 8) + "?",
    "ES": lambda r: "ES" + r.choice(["", "", "X", "K", "A", "B", "N", "P"]).ljust(1, r.choice(D)) + digits(r, 7) + "?",
    "FI": lambda r: "FI" + digits(r, 7) + "?",
    "FR": lambda r: "FR" + r.choice(["??", r.choice(U + D) + r.choice(U + D)]) + digits(r, 9),
    "HR": lambda r: "HR" + digits(r, 10) + "?",
    "HU": lambda r: "HU" + digits(r, 7) + "?",
    "IE": lambda r: "IE" + r.choice([digits(r, 7) + "?", digits(r, 7) + "?" + r.choice("AH"), r.choice(D) + r.choice(U) + digits(r, 5) + "?"]),
    "IT": lambda r: "IT" + digits(r, 7) + r.choice(["001", "050", "100", "120", "888", "200"]) + "?",
    "LT": lambda r: "LT" + r.choice([digits(r, 7) + "1", digits(r, 10) + "1"]) + "?",
    "LU": lambda r: "LU" + digits(r, 6) + "??",
    "LV": lambda r: "LV" + r.choice("4500") + digits(r, 9) + "?",
    "MT": lambda r: "MT" + str(r.randint(1, 9)) + digits(r, 6) + "?",
    "NL": lambda r: "NL" + digits(r, 8) + "?B" + r.choice(["01", "02", "00", "12"]),
    "PL": lambda r: "PL" + digits(r, 9) + "?",
    "PT": lambda r: "PT" + r.choice("1235") + digits(r, 7) + "?",
    "RO": lambda r: "RO" + str(r.randint(1, 9)) + digits(r, r.randint(1, 8)) + "?",
    "SE": lambda r: "SE" + digits(r, 9) + "?01",
    "SI": lambda r: "SI" + str(r.randint(1, 9)) + digits(r, 6) + "?",
    "SK": lambda r: "SK" + str(r.randint(1, 9)) + digits(r, 1) + r.choice("2347890") + digits(r, 6) + "?",
    "XI": lambda r: "XI" + r.choice([digits(r, 8) + "?", digits(r, 11) + "?", "GD" + digits(r, 3), "HA" + digits(r, 3)]),
}

IBAN_LENGTHS = {"FI": 18, "DE": 22, "FR": 27, "ES": 24, "IT": 27, "NL": 18, "BE": 16, "SE": 24, "NO": 15,
                "DK": 18, "PL": 28, "PT": 25, "AT": 20, "IE": 22, "GB": 22, "ME": 22, "CH": 21, "EE": 20}  # fmt: skip


def iban_shape(rng: random.Random) -> str:
    cc = rng.choice(list(IBAN_LENGTHS))
    bban = "".join(rng.choice(U if (cc in ("NL", "GB", "IE") and i < 4) else D) for i in range(IBAN_LENGTHS[cc] - 4))
    if cc == "FR":
        bban = bban[:20] + "".join(rng.choice(D) for _ in range(3))
    return cc + "??" + bban


def card(rng: random.Random) -> str:
    prefix = rng.choice(["4", "51", "55", "2221", "34", "37", "6011", "65", "35", "9", "1"])
    length = rng.choice([13, 15, 16, 16, 16, 17, 19])
    return prefix + digits(rng, length - len(prefix) - 1) + "?"


SHAPES: dict[str, tuple[Shape, str]] = {
    "fi_hetu": (fi, "0123456789ABCDEFHJKLMNPRSTUVWXY"),
    "it_codice_fiscale": (it_cf, U),
    "fr_nir": (fr_nir, D),
    "es_dni": (es_dni, U),
    "es_nie": (es_nie, U),
    "ie_ppsn": (ie_pps, U[:23]),
    "pt_cc": (pt_cc, D),
    "se_personnummer": (se, D),
    "se_personnummer_compact": (se, D),
    "no_fodselsnummer": (no, D),
    "be_national_number": (be, D),
    "pl_pesel": (pl, D),
    "ee_isikukood": (ee, D),
    "lt_asmens_kodas": (ee, D),
    "lv_personas_kods": (lv, D),
    "cz_rodne_cislo": (cz, D),
    "sk_rodne_cislo": (cz, D),
    "si_emso": (si, D),
    "ro_cnp": (ro, D),
    "bg_egn": (bg, D),
    "dk_cpr": (dk, D),
    "de_steuer_id": (de, D),
    "nl_bsn": (nl, D),
    "at_svnr": (at, D),
    "hr_oib": (hr, D),
    "pt_nif": (pt_nif, D),
    "iban": (iban_shape, D),
    "payment_card": (card, D),
}


def fill(template: str, alphabet: str, rng: random.Random) -> list[str]:
    """All completions of the first "?" (other "?" random), or the template itself."""
    template = "".join(rng.choice(alphabet) if c == "?" and i != template.index("?") else c
                       for i, c in enumerate(template)) if template.count("?") > 1 else template  # fmt: skip
    if "?" not in template:
        return [template]
    return [template.replace("?", a, 1) for a in alphabet]


def solve_multi(template: str, alphabet: str, det_check: Callable[[str], bool], rng: random.Random) -> list[str]:
    """Templates with two check characters: search the pair, keep valid ones and a few invalid."""
    pos = [i for i, c in enumerate(template) if c == "?"]
    if len(pos) != 2:
        return fill(template, alphabet, rng)
    out = []
    for a in alphabet:
        for b in alphabet:
            s = list(template)
            s[pos[0]], s[pos[1]] = a, b
            out.append("".join(s))
    valid = [s for s in out if det_check(s)]
    return valid[:3] + rng.sample(out, 3)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--per-detector", type=int, default=400)
    ap.add_argument("--seed", type=int, default=20261019)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    cases: list[dict[str, object]] = []

    def add(det: str, value: str) -> None:
        cases.append({"d": det, "v": value, "ok": bool(DET[det].check(value))})

    for name, (shape, alphabet) in SHAPES.items():
        check = DET[name].check
        for _ in range(args.per_detector):
            template = shape(rng)
            values = solve_multi(template, alphabet, check, rng) if template.count("?") == 2 else fill(template, alphabet, rng)
            valid = [v for v in values if check(v)]
            invalid = [v for v in values if not check(v)]
            for v in valid[:2] + rng.sample(invalid, min(2, len(invalid))):
                add(name, v)
    for cc, shape in VAT_SHAPES.items():
        check = DET["eu_vat"].check
        for _ in range(args.per_detector // 2):
            template = shape(rng)
            values = solve_multi(template, D, check, rng) if template.count("?") == 2 else fill(template, D, rng)
            valid = [v for v in values if check(v)]
            invalid = [v for v in values if not check(v)]
            for v in valid[:2] + rng.sample(invalid, min(1, len(invalid))):
                add("eu_vat", v)
    # Separator and case variants of valid values.
    for c in [c for c in cases if c["ok"]][:3000]:
        v = str(c["v"])
        if rng.random() < 0.5 and len(v) > 6:
            k = rng.randint(2, len(v) - 2)
            add(str(c["d"]), v[:k] + rng.choice([" ", "-", ".", "/"]) + v[k:])
        else:
            add(str(c["d"]), v.lower())

    meta = {"oracle": f"europii-guard {europii.__version__}", "generated": dt.date.today().isoformat(),
            "seed": args.seed, "n": len(cases), "valid": sum(bool(c["ok"]) for c in cases)}  # fmt: skip
    with gzip.open(args.out, "wt", encoding="utf-8") as fh:
        json.dump({"meta": meta, "cases": cases}, fh, ensure_ascii=False, separators=(",", ":"))
    print(meta)


if __name__ == "__main__":
    main()
