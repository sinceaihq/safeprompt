# Testing

## Automated (run in CI)

| suite                | what                                                                                                                                                                       | command            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| unit                 | engine behaviour, labels and tables, secrets, redaction, documented example identifiers                                                                                    | `npm test`         |
| validator parity     | 43,469 generated identifiers compared with python-stdnum (through EuroPII Guard 0.1.2): valid and near-miss values for all 29 validators, every century sign and separator | `npm test`         |
| benchmark regression | precision/recall floors on the EuroPII benchmark test split and SafePrompt-Bench dev                                                                                       | `npm test`         |
| end-to-end           | the built extension in Chromium on replica chat pages                                                                                                                      | `npm run test:e2e` |

### Replica pages

The e2e tests cannot sign in to chat services, and must not send anything to them. Instead, Playwright intercepts
requests to `https://chatgpt.com`, `https://gemini.google.com` and `https://claude.ai` and answers with small replica
pages, so the content script runs at the real origins. The replicas use the same editors the sites use: a plain
`<textarea>` (ChatGPT's current signed-out composer), [ProseMirror](https://prosemirror.net) (ChatGPT's rich
composer and Claude) and [Quill](https://quilljs.com) (Gemini). "Sending" on a replica records the message in
`window.__sent`, so tests check that nothing is sent while a review is open and that SafePrompt never sends by
itself. All other network requests are aborted.

Covered: paste → review → paste sanitized / original / cancel; Enter and send button blocked → replace → user sends
sanitized; _Send unchanged_ lets the next send through; clean text is never interrupted; Escape cancels; the page's
own paste listener never sees a blocked paste; synthetic page events are ignored; removing the dialog does not block
later checks; the page cannot read the dialog; Claude is off by default; other sites are untouched; side panel
findings, toggles (mouse and keyboard), copy to clipboard, restore, settings persistence, nothing stored but settings.

## Live smoke test (manual, not in CI)

`scripts/live-smoke.spec.ts` opens the real, signed-out sites in Chromium with the extension, pastes a synthetic
identifier and an IBAN, checks that the review appears and cancels it. It never presses Enter or a send button.

| date       | site                                                   | result                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-19 | gemini.google.com (signed out, cookie banner rejected) | pass: message box found, paste stopped, review shown, cancel leaves the box empty                                                                                                                                                                       |
| 2026-10-19 | chatgpt.com                                            | not run: the site shows a bot check ("Just a moment…") to automated browsers. We do not try to get around it. The composer markup (a `<textarea aria-label="Chat with ChatGPT">`) was observed on the signed-out page and is reproduced in the replica. |
| —          | claude.ai                                              | not run: requires an account                                                                                                                                                                                                                            |

## Manual checklist for maintainers (real browser, own account)

Before a release, in a normal Chrome profile with the release zip loaded unpacked, on ChatGPT and Gemini (and
Claude if you switch it on):

1. The toolbar badge shows a green ✓ on the chat page; the side panel says "Protecting …".
2. Paste `henkilötunnus 131052-308T, IBAN FI21 1234 5600 0007 85` → review appears → _Paste sanitized_ → the box
   contains `<NATIONAL_ID_1>` and `<IBAN_1>`.
3. Type `mail me at anna@example.com` and press Enter → nothing is sent, review appears → _Replace in message_ →
   press Enter → the sanitized message is sent.
4. Repeat with the send button instead of Enter.
5. Type a clean message and press Enter → it is sent without a review.
6. In the side panel: _Check my draft in the chat_ reads the message box; _Insert into chat_ inserts text.

Record the date, browser version and result in this file.
