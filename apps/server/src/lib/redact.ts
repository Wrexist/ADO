/** Best-effort redaction is defense in depth, never permission to log credentials. */
export function redact(text: string, secrets: Array<string | undefined> = []): string {
  let result = text;
  for (const secret of secrets.filter((s): s is string => Boolean(s && s.length >= 4)).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join('[redacted]');
  }
  return result.replace(/(Bearer\s+)[^\s"']+/gi, '$1[redacted]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9_]{12,}|github_pat_[a-zA-Z0-9_]{12,})/g, '[redacted]')
    .replace(/((?:token|password|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');
}
