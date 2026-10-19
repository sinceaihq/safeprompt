# Security Policy

## Reporting a vulnerability

**Use GitHub's private vulnerability reporting:**
**[Report a vulnerability](https://github.com/sinceaihq/safeprompt/security/advisories/new)**

If GitHub reporting is unavailable to you, email **builders@sinceai.fi**. Please do not open a public issue for a
suspected vulnerability, and never paste real personal data or real credentials into an issue.

We aim to acknowledge reports within a few working days. SafePrompt is maintained by a small team and we do not
promise a fixed remediation deadline.

## Scope

- **Leaks**: any way for a web page, another site or the network to obtain text that SafePrompt stopped or is
  reviewing; any network request made by the extension.
- **Bypasses of the checks** that a web page can trigger on purpose (as opposed to the documented limitations).
- **Permission or messaging flaws**: extension pages or background messages reachable from web pages.
- **Script injection** into extension pages.
- **Systematic misses** of a class of personal data or credentials written in a common way. Describe the format
  with a synthetic example.

Individual false alarms or misses are normal issues — please open a regular issue. See the
[security review](docs/SECURITY_REVIEW.md) for the threat model and known residual risks.
