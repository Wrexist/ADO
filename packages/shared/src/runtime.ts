export const CONTROL_OS_RUNTIME = 'Node 22.18+ (22.x) or 24.11+';

export function supportsControlOSRuntime(version: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  const [major, minor] = version.split('.').map(Number);
  return (major === 22 && minor >= 18) || (major === 24 && minor >= 11) || major > 24;
}
