# Launch material (drafts — not posted automatically)

Facts to keep consistent everywhere: free, Apache-2.0, local (no server, no account, no network requests), Chromium
browsers, unpacked install from the GitHub release (not in the Chrome Web Store yet), paste and send checks on
ChatGPT and Gemini (Claude experimental, opt-in), 22 countries' national IDs + EU VAT + IBAN validated by checksum,
secrets, does **not** detect names or addresses. Benchmark numbers are on synthetic data written by the same team.

## One-liner

SafePrompt: a free, local browser extension that checks what you paste into ChatGPT or Gemini for personal data and
API keys — with European ID numbers validated by checksum — and gives you a sanitized version to send.

## Show HN / Reddit (r/privacy, r/europrivacy, r/LocalLLaMA where on-topic)

**Title:** SafePrompt – check AI prompts for personal data and secrets, locally (open source)

We kept seeing colleagues paste customer e-mails, spreadsheets and `.env` files into chat assistants. SafePrompt is a
small Chromium extension that checks text when you paste it into ChatGPT or Gemini (or before you press send), shows
what it found, and lets you replace values with placeholders like `<IBAN_1>` that you can restore in the answer later.

What may be different from similar tools:

- National ID numbers of 22 European countries, EU VAT numbers and IBANs are validated with their check digits and
  birth dates, so order numbers and barcodes don't trigger it. On our synthetic benchmark of prompt-shaped text
  (logs, JSON, CSV, SQL, e-mails) it flagged 1 of 299 clean documents; a general-purpose PII library flagged 177.
  (Synthetic data, written by us — the caveats are in the repo.)
- It understands spreadsheet column headers, JSON keys and SQL inserts as labels.
- Everything runs in the browser; no server, no account, no network requests. The review dialog is isolated from the
  chat page so the page's scripts can't read it.

Limits: it doesn't detect names or addresses; it isn't in the Chrome Web Store yet (unpacked install); Claude support is
experimental. Feedback on false alarms and misses is very welcome.

Repo: https://github.com/sinceaihq/safeprompt · Demo in the browser: https://huggingface.co/spaces/sinceaihq/safeprompt-demo

## Hugging Face post

New from Since AI: **SafePrompt-Bench** — 1,800 synthetic prompt-shaped documents (.env files, logs, JSON, CSV, curl,
code, SQL, e-mails in 9 languages) with annotated personal data and secrets, and plenty of look-alikes. Built to
evaluate SafePrompt, our local prompt checker; results for EuroPII Guard and Presidio included.
https://huggingface.co/datasets/sinceaihq/safeprompt-bench · demo: https://huggingface.co/spaces/sinceaihq/safeprompt-demo

## University / research groups (e-mail template)

Subject: Open benchmark and tool for personal data in LLM prompts (European identifiers)

We have released SafePrompt, an open-source browser extension that detects personal data and credentials in text
before it is sent to AI chat services, and SafePrompt-Bench, a synthetic benchmark of prompt-shaped documents. The
detection engine validates 22 European national ID schemes, EU VAT numbers and IBANs by checksum; the benchmark
reports precision/recall against Presidio and our earlier EuroPII Guard. If your group works on data protection,
LLM safety or document privacy, we would value feedback, failure cases, and collaboration on evaluation with real
(lawfully usable) data. Links: … — Since AI ry, Finland.

## Product Hunt (later, once in the Chrome Web Store)

Do not launch on Product Hunt before a store listing exists: an unpacked install is too much friction for that audience.
