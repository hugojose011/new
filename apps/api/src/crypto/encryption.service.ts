import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config/configuration';

/**
 * EncryptionService — AES-256-GCM para segredos em repouso (§56).
 *
 * Formato do texto cifrado: `<keyId>.<iv>.<authTag>.<payload>` (tudo base64url).
 * O prefixo com o id da chave permite rotação: chaves antigas continuam em
 * ENCRYPTION_KEYS_LEGACY e conseguem decriptar registros anteriores, enquanto
 * tudo que é gravado usa a chave corrente.
 */
@Injectable()
export class EncryptionService {
  private readonly keys: Map<string, Buffer>;
  private readonly currentKeyId: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.currentKeyId = config.encryptionKeyId;
    this.keys = new Map<string, Buffer>();
    this.keys.set(config.encryptionKeyId, Buffer.from(config.encryptionKey, 'base64'));
    for (const [id, key] of Object.entries(config.legacyEncryptionKeys)) {
      this.keys.set(id, Buffer.from(key, 'base64'));
    }
  }

  encrypt(plaintext: string): string {
    const key = this.keys.get(this.currentKeyId);
    if (!key) throw new Error('Chave de criptografia corrente não configurada.');

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const payload = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      this.currentKeyId,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      payload.toString('base64url'),
    ].join('.');
  }

  decrypt(ciphertext: string): string {
    const [keyId, iv, authTag, payload] = ciphertext.split('.');
    if (!keyId || !iv || !authTag || !payload) {
      throw new Error('Texto cifrado em formato inválido.');
    }
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Chave de criptografia "${keyId}" não está disponível.`);

    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Reescreve um segredo com a chave corrente (usado em rotação de chaves). */
  rotate(ciphertext: string): string {
    return this.encrypt(this.decrypt(ciphertext));
  }
}
