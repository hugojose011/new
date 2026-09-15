import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Tokens de cancelamento/reagendamento (§36).
 *
 * O link recebe um token aleatório de 32 bytes; o banco guarda apenas o
 * SHA-256 dele. Vazar um dump do banco não permite cancelar reservas, e o id
 * sequencial/UUID da reserva nunca aparece na URL pública.
 *
 * SHA-256 (e não Argon2) é adequado aqui: o segredo tem 256 bits de entropia
 * real, então não há espaço de busca para força bruta.
 */
@Injectable()
export class BookingTokensService {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
