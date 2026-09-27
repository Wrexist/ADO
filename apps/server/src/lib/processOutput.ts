import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { redact } from './redact';

/** Keep draining even after rejecting a protocol stream. No readline accumulation
 * or unbounded async-iterator queue may keep an output-flooding writer alive. */
export function boundedLines(input: Readable, onFailure: () => void, frameLimit = 4 * 1024 * 1024, queueLimit = 8 * 1024 * 1024): AsyncIterable<string> {
  const decoder = new StringDecoder('utf8');
  let pending = ''; let queued = 0; let ended = false; let failure: Error | undefined;
  const lines: string[] = [];
  let wake: (() => void) | undefined;
  const notify = () => { wake?.(); wake = undefined; };
  const fail = (message: string) => {
    if (failure) return;
    failure = new Error(message); pending = ''; lines.length = 0; queued = 0;
    notify();
    try { onFailure(); } catch { /* consumer observes failure and requests stop again */ }
  };
  const accept = (text: string) => {
    if (failure || ended) return;
    pending += text;
    let end: number;
    while ((end = pending.indexOf('\n')) >= 0) {
      if (end > frameLimit) { fail('Process stdout frame exceeds the supported limit; output discarded'); return; }
      const line = pending.slice(0, end).replace(/\r$/, ''); pending = pending.slice(end + 1);
      queued += line.length;
      if (queued > queueLimit || lines.length >= 1024) { fail('Process stdout backlog exceeds the supported limit; output discarded'); return; }
      lines.push(line);
    }
    if (pending.length > frameLimit) fail('Process stdout frame exceeds the supported limit; output discarded');
    notify();
  };
  input.on('data', (chunk: Buffer) => accept(decoder.write(chunk)));
  input.on('error', () => { fail('Process stdout could not be read'); ended = true; notify(); });
  input.on('end', () => { accept(decoder.end()); if (pending && !failure) accept('\n'); ended = true; notify(); });
  input.on('close', () => { if (!ended) fail('Process stdout closed before EOF; output may be incomplete'); ended = true; notify(); });
  return { async *[Symbol.asyncIterator]() {
    try {
      for (;;) {
        if (failure) throw failure;
        const line = lines.shift();
        if (line !== undefined) { queued -= line.length; yield line; continue; }
        if (ended) return;
        await new Promise<void>((resolve) => { wake = resolve; });
      }
    } finally { ended = true; pending = ''; lines.length = 0; queued = 0; }
  } };
}

/** Redact complete bounded lines before retaining them. Oversized lines are
 * discarded in full so slicing cannot expose a partial credential. */
export function boundedDiagnostics(input: Readable, secrets: Array<string | undefined> = []) {
  const decoder = new StringDecoder('utf8');
  let pending = ''; let discarding = false; let truncated = false;
  const lines: string[] = []; let size = 0;
  const append = (line: string) => {
    const safe = redact(line, secrets).trimEnd();
    if (safe.length > 3500) { truncated = true; return; }
    while (size + safe.length + 1 > 3500 && lines.length) { size -= lines.shift()!.length + 1; truncated = true; }
    lines.push(safe); size += safe.length + 1;
  };
  const accept = (text: string) => {
    for (const part of text.split(/(?<=\n)/)) {
      const complete = part.endsWith('\n');
      if (!discarding) {
        if (pending.length + part.length > 8192) { pending = ''; discarding = true; truncated = true; }
        else pending += part;
      }
      if (complete) { if (!discarding) append(pending); pending = ''; discarding = false; }
    }
  };
  input.on('data', (chunk: Buffer) => accept(decoder.write(chunk)));
  input.on('end', () => { accept(decoder.end()); if (pending && !discarding) append(pending); pending = ''; });
  input.on('error', () => { truncated = true; });
  return () => (truncated ? '[diagnostics truncated: output was discarded]\n' : '') + lines.join('\n');
}
