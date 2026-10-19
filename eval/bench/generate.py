"""SafePrompt-Bench: synthetic "things people paste into AI chats".

Each document imitates content that ends up in prompts — .env files, logs,
JSON payloads, CSV exports, curl commands, code, SQL, stack traces, e-mails
and support chats — with annotated personal data and secrets, and many hard
negatives (UUIDs, hashes, timestamps, order numbers, invalid look-alikes).

Independent of the EuroPII Guard benchmark: different templates, formats and
identifier forms. Identifiers that encode a birth date use real-world forms
(e.g. the Finnish "-" century sign, 12-digit Swedish numbers) with birth
years 1900–1905, so they are structurally realistic without plausibly
belonging to a living person. E-mail addresses use reserved example domains,
IP addresses documentation or private ranges, cards public test numbers,
and secrets are random strings in the documented token formats.

    python eval/bench/generate.py --out eval/bench/data --seed 4242 --test-seed 20261020 --dev 300 --test 1500
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import random
import string
import sys
import uuid
from collections.abc import Callable
from pathlib import Path

import phonenumbers
from europii.detectors import ALL_DETECTORS
from stdnum import iban as std_iban

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "parity"))
import make_fixture as shapes  # noqa: E402

DET = {d.name: d for d in ALL_DETECTORS}
A = string.ascii_letters + string.digits


# Identifier values ------------------------------------------------------------
def _old_dates(rng: random.Random, y0: int = 1900, y1: int = 1905) -> tuple[int, int, int]:
    d = dt.date(y0, 1, 1) + dt.timedelta(days=rng.randint(0, (dt.date(y1, 12, 31) - dt.date(y0, 1, 1)).days))
    return d.year, d.month, d.day


# Schemes whose century can be decoded: the birth year must be 1900–1905.
_BIRTH = {
    "se_personnummer": "se.personnummer", "no_fodselsnummer": "no.fodselsnummer",
    "dk_cpr": "dk.cpr", "pl_pesel": "pl.pesel", "ee_isikukood": "ee.ik", "cz_rodne_cislo": "cz.rc",
    "ro_cnp": "ro.cnp", "be_national_number": "be.nn",
}  # fmt: skip


def _born_long_ago(name: str, value: str) -> bool:
    if name == "fi_hetu":  # century sign: "+" 1800s, "-"/Y/X/W/V/U 1900s, A-F 2000s
        return value[6] in "+-YXWVU" and 1900 + int(value[4:6]) <= 1905 or value[6] == "+"
    if name not in _BIRTH:
        return True  # no decodable century (see module docstring)
    import importlib

    module = importlib.import_module(f"stdnum.{_BIRTH[name]}")
    compact = value.replace(" ", "") if name != "fi_hetu" else value
    try:
        born = module.get_birth_date(compact)
    except Exception:
        return False
    return born is not None and born.year <= 1905


def national_id(rng: random.Random, name: str) -> str:
    """A valid identifier in a realistic form, birth year 1900–1905 where encoded."""
    shape, alphabet = shapes.SHAPES[name]
    original = shapes.date_parts
    shapes.date_parts = lambda r, y0=1900, y1=1905: _old_dates(r)  # type: ignore[assignment]
    try:
        for _ in range(5000):
            template = shape(rng)
            if name == "fi_hetu":  # realistic century signs for 1900–1905
                template = template[:6] + rng.choice("--Y") + template[7:]
            if name == "se_personnummer" and len(template) < 12:
                continue
            values = shapes.fill(template, alphabet, rng)
            for value in rng.sample(values, k=len(values)):
                if DET[name].check(value) and _born_long_ago(name, value):
                    return value
    finally:
        shapes.date_parts = original
    raise RuntimeError(f"no valid {name}")


def invalid_id(rng: random.Random, name: str) -> str:
    for _ in range(1000):
        chars = list(national_id(rng, name))
        digits = [i for i, c in enumerate(chars) if c.isdigit()]
        i = rng.choice(digits[-3:])
        chars[i] = str((int(chars[i]) + rng.randint(1, 9)) % 10)
        v = "".join(chars)
        if not DET[name].check(v):
            return v
    raise RuntimeError(name)


ID_LABELS = {
    "fi_hetu": ("henkilötunnus", "hetu", "personal identity code"),
    "se_personnummer": ("personnummer", "personnr"),
    "de_steuer_id": ("Steuer-ID", "Steueridentifikationsnummer"),
    "fr_nir": ("numéro de sécurité sociale", "NIR"),
    "nl_bsn": ("BSN", "burgerservicenummer"),
    "it_codice_fiscale": ("codice fiscale", "C.F."),
    "es_dni": ("DNI",),
    "pl_pesel": ("PESEL",),
    "dk_cpr": ("CPR-nr.", "CPR"),
    "no_fodselsnummer": ("fødselsnummer",),
    "ee_isikukood": ("isikukood",),
    "be_national_number": ("rijksregisternummer", "numéro national"),
    "cz_rodne_cislo": ("rodné číslo",),
    "ro_cnp": ("CNP",),
    "hr_oib": ("OIB",),
    "ie_ppsn": ("PPSN",),
    "at_svnr": ("SVNR",),
    "pt_nif": ("NIF",),
}
ID_KEYS = {"fi_hetu": "hetu", "se_personnummer": "personnummer", "de_steuer_id": "steuer_id", "fr_nir": "nir",
           "nl_bsn": "bsn", "it_codice_fiscale": "codice_fiscale", "es_dni": "dni", "pl_pesel": "pesel",
           "dk_cpr": "cpr", "no_fodselsnummer": "fnr", "ee_isikukood": "isikukood",
           "be_national_number": "rrn", "cz_rodne_cislo": "rodne_cislo", "ro_cnp": "cnp", "hr_oib": "oib",
           "ie_ppsn": "ppsn", "at_svnr": "svnr", "pt_nif": "nif"}  # fmt: skip
COUNTRY_OF = {"fi_hetu": "FI", "se_personnummer": "SE", "de_steuer_id": "DE", "fr_nir": "FR", "nl_bsn": "NL",
              "it_codice_fiscale": "IT", "es_dni": "ES", "pl_pesel": "PL", "dk_cpr": "DK", "no_fodselsnummer": "NO",
              "ee_isikukood": "EE", "be_national_number": "BE", "cz_rodne_cislo": "CZ", "ro_cnp": "RO",
              "hr_oib": "HR", "ie_ppsn": "IE", "at_svnr": "AT", "pt_nif": "PT"}  # fmt: skip

PEOPLE = {
    "FI": ("Matti Meikäläinen", "Maija Meikäläinen", "Teppo Testaaja"), "SE": ("Sven Svensson", "Anna Andersson"),
    "DE": ("Erika Mustermann", "Max Mustermann"), "FR": ("Jean Dupont", "Marie Dupont"),
    "NL": ("Jan Jansen", "Piet Pietersen"), "IT": ("Mario Rossi", "Maria Bianchi"), "ES": ("Juan Pérez", "Fulano de Tal"),
    "PL": ("Jan Kowalski", "Anna Nowak"), "DK": ("Jens Hansen", "Mette Jensen"), "NO": ("Ola Nordmann", "Kari Nordmann"),
    "EE": ("Jaan Tamm",), "BE": ("Jan Janssens",), "CZ": ("Jan Novák",), "RO": ("Ion Popescu",), "HR": ("Ivan Horvat",),
    "IE": ("Joe Bloggs", "Mary Murphy"), "AT": ("Max Mustermann",), "PT": ("João Silva", "Maria Santos"),
}  # fmt: skip
DOMAINS = ("example.com", "example.org", "example.net", "mail.example.com", "corp.example")
IBAN_COUNTRIES = {"FI": 18, "SE": 24, "DE": 22, "FR": 27, "NL": 18, "IT": 27, "ES": 24, "PL": 28, "DK": 18,
                  "BE": 16, "AT": 20, "IE": 22, "PT": 25, "EE": 20, "CZ": 24}  # fmt: skip
TEST_CARDS = ("4111 1111 1111 1111", "4012888888881881", "5555 5555 5555 4444", "5105-1051-0510-5100",
              "3782 822463 10005", "6011 1111 1111 1117", "4000 0566 5566 5556")  # fmt: skip


def email_for(rng: random.Random, person: str) -> str:
    first, *rest = person.lower().replace("ä", "a").replace("ö", "o").replace("é", "e").replace("á", "a").split()
    last = (rest[-1] if rest else "user").replace("ó", "o")
    return rng.choice([f"{first}.{last}", f"{first[0]}{last}", f"{first}_{last}{rng.randint(1, 99)}"]) + "@" + rng.choice(DOMAINS)


def phone(rng: random.Random, country: str, international: bool) -> str:
    example = phonenumbers.example_number_for_type(country, phonenumbers.PhoneNumberType.MOBILE)
    national = str(example.national_number)
    for _ in range(200):
        cand = national[:-4] + "".join(rng.choice(string.digits) for _ in range(4))
        num = phonenumbers.parse(cand, country)
        if phonenumbers.is_valid_number(num):
            fmt = phonenumbers.PhoneNumberFormat.INTERNATIONAL if international else phonenumbers.PhoneNumberFormat.NATIONAL
            out = phonenumbers.format_number(num, fmt)
            if international and rng.random() < 0.2:
                out = "00" + out[1:]  # 0049 30 ... form
            if international and rng.random() < 0.2:
                out = out.replace(" ", "")
            return out
    raise RuntimeError(country)


BBAN_LAYOUT = {"FI": "3n11n", "SE": "3n16n1n", "DE": "8n10n", "FR": "5n5n11c2n", "NL": "4a10n", "IT": "1a5n5n12c",
               "ES": "4n4n1n1n10n", "PL": "8n16n", "DK": "4n9n1n", "BE": "3n7n2n", "AT": "5n11n", "IE": "4a6n8n",
               "PT": "4n4n11n2n", "EE": "2n14n", "CZ": "4n16n"}  # fmt: skip


def iban(rng: random.Random, country: str, valid: bool = True) -> str:
    import re

    classes = {"n": string.digits, "a": string.ascii_uppercase, "c": string.digits}
    for _ in range(10000):
        bban = "".join(rng.choice(classes[k]) for n, k in re.findall(r"(\d+)([nac])", BBAN_LAYOUT[country]) for _ in range(int(n)))
        value = country + std_iban.calc_check_digits(country + "00" + bban) + bban
        if std_iban.is_valid(value):
            break
    else:
        raise RuntimeError(country)
    if not valid:
        value = value[:2] + f"{(int(value[2:4]) + rng.randint(1, 50)) % 97 + 2:02d}" + value[4:]
        if std_iban.is_valid(value):
            return iban(rng, country, valid)
    return " ".join(value[i : i + 4] for i in range(0, len(value), 4)) if rng.random() < 0.6 else value


def vat(rng: random.Random) -> str:
    check = DET["eu_vat"].check
    while True:
        cc = rng.choice(list(shapes.VAT_SHAPES))
        template = shapes.VAT_SHAPES[cc](rng)
        for v in shapes.fill(template, string.digits, rng) if template.count("?") == 1 else []:
            if check(v):
                return v


def ip(rng: random.Random) -> str:
    return rng.choice([
        f"192.0.2.{rng.randint(1, 254)}", f"198.51.100.{rng.randint(1, 254)}", f"203.0.113.{rng.randint(1, 254)}",
        f"10.{rng.randint(0, 255)}.{rng.randint(0, 255)}.{rng.randint(1, 254)}", f"192.168.{rng.randint(0, 255)}.{rng.randint(1, 254)}",
        f"2001:db8:{rng.randint(1, 0xffff):x}::{rng.randint(1, 0xffff):x}",
    ])  # fmt: skip


def rand(rng: random.Random, n: int, alphabet: str = A) -> str:
    return "".join(rng.choice(alphabet) for _ in range(n))


_RAW_SECRETS: dict[str, Callable[[random.Random], str]] = {
    "aws_access_key": lambda r: "AKIA" + rand(r, 16, string.ascii_uppercase + string.digits),
    "github_token": lambda r: "ghp_" + rand(r, 36),
    "github_pat": lambda r: "github_pat_" + rand(r, 22) + "_" + rand(r, 59),
    "gitlab_token": lambda r: "glpat-" + rand(r, 20, A + "_-"),
    "google_api_key": lambda r: "AIza" + rand(r, 35, A + "_-"),
    "openai_key": lambda r: "sk-proj-" + rand(r, 48, A + "_-"),
    "anthropic_key": lambda r: "sk-ant-api03-" + rand(r, 93, A + "_-") + "AA",
    "huggingface_token": lambda r: "hf_" + rand(r, 34),
    "npm_token": lambda r: "npm_" + rand(r, 36),
    "jwt": lambda r: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    + base64.urlsafe_b64encode(json.dumps({"sub": str(r.randint(1, 10**6)), "iat": r.randint(1_600_000_000, 1_800_000_000)}).encode()).decode().rstrip("=")
    + "." + rand(r, 43, A + "_-"),
    "password": lambda r: r.choice(["Summer", "Kissa", "Hunter", "Passw0rd", "Tr0ub4dor", "Qwerty"]) + str(r.randint(10, 9999)) + r.choice("!#%&?"),
}


def _mark(value: str, kind: str) -> str:
    """Make a generated secret recognisably fake without changing its format or length.

    Secret scanners (and people) should never mistake benchmark values for leaked
    credentials, so every value carries "EXAMPLE" or "FAKE" in its random part.
    """
    if kind == "password":
        return value
    marker = "EXAMPLE" if kind == "aws_access_key" else "FAKE"
    if kind == "jwt":  # mark the signature
        head, payload, sig = value.split(".")
        return f"{head}.{payload}.{marker}{sig[len(marker):]}"
    return value[: len(value) - len(marker)] + marker


# Stripe and Slack formats are not generated: GitHub push protection blocks
# repositories containing them even when they are fake. Their detectors are
# covered by unit tests instead.
SECRETS: dict[str, Callable[[random.Random], str]] = {
    kind: (lambda make, kind: lambda r: _mark(make(r), kind))(make, kind) for kind, make in _RAW_SECRETS.items()
}


# Hard negatives ----------------------------------------------------------------
def negatives(rng: random.Random) -> dict[str, str]:
    d = dt.datetime(2026, 1, 1) + dt.timedelta(seconds=rng.randint(0, 300 * 86400))
    return {
        "uuid": str(uuid.UUID(int=rng.getrandbits(128), version=4)),
        "sha": hashlib.sha1(rand(rng, 12).encode()).hexdigest(),
        "short_sha": hashlib.sha1(rand(rng, 12).encode()).hexdigest()[:7],
        "sha256": hashlib.sha256(rand(rng, 12).encode()).hexdigest(),
        "b64": base64.b64encode(rng.randbytes(rng.randint(24, 60))).decode(),
        "epoch": str(int(d.timestamp())),
        "epoch_ms": str(int(d.timestamp() * 1000)),
        "iso": d.isoformat(timespec="seconds") + "Z",
        "date_eu": d.strftime("%d.%m.%Y"),
        "version": f"{rng.randint(0, 9)}.{rng.randint(0, 30)}.{rng.randint(0, 99)}",
        "order": str(rng.randint(10**7, 10**12)),
        "invoice": f"{d.year}-{rng.randint(1, 9999):04d}",
        "amount": rng.choice([f"{rng.randint(1, 99)} {rng.randint(100, 999)},{rng.randint(10, 99)} €",
                               f"€{rng.randint(1, 9)},{rng.randint(100, 999)}.{rng.randint(10, 99)}",
                               f"{rng.randint(100, 99999)}.{rng.randint(10, 99)} EUR"]),  # fmt: skip
        "ean": "".join(rng.choice(string.digits) for _ in range(13)),
        "port": str(rng.choice([443, 5432, 6379, 8080, 3000, 27017])),
        "coords": f"{rng.uniform(40, 70):.4f}, {rng.uniform(-10, 30):.4f}",
        "tracking": "JJD" + "".join(rng.choice(string.digits) for _ in range(18)),
        "bad_iban": iban(rng, rng.choice(list(IBAN_COUNTRIES)), valid=False),
        "bad_card": "4111 1111 1111 1112",
        "hex": "#" + rand(rng, 6, "0123456789abcdef"),
        "placeholder": rng.choice(["<YOUR_API_KEY>", "${DB_PASSWORD}", "changeme", "********", "xxxxxxxx", "{{ secrets.TOKEN }}"]),
    }


# Documents --------------------------------------------------------------------
class Doc:
    def __init__(self) -> None:
        self.parts: list[str] = []
        self.spans: list[dict[str, object]] = []

    def add(self, text: str) -> Doc:
        self.parts.append(text)
        return self

    def pii(self, label: str, value: str, kind: str = "") -> Doc:
        start = sum(len(p) for p in self.parts)
        self.parts.append(value)
        self.spans.append({"start": start, "end": start + len(value), "label": label, "kind": kind})
        return self

    @property
    def text(self) -> str:
        return "".join(self.parts)


def person_bundle(rng: random.Random, id_name: str | None = None) -> dict[str, str]:
    id_name = id_name or rng.choice(list(ID_LABELS))
    country = COUNTRY_OF[id_name]
    person = rng.choice(PEOPLE[country])
    pc = country if country in IBAN_COUNTRIES else "DE"
    phone_country = country if country not in ("IE",) else "IE"
    return {
        "id_name": id_name, "country": country, "person": person, "email": email_for(rng, person),
        "id": national_id(rng, id_name), "id_label": rng.choice(ID_LABELS[id_name]),
        "phone": phone(rng, phone_country, international=rng.random() < 0.5), "iban": iban(rng, pc),
    }  # fmt: skip


def t_env(rng: random.Random) -> Doc:
    n = negatives(rng)
    d = Doc().add("Why does the app fail to start? Here is my .env:\n\n")
    d.add("NODE_ENV=production\nPORT=").add(n["port"]).add("\n")
    if rng.random() < 0.8:
        user, pw = rng.choice(["app", "admin", "postgres"]), SECRETS["password"](rng)
        d.add(f"DATABASE_URL=postgres://{user}:").pii("SECRET", pw, "url_password").add(f"@db.internal:5432/{user}\n")
    for _ in range(rng.randint(1, 3)):
        kind = rng.choice([k for k in SECRETS if k != "password"])
        var = {"aws_access_key": "AWS_ACCESS_KEY_ID", "github_token": "GITHUB_TOKEN",                "openai_key": "OPENAI_API_KEY", "anthropic_key": "ANTHROPIC_API_KEY", "huggingface_token": "HF_TOKEN",
           "google_api_key": "GOOGLE_API_KEY", "npm_token": "NPM_TOKEN",
               "gitlab_token": "GITLAB_TOKEN", "github_pat": "GH_PAT", "jwt": "SESSION_JWT"}[kind]  # fmt: skip
        d.add(f"{var}=").pii("SECRET", SECRETS[kind](rng), kind).add("\n")
    if rng.random() < 0.5:
        d.add("SMTP_PASSWORD=").pii("SECRET", SECRETS["password"](rng), "password").add("\n")
    d.add(f"SENTRY_RELEASE={n['sha']}\nFEATURE_FLAGS_ID={n['uuid']}\nADMIN_PASSWORD={n['placeholder']}\n")
    if rng.random() < 0.5:
        d.add("ADMIN_EMAIL=").pii("EMAIL", email_for(rng, rng.choice(PEOPLE["DE"]))).add("\n")
    return d


def t_log(rng: random.Random) -> Doc:
    d = Doc().add("Can you explain these errors?\n\n")
    for _ in range(rng.randint(3, 7)):
        n = negatives(rng)
        r = rng.random()
        d.add(f"{n['iso']} ")
        if r < 0.3:
            d.add("WARN auth failed for user ").pii("EMAIL", email_for(rng, rng.choice(PEOPLE["FI"]))).add(" from ").pii("IP_ADDRESS", ip(rng)).add("\n")
        elif r < 0.5:
            d.add(f"INFO GET /api/orders/{n['order']} 200 {rng.randint(3, 900)}ms req={n['uuid']}\n")
        elif r < 0.65:
            d.add("DEBUG outgoing headers: Authorization: Bearer ").pii("SECRET", SECRETS["jwt"](rng), "jwt").add("\n")
        elif r < 0.8:
            d.add(f"ERROR worker crashed (build {n['short_sha']}, v{n['version']}) at {n['epoch_ms']}\n")
        else:
            d.add(f"INFO payment {n['invoice']} settled {n['amount']} trace={n['sha256'][:16]}\n")
    return d


def t_json(rng: random.Random) -> Doc:
    b = person_bundle(rng)
    n = negatives(rng)
    d = Doc().add(rng.choice(["Turn this customer record into a friendly welcome e-mail:\n\n",
                               "Validate this JSON and tell me what is wrong:\n\n"]))  # fmt: skip
    d.add('{\n  "id": "').add(n["uuid"]).add('",\n  "name": "').pii("PERSON", b["person"]).add('",\n')
    d.add('  "email": "').pii("EMAIL", b["email"]).add('",\n  "phone": "').pii("PHONE", b["phone"]).add('",\n')
    d.add(f'  "{ID_KEYS[b["id_name"]]}": "').pii("NATIONAL_ID", b["id"], b["id_name"]).add('",\n')
    d.add('  "iban": "').pii("IBAN", b["iban"]).add('",\n')
    d.add(f'  "created": "{n["iso"]}",\n  "orders": [{n["order"]}, {negatives(rng)["order"]}],\n  "avatar_sha": "{n["sha256"]}"\n}}')
    return d


def t_csv(rng: random.Random) -> Doc:
    sep = rng.choice([";", ",", "\t"])
    id_name = rng.choice(list(ID_LABELS))
    d = Doc().add(rng.choice(["Summarise this export by city:\n\n", "Find duplicates in this list:\n\n"]))
    d.add(sep.join(["customer_no", "name", "email", "phone", ID_KEYS[id_name], "iban", "created"]) + "\n")
    for _ in range(rng.randint(2, 5)):
        b = person_bundle(rng, id_name)
        n = negatives(rng)
        d.add(n["order"] + sep).pii("PERSON", b["person"]).add(sep).pii("EMAIL", b["email"]).add(sep)
        d.pii("PHONE", b["phone"]).add(sep).pii("NATIONAL_ID", b["id"], id_name).add(sep).pii("IBAN", b["iban"]).add(sep + n["date_eu"] + "\n")
    return d


def t_curl(rng: random.Random) -> Doc:
    kind = rng.choice(["openai_key", "github_token", "gitlab_token", "huggingface_token", "jwt", "anthropic_key"])
    n = negatives(rng)
    d = Doc().add("This request returns 401, what am I doing wrong?\n\n")
    d.add(f"curl -X POST https://api.example.com/v1/items/{n['uuid']} \\\n  -H 'Authorization: Bearer ")
    d.pii("SECRET", SECRETS[kind](rng), kind).add("' \\\n  -H 'Content-Type: application/json' \\\n")
    d.add(f"  -d '{{\"order\": {n['order']}, \"amount\": \"{n['amount']}\", \"contact\": \"")
    d.pii("EMAIL", email_for(rng, rng.choice(PEOPLE["NL"]))).add("\"}'\n")
    return d


def t_code(rng: random.Random) -> Doc:
    n = negatives(rng)
    lang = rng.choice(["py", "js"])
    d = Doc().add("Refactor this function:\n\n")
    if lang == "py":
        d.add("import requests\n\nAPI_KEY = \"").pii("SECRET", SECRETS[rng.choice(["openai_key", "google_api_key", "huggingface_token"])](rng)).add("\"\n")
        d.add(f"CACHE_KEY = \"{n['sha256']}\"\n\ndef fetch(order_id={n['order']}):\n")
        d.add("    password = os.environ['DB_PASSWORD']\n    token: str = get_token()\n")
        d.add(f"    return requests.get(f'https://api.example.com/orders/{{order_id}}', timeout=30, headers={{'X-Request-Id': '{n['uuid']}'}})\n")
    else:
        d.add("const config = {\n  user: \"svc_reports\",\n  password: \"").pii("SECRET", SECRETS["password"](rng), "password").add("\",\n")
        d.add(f"  color: \"{n['hex']}\",\n  version: \"{n['version']}\",\n  buildId: \"{n['short_sha']}\",\n")
        d.add(f"  apiKey: process.env.API_KEY,\n  retries: 3,\n}};\n// see https://docs.example.com/{n['uuid']}\n")
    return d


def t_sql(rng: random.Random) -> Doc:
    d = Doc().add("Why does this insert fail with a constraint error?\n\n")
    id_name = rng.choice(list(ID_LABELS))
    d.add(f"INSERT INTO customers (id, full_name, email, {ID_KEYS[id_name]}, iban, created_at) VALUES\n")
    rows = rng.randint(1, 3)
    for i in range(rows):
        b = person_bundle(rng, id_name)
        n = negatives(rng)
        d.add(f"  ({n['order']}, '").pii("PERSON", b["person"]).add("', '").pii("EMAIL", b["email"]).add("', '")
        d.pii("NATIONAL_ID", b["id"], id_name).add("', '").pii("IBAN", b["iban"]).add(f"', '{n['iso']}')")
        d.add(",\n" if i < rows - 1 else ";\n")
    return d


def t_trace(rng: random.Random) -> Doc:
    n = negatives(rng)
    d = Doc().add("Getting this stack trace in production:\n\n")
    d.add(f"Traceback (most recent call last):\n  File \"/srv/app/{n['short_sha']}/worker.py\", line {rng.randint(10, 400)}, in run\n")
    d.add(f"    process(job_id=\"{n['uuid']}\")\n  File \"/srv/app/venv/lib/python3.13/site-packages/lib/core.py\", line {rng.randint(10, 999)}\n")
    d.add(f"ValueError: invoice {n['invoice']} total {n['amount']} does not match ledger entry {n['order']}\n")
    d.add(f"(at {n['iso']}, node {n['coords']}, checksum {n['sha256']})\n")
    if rng.random() < 0.4:
        d.add("Connection: redis://default:").pii("SECRET", SECRETS["password"](rng), "url_password").add("@cache.internal:6379/0\n")
    return d


EMAIL_LANG = {
    "en": ("Hi,\n\nplease help me reply to this customer.\n\n", "Name: ", "Email: ", "Phone: ", "Bank account: ", "Thanks!"),
    "fi": ("Moi,\n\nauta vastaamaan tälle asiakkaalle.\n\n", "Nimi: ", "Sähköposti: ", "Puhelin: ", "Tilinumero: ", "Kiitos!"),
    "de": ("Hallo,\n\nbitte hilf mir, diesem Kunden zu antworten.\n\n", "Name: ", "E-Mail: ", "Telefon: ", "Bankverbindung: ", "Danke!"),
    "fr": ("Bonjour,\n\naide-moi à répondre à ce client.\n\n", "Nom : ", "E-mail : ", "Téléphone : ", "Compte : ", "Merci !"),
    "sv": ("Hej,\n\nhjälp mig att svara den här kunden.\n\n", "Namn: ", "E-post: ", "Telefon: ", "Konto: ", "Tack!"),
    "nl": ("Hoi,\n\nhelp me deze klant te antwoorden.\n\n", "Naam: ", "E-mail: ", "Telefoon: ", "Rekening: ", "Bedankt!"),
    "es": ("Hola,\n\nayúdame a responder a este cliente.\n\n", "Nombre: ", "Correo: ", "Teléfono: ", "Cuenta: ", "¡Gracias!"),
    "it": ("Ciao,\n\naiutami a rispondere a questo cliente.\n\n", "Nome: ", "E-mail: ", "Telefono: ", "Conto: ", "Grazie!"),
    "pl": ("Cześć,\n\npomóż mi odpowiedzieć temu klientowi.\n\n", "Imię i nazwisko: ", "E-mail: ", "Telefon: ", "Numer konta: ", "Dzięki!"),
}  # fmt: skip
LANG_ID = {"en": "ie_ppsn", "fi": "fi_hetu", "de": "de_steuer_id", "fr": "fr_nir", "sv": "se_personnummer",
           "nl": "nl_bsn", "es": "es_dni", "it": "it_codice_fiscale", "pl": "pl_pesel"}  # fmt: skip


def t_email(rng: random.Random) -> Doc:
    lang = rng.choice(list(EMAIL_LANG))
    intro, l_name, l_mail, l_phone, l_acc, bye = EMAIL_LANG[lang]
    b = person_bundle(rng, LANG_ID[lang])
    n = negatives(rng)
    d = Doc().add(intro).add(l_name).pii("PERSON", b["person"]).add("\n").add(l_mail).pii("EMAIL", b["email"]).add("\n")
    d.add(l_phone).pii("PHONE", b["phone"]).add("\n").add(f"{b['id_label']}: ").pii("NATIONAL_ID", b["id"], b["id_name"]).add("\n")
    d.add(l_acc).pii("IBAN", b["iban"]).add(f"\nRef. {n['invoice']} / {n['amount']} / {n['date_eu']}\n")
    if rng.random() < 0.4:
        d.add("Card: ").pii("PAYMENT_CARD", rng.choice(TEST_CARDS)).add("\n")
    if rng.random() < 0.4:
        d.add("VAT: ").pii("VAT_ID", vat(rng)).add("\n")
    return d.add(f"\n{bye}")


def t_chat(rng: random.Random) -> Doc:
    """Unlabelled values in running text: the hard case."""
    b = person_bundle(rng)
    n = negatives(rng)
    d = Doc().add("My colleague ").pii("PERSON", b["person"]).add(" (").pii("EMAIL", b["email"]).add(") asked about order ")
    d.add(n["order"]).add(". Their number is ").pii("NATIONAL_ID", b["id"], b["id_name"]).add(" and they can be reached on ")
    d.pii("PHONE", b["phone"]).add(f". The tracking code is {n['tracking']} and the refund of {n['amount']} goes to ")
    d.pii("IBAN", b["iban"]).add(". Can you write a short apology?")
    return d


def t_business(rng: random.Random) -> Doc:
    """Negatives only: business text full of numbers that are not personal data."""
    n = negatives(rng)
    m = negatives(rng)
    return Doc().add(
        f"Summarise for the board: invoice {n['invoice']} ({n['amount']}) is overdue since {n['date_eu']}. "
        f"Order {n['order']} shipped with tracking {n['tracking']}; EAN {n['ean']}. Revenue EUR {rng.randint(1, 99)} {rng.randint(100, 999)} {rng.randint(100, 999)}, "
        f"growth {rng.randint(1, 40)},{rng.randint(0, 9)} %. Release {n['version']} ({n['short_sha']}) went live {n['iso']}. "
        f"Ticket {m['uuid']}, warehouse at {n['coords']}. Rejected payment from IBAN {n['bad_iban']} (check digits wrong) "
        f"and card {n['bad_card']} (declined). Contract no. {m['order']}, case {m['invoice']}, epoch {m['epoch']}."
    )


def t_invalid_ids(rng: random.Random) -> Doc:
    """Negatives: identifiers with a wrong check digit next to their labels."""
    names = rng.sample([k for k in ID_LABELS if k not in ("dk_cpr", "cz_rodne_cislo")], 3)  # no check digit
    d = Doc().add("These numbers were rejected by the registry, can you explain why?\n")
    for name in names:
        d.add(f"- {rng.choice(ID_LABELS[name])}: {invalid_id(rng, name)}\n")
    return d


TEMPLATES: dict[str, tuple[Callable[[random.Random], Doc], float]] = {
    "env": (t_env, 1.0), "log": (t_log, 1.0), "json": (t_json, 1.0), "csv": (t_csv, 0.8), "curl": (t_curl, 0.8),
    "code": (t_code, 0.9), "sql": (t_sql, 0.7), "trace": (t_trace, 0.8), "email": (t_email, 1.4), "chat": (t_chat, 1.0),
    "business": (t_business, 1.0), "invalid_ids": (t_invalid_ids, 0.6),
}  # fmt: skip


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=4242)
    ap.add_argument("--test-seed", type=int, default=20261020)
    ap.add_argument("--dev", type=int, default=300)
    ap.add_argument("--test", type=int, default=1500)
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    names = list(TEMPLATES)
    weights = [TEMPLATES[n][1] for n in names]
    for split, count, seed in (("dev", args.dev, args.seed), ("test", args.test, args.test_seed)):
        rng = random.Random(seed)
        with (out / f"{split}.jsonl").open("w", encoding="utf-8") as fh:
            for i in range(count):
                fmt = rng.choices(names, weights)[0]
                doc = TEMPLATES[fmt][0](rng)
                row = {"id": f"{split}-{i:05d}", "format": fmt, "text": doc.text, "spans": doc.spans}
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(split, count)


if __name__ == "__main__":
    main()
