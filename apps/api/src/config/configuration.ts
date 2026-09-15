/**
 * Configuração tipada da aplicação.
 *
 * Todos os segredos vêm exclusivamente de variáveis de ambiente (§55).
 * A validação roda no boot: preferimos falhar cedo a subir com uma chave
 * ausente e só descobrir no primeiro agendamento.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  webUrl: string;
  apiUrl: string;
  jwtSecret: string;
  sessionTtlMinutes: number;
  encryptionKey: string;
  encryptionKeyId: string;
  legacyEncryptionKeys: Record<string, string>;
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    configured: boolean;
  };
  email: {
    provider: 'console' | 'resend';
    from: string;
    apiKey: string | null;
  };
  availabilityCacheTtlSeconds: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function parseLegacyKeys(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  return raw.split(',').reduce<Record<string, string>>((acc, entry) => {
    const [id, key] = entry.split(':');
    if (id && key) acc[id.trim()] = key.trim();
    return acc;
  }, {});
}

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];

  const jwtSecret = requireEnv('JWT_SECRET');
  if (jwtSecret.length < 32 && nodeEnv === 'production') {
    throw new Error('JWT_SECRET deve ter ao menos 32 caracteres em produção.');
  }

  const encryptionKey = requireEnv('ENCRYPTION_KEY');
  if (Buffer.from(encryptionKey, 'base64').length !== 32) {
    throw new Error('ENCRYPTION_KEY deve ser 32 bytes codificados em base64 (AES-256-GCM).');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? '';

  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 3333),
    webUrl: (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    apiUrl: (process.env.API_URL ?? 'http://localhost:3333').replace(/\/$/, ''),
    jwtSecret,
    sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 720),
    encryptionKey,
    encryptionKeyId: process.env.ENCRYPTION_KEY_ID ?? 'v1',
    legacyEncryptionKeys: parseLegacyKeys(process.env.ENCRYPTION_KEYS_LEGACY),
    google: {
      clientId,
      clientSecret,
      redirectUri,
      configured: Boolean(clientId && clientSecret && redirectUri),
    },
    email: {
      provider: (process.env.EMAIL_PROVIDER ?? 'console') as 'console' | 'resend',
      from: process.env.EMAIL_FROM ?? 'Agenda <no-reply@example.com>',
      apiKey: process.env.EMAIL_PROVIDER_API_KEY || null,
    },
    availabilityCacheTtlSeconds: Number(process.env.AVAILABILITY_CACHE_TTL_SECONDS ?? 20),
  };
}

export const APP_CONFIG = 'APP_CONFIG';
