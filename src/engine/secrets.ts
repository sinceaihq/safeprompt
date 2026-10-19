// Credentials and access tokens.
//
// Only formats with a documented, distinctive structure (a fixed prefix,
// length and alphabet) are reported without context. Values after a label
// such as "password:" or "api_key=" are reported as well, because pasted
// configuration files and logs are a common way secrets reach chat apps.

import { STRONG, type Detector, type Span } from "./core";

// The label itself is the evidence, so these score between medium and strong.
const LABELLED = 0.65;
// "user:password@host" also looks like an e-mail address; the URL reading wins.
const URL_PASSWORD = 0.95;

export const SECRET = "SECRET";

const B = "(?<![A-Za-z0-9_-])";
const E = "(?![A-Za-z0-9_-])";

interface TokenFormat {
  name: string;
  pattern: string;
  description: string;
}

// Prefix formats published by the issuing services.
const TOKEN_FORMATS: TokenFormat[] = [
  { name: "aws_access_key", pattern: "(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}", description: "AWS access key ID" },
  { name: "github_token", pattern: "gh[pousr]_[A-Za-z0-9]{36,251}", description: "GitHub token" },
  { name: "github_pat", pattern: "github_pat_[A-Za-z0-9_]{60,255}", description: "GitHub fine-grained personal access token" },
  { name: "gitlab_token", pattern: "glpat-[A-Za-z0-9_-]{20,}", description: "GitLab personal access token" },
  { name: "slack_token", pattern: "xox[abposr]-[A-Za-z0-9-]{10,}", description: "Slack token" },
  { name: "stripe_key", pattern: "(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}", description: "Stripe secret or restricted key" },
  { name: "google_api_key", pattern: "AIza[0-9A-Za-z_-]{35}", description: "Google API key" },
  { name: "anthropic_key", pattern: "sk-ant-[a-z]+\\d*-[A-Za-z0-9_-]{32,}", description: "Anthropic API key" },
  { name: "openai_key", pattern: "sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}", description: "OpenAI-style secret key (sk-...)" },
  { name: "huggingface_token", pattern: "hf_[A-Za-z0-9]{34,}", description: "Hugging Face access token" },
  { name: "npm_token", pattern: "npm_[A-Za-z0-9]{36}", description: "npm access token" },
  { name: "pypi_token", pattern: "pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}", description: "PyPI API token" },
  { name: "sendgrid_key", pattern: "SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}", description: "SendGrid API key" },
  { name: "jwt", pattern: "eyJ[A-Za-z0-9_-]{8,}\\.eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}", description: "JSON Web Token" },
  { name: "azure_storage_key", pattern: "(?<=AccountKey=)[A-Za-z0-9+/]{86}==", description: "Azure storage account key" },
]; // prettier-ignore

const tokenDetectors: Detector[] = TOKEN_FORMATS.map((t) => ({
  name: t.name,
  entity: SECRET,
  pattern: new RegExp(`${B}${t.pattern}${E}`, "g"),
  strength: STRONG,
  description: t.description,
}));

const PRIVATE_KEY_RE =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----|$)/g;

// scheme://user:password@host — report the password only.
const URL_CREDENTIALS_RE = /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/]{1,128}:([^\s@/]{1,256})@[^\s@/]/gi;

function* urlPasswordFinder(text: string): Iterable<Span> {
  for (const m of text.matchAll(URL_CREDENTIALS_RE)) {
    const password = m[1];
    const start = m.index + m[0].length - 2 - password.length;
    if (!isPlaceholder(password)) yield [start, start + password.length];
  }
}

// Labels in English and the languages of the PII detectors.
const SECRET_LABELS = [
  "password", "passwd", "pwd", "pass", "passphrase", "secret", "client_secret", "client secret",
  "api_key", "api-key", "apikey", "api key", "access_key", "access key", "secret_key", "secret key",
  "token", "auth_token", "access_token", "refresh_token", "private_key", "pin",
  "salasana", "passwort", "kennwort", "mot de passe", "mdp", "contraseña", "clave", "wachtwoord",
  "hasło", "haslo", "lösenord", "losenord", "adgangskode", "passord", "senha", "heslo", "parola",
]; // prettier-ignore
const LABEL_ALTERNATIVES = SECRET_LABELS.map((w) => w.replace(/[ _-]/g, "[ _-]?")).join("|");
// LABEL [optional quotes] (: or =) [optional quotes] VALUE
const ASSIGNMENT_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:[A-Za-z0-9]+[_-])*(?:${LABEL_ALTERNATIVES})["']?\\s*(?:[:=]|:=|=>)\\s*["']?([^\\s"'\`,;]{4,256})`,
  "giu",
);
const BEARER_RE = /\b(?:Bearer|Basic|token)\s+([A-Za-z0-9._~+/-]{16,}=*)/g;

function isPlaceholder(value: string): boolean {
  const v = value.replace(/^["']|["']$/g, "");
  return (
    /^[<{[$%(]/.test(v) || // <PASSWORD>, ${VAR}, $VAR, {{ secret }}, %(x)s
    /^(.)\1*$/.test(v) || // ****, xxxx
    /^(?:x+|\*+|\.+|changeme|password|secret|example|null|none|true|false|undefined|redacted|hidden)$/i.test(v)
  );
}

/**
 * Does a labelled value look like a credential rather than prose or code?
 * "password: hunter2" yes; "password: click the link", "token: string",
 * "api_key = os.environ['KEY']" no.
 */
export function looksSecret(value: string): boolean {
  if (value.length < 6 || isPlaceholder(value)) return false;
  if (/^[A-Za-z_$][\w$]*(?:\.[\w$]+)*[([.]/.test(value)) return false; // code expression
  if (/^\p{Ll}+$/u.test(value) || /^\p{Lu}\p{Ll}+$/u.test(value)) return false; // a plain word
  return /\d/.test(value) || /[^\p{L}\p{N}]/u.test(value) || (/\p{Lu}/u.test(value) && /\p{Ll}/u.test(value));
}

function* assignmentFinder(text: string): Iterable<Span> {
  for (const m of text.matchAll(ASSIGNMENT_RE)) {
    const value = m[1];
    if (!looksSecret(value)) continue;
    const start = m.index + m[0].length - value.length;
    yield [start, start + value.length];
  }
}

function* bearerFinder(text: string): Iterable<Span> {
  for (const m of text.matchAll(BEARER_RE)) {
    const value = m[1];
    const start = m.index + m[0].length - value.length;
    yield [start, start + value.length];
  }
}

export const SECRET_DETECTORS: Detector[] = [
  ...tokenDetectors,
  { name: "private_key", entity: SECRET, pattern: PRIVATE_KEY_RE, strength: STRONG, description: "Private key block (PEM, OpenSSH, PGP)" },
  { name: "url_password", entity: SECRET, finder: urlPasswordFinder, strength: URL_PASSWORD, description: "Password inside a URL (scheme://user:password@host)" },
  { name: "auth_header", entity: SECRET, finder: bearerFinder, strength: STRONG, description: "Bearer, Basic or token credential after an authorization keyword" },
  { name: "labelled_secret", entity: SECRET, finder: assignmentFinder, strength: LABELLED, description: "Value assigned to a password, token or key label" },
]; // prettier-ignore
