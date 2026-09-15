import request from 'supertest';
import { createTestApp, resetDatabase, TestContext } from './utils/test-app';

/**
 * O rate limit (§57) é verificado com limites próprios, porque os demais
 * testes rodam com os limites afrouxados para exercitar muitos fluxos.
 */
describe('Rate limiting', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    // Os limites são lidos a cada requisição, então basta ajustar o ambiente.
    process.env.RATE_LIMIT_AUTH = '3';
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
    process.env.RATE_LIMIT_AUTH = '100000';
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  it('bloqueia tentativas repetidas de login com 429', async () => {
    const attempt = () =>
      request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ninguem@exemplo.com', password: 'senha-errada-123' });

    const statuses: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses).toContain(401); // primeiras tentativas são avaliadas
    expect(statuses).toContain(429); // depois o limite entra em ação
    expect(statuses[statuses.length - 1]).toBe(429);
  });
});
