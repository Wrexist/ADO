/** Best-effort redaction is defense in depth, never permission to log credentials. */
export function redact(text: string, secrets: Array<string | undefined> = []): string {
  let result = text;
  for (const secret of secrets.filter((s): s is string => Boolean(s && s.length >= 4)).sort((a, b) => b.length - a.length)) {
    // Providers may return credentials in URLs or JSON-escaped error text.
    const forms = new Set([secret, JSON.stringify(secret).slice(1, -1), new URLSearchParams({ v: secret }).toString().slice(2)]);
    try { forms.add(encodeURIComponent(secret)); forms.add(encodeURI(secret)); } catch { /* malformed surrogate: exact form still redacted */ }
    for (const form of [...forms].sort((a, b) => b.length - a.length)) result = result.split(form).join('[redacted]');
  }
  return result.replace(/(Bearer\s+)[^\s"']+/gi, '$1[redacted]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9_]{12,}|github_pat_[a-zA-Z0-9_]{12,})/g, '[redacted]')
    .replace(/((?:token|password|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
}
