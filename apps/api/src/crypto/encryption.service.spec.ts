import { EncryptionService } from './encryption.service';
import { AppConfig } from '../config/configuration';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    webUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:3333',
    jwtSecret: 'x'.repeat(40),
    sessionTtlMinutes: 60,
    encryptionKey: Buffer.alloc(32, 1).toString('base64'),
    encryptionKeyId: 'v1',
    legacyEncryptionKeys: {},
    google: { clientId: '', clientSecret: '', redirectUri: '', configured: false },
    email: { provider: 'console', from: 'a@b.c', apiKey: null },
    availabilityCacheTtlSeconds: 0,
    ...overrides,
  };
}

describe('EncryptionService', () => {
  it('faz round-trip de um segredo', () => {
    const service = new EncryptionService(makeConfig());
    const cipher = service.encrypt('refresh-token-secreto');
    expect(cipher).not.toContain('refresh-token-secreto');
    expect(service.decrypt(cipher)).toBe('refresh-token-secreto');
  });

  it('gera textos cifrados diferentes para o mesmo valor (IV aleatório)', () => {
    const service = new EncryptionService(makeConfig());
    expect(service.encrypt('abc')).not.toBe(service.encrypt('abc'));
  });

  it('falha se o texto cifrado for adulterado', () => {
    const service = new EncryptionService(makeConfig());
    const cipher = service.encrypt('abc');
    const parts = cipher.split('.');
    parts[3] = Buffer.from('outro').toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow();
  });

  it('decripta valores da chave antiga e regrava com a chave corrente', () => {
    const oldKey = Buffer.alloc(32, 7).toString('base64');
    const legacy = new EncryptionService(
      makeConfig({ encryptionKey: oldKey, encryptionKeyId: 'v1' }),
    );
    const cipherV1 = legacy.encrypt('token');

    const rotated = new EncryptionService(
      makeConfig({
        encryptionKey: Buffer.alloc(32, 9).toString('base64'),
        encryptionKeyId: 'v2',
        legacyEncryptionKeys: { v1: oldKey },
      }),
    );

    expect(rotated.decrypt(cipherV1)).toBe('token');
    const cipherV2 = rotated.rotate(cipherV1);
    expect(cipherV2.startsWith('v2.')).toBe(true);
    expect(rotated.decrypt(cipherV2)).toBe('token');
  });
});
