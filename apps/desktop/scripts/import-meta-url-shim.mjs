// esbuild inject shim: gives the CJS bundle a working stand-in for import.meta.url
// (the server's env.ts uses it to locate the repo root — irrelevant when packaged, but it
// must not throw). __filename exists because the bundle output format is CJS.
import { pathToFileURL } from 'node:url';

export const __importMetaUrl = pathToFileURL(__filename).href;
