/** Bundled and launched only by probe-native-profile.mjs in a disposable profile. */
import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { loadOrCreateToken } from '../apps/desktop/src/tokenStore';
import { ConnectionsStore } from '../apps/server/src/connections/store';
import { windowsCredentials } from '../apps/desktop/src/windowsCredentials';

const [root, phase, host] = process.argv.slice(2);
app.setPath('userData', join(root, 'electron'));
void app.whenReady().then(() => {
  assert(safeStorage.isEncryptionAvailable(), 'OS encryption unavailable');
  const native = windowsCredentials(host);
  const tokenCodec = { ...native, prefix: 'os:dpapi:v1:', legacyDecrypt: (value: Buffer) => safeStorage.decryptString(value) };
  const codec = { id: 'windows-dpapi-v1', encrypt: (value: string) => native.encrypt(value).toString('base64'), decrypt: (value: string) => native.decrypt(Buffer.from(value, 'base64')),
    legacyDecoders: { 'electron-safe-storage-v1': (value: string) => safeStorage.decryptString(Buffer.from(value, 'base64')) } };
  const tokenPath = join(root, 'acc-token'); const connectionsPath = join(root, 'connections.json');
  if (phase === 'legacy') {
    writeFileSync(tokenPath, 'os:v1:' + safeStorage.encryptString('native-fixture-access-key').toString('base64'));
    writeFileSync(connectionsPath, JSON.stringify({ github: { value: safeStorage.encryptString('native-fixture-provider-key').toString('base64'), encoding: 'electron-safe-storage-v1', updatedTs: '2026-09-27T00:00:00.000Z' } }));
  }
  assert.equal(loadOrCreateToken(root, tokenCodec), 'native-fixture-access-key');
  assert(!readFileSync(tokenPath, 'utf8').includes('native-fixture-access-key'));
  if (phase === 'interrupt') process.exit(73); // crash between the two independent migrations
  const store = new ConnectionsStore(connectionsPath, undefined, codec);
  assert.equal(store.resolve('github'), 'native-fixture-provider-key');
  assert(!readFileSync(connectionsPath, 'utf8').includes('native-fixture-provider-key'));
  const original = readFileSync(connectionsPath, 'utf8');
  assert.throws(() => new ConnectionsStore(connectionsPath), /original OS key provider/);
  assert.throws(() => new ConnectionsStore(connectionsPath, undefined, { ...codec, decrypt() { throw new Error('locked'); } }));
  assert.equal(readFileSync(connectionsPath, 'utf8'), original);
  if (phase === 'reopen') {
    writeFileSync(connectionsPath, '{corrupt');
    assert.throws(() => new ConnectionsStore(connectionsPath, undefined, codec));
    assert.equal(readFileSync(connectionsPath, 'utf8'), '{corrupt');
    writeFileSync(connectionsPath, original);
  }
  console.log(JSON.stringify({ phase, electron: process.versions.electron, platform: process.platform, passed: true }));
  app.exit(0);
}).catch((error: Error) => { console.error(`Native profile fixture failed: ${error.message}`); app.exit(1); });
