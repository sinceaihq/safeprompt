# Related tools

SafePrompt builds on, and sits next to, other good work. This page is meant to help you choose; it was written in
October 2026 and tools change — corrections are welcome.

| tool                                                                                               | what it is                                                                                                     | where text is processed | European national IDs                                       |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| [Microsoft Presidio](https://github.com/data-privacy-stack/presidio) (MIT)                         | Python library and service for PII detection and anonymisation, with NLP-based names and locations             | your server             | recognizers for a few countries (FI, SE, DE, ES, IT, PL, …) |
| [EuroPII Guard](https://github.com/sinceaihq/europii-guard) (Apache-2.0)                           | our Python library; SafePrompt's engine is a port of it                                                        | your machine            | 22 countries, checksum-validated                            |
| [DFKI Privacy Guardrail](https://github.com/dfki-dsa/pii-guardrail-browser-extension) (Apache-2.0) | research browser extension with a Rust/WASM engine and an optional NER model; restores placeholders in replies | your browser            | mostly via the NER model                                    |
| [PasteGuard](https://github.com/sgasser/pasteguard) (Apache-2.0)                                   | self-hosted proxy that masks data before it reaches an LLM API                                                 | your server             | via python-stdnum (IBAN, VAT)                               |
| [LLM Guard](https://github.com/protectai/llm-guard) (MIT; archived)                                | input/output scanners for LLM applications                                                                     | your server             | few                                                         |
| [gitleaks](https://github.com/gitleaks/gitleaks) (MIT)                                             | secret scanner for repositories and files                                                                      | your machine            | —                                                           |
| commercial browser extensions and enterprise DLP                                                   | various; several process text in the vendor's cloud or require an account                                      | varies                  | varies                                                      |

When to use what:

- **You are a person using chat assistants** and want a check before sending: SafePrompt.
- **You build an application** that sends user text to an LLM: a server-side library such as Presidio (names,
  addresses) combined with EuroPII Guard (European identifiers), or a proxy such as PasteGuard.
- **You need names and addresses detected**: an NER-based tool (Presidio, DFKI Privacy Guardrail). SafePrompt does
  not detect them yet; see [the NER evaluation](../eval/ner/README.md) for what we measured.
- **You scan code and repositories for credentials**: gitleaks or similar; SafePrompt's secret detection is meant
  for text you are about to paste, not for repositories.
