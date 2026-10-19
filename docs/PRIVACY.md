# Privacy

SafePrompt exists to keep personal data out of places it should not go, so it is built to handle that data as
little as possible.

## What happens to your text

| situation                                                | where the text goes                                                                                                                        | how long it is kept                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| You type or paste into the side panel                    | the side panel page (extension)                                                                                                            | until you close the panel                                                                                                                                                           |
| You paste into a chat site's message box                 | the content script reads the clipboard text from the paste event, stops the event and passes the text to the extension's background worker | in `chrome.storage.session` (memory only, never written to disk) until you choose; then deleted. Abandoned reviews are deleted after 10 minutes or when the tab closes              |
| You press send on a chat site                            | the content script reads the message box (which the site can already read)                                                                 | as above if a review opens; if you choose _Send unchanged_, the text is remembered in the content script's memory so the next send is not stopped again, until the page is reloaded |
| _Restore an AI answer_                                   | placeholder → value table in the side panel's memory                                                                                       | until you close the panel                                                                                                                                                           |
| Settings (countries, custom words, allow list, switches) | `chrome.storage.local`                                                                                                                     | until you change them or remove the extension. Not synced to your Google account                                                                                                    |

SafePrompt never sends a message for you, never uploads anything, and makes no network requests. There is no
server, no account, no analytics, no crash reporting and no remote configuration.

## What the chat site can see

- A paste that SafePrompt stops never reaches the page: SafePrompt's listeners are registered before any of the
  page's scripts run and stop the event before others receive it.
- While a review is open, the page can see that an element exists on top of it, but not its content: the dialog is
  an extension page in a frame inside a closed shadow root, and the browser's same-origin policy keeps the page out.
- Whatever you then insert or send — the sanitized or, if you choose so, the original text — is of course visible to
  the site, as is anything you type into the message box yourself.

## Clipboard

_Copy sanitized_ writes the sanitized text to the system clipboard, where other applications (clipboard managers,
remote desktop tools) may read it. SafePrompt does not read the clipboard except from a paste event you started.

## Permissions

| permission                                                           | why                                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| access to chatgpt.com, chat.openai.com, gemini.google.com, claude.ai | check pastes and messages there (Claude only if you switch it on)       |
| `sidePanel`                                                          | the workspace                                                           |
| `storage`                                                            | your settings, and pending reviews in memory                            |
| `scripting`                                                          | run the checks on sites you add yourself with _Protect this site_       |
| `activeTab`                                                          | know which site the side panel is next to, to offer _Protect this site_ |
| optional: other `https://` sites                                     | asked for one site at a time, only when you choose _Protect this site_  |

## What SafePrompt is not

SafePrompt is a privacy aid. It does not make data anonymous, does not decide what is lawful to share and does not
make any processing compliant with the GDPR or other law. It can miss sensitive data and can flag harmless data.
