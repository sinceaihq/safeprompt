# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-20

First public release.

### Added

- Detection engine in TypeScript, ported from EuroPII Guard 0.1.2: national IDs of 22 European countries, EU VAT
  numbers, IBANs, payment cards, phone numbers, e-mail and IP addresses, validated with check digits and birth dates.
- Secrets: documented API key and token formats, JSON Web Tokens, private key blocks, passwords in URLs, labelled
  assignments and authorization headers.
- Label handling for prompts: nearest label, field lines, CSV/TSV column headers, SQL `INSERT` columns, penalties
  for labels of other types and business numbers; exclusion of UUID and hash fragments.
- Chromium extension (Manifest V3): side panel workspace, paste and send checks on ChatGPT and Gemini (Claude
  opt-in, experimental), review dialog isolated from the page, numbered placeholders with local restore, custom
  terms, allow list, country hints, sensitivity levels, _Protect this site_ for other sites.
- Web demo, SafePrompt-Bench (synthetic prompt-shaped benchmark), validator parity tests against python-stdnum,
  Playwright end-to-end tests with replica chat pages, security review and reproducible build.
