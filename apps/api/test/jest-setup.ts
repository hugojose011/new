/**
 * Variáveis mínimas para os testes de integração.
 * Nenhum segredo real: as chaves aqui existem só dentro do processo de teste.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'segredo-de-teste-com-mais-de-32-caracteres!!';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? Buffer.alloc(32, 3).toString('base64');
process.env.ENCRYPTION_KEY_ID = 'v1';
process.env.WEB_URL = 'http://localhost:3000';
process.env.API_URL = 'http://localhost:3333';
process.env.AVAILABILITY_CACHE_TTL_SECONDS = '0';
process.env.EMAIL_PROVIDER = 'console';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres@127.0.0.1:5432/agenda_test';

// Os testes exercitam muitas requisições em sequência; o rate limit real é
// verificado em test/rate-limit.int-spec.ts, com limites próprios.
process.env.RATE_LIMIT_DEFAULT = process.env.RATE_LIMIT_DEFAULT ?? '100000';
process.env.RATE_LIMIT_AUTH = process.env.RATE_LIMIT_AUTH ?? '100000';
process.env.RATE_LIMIT_PUBLIC = process.env.RATE_LIMIT_PUBLIC ?? '100000';
process.env.RATE_LIMIT_BOOKING = process.env.RATE_LIMIT_BOOKING ?? '100000';
