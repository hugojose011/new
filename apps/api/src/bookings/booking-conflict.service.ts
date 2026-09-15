import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SlotUnavailableException } from '../common/errors';

/**
 * Traduz violações da constraint de exclusão do PostgreSQL em 409.
 *
 * `bookings_no_overlap` é a última linha de defesa contra double booking:
 * mesmo com duas requisições concorrentes passando pela checagem de
 * disponibilidade ao mesmo tempo, apenas uma consegue gravar (§32).
 */
const EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class BookingConflictService {
  isOverlapViolation(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      const message = error.message ?? '';
      const meta = (error as Prisma.PrismaClientKnownRequestError).meta as
        | { code?: string }
        | undefined;
      return (
        meta?.code === EXCLUSION_VIOLATION ||
        message.includes(EXCLUSION_VIOLATION) ||
        message.includes('bookings_no_overlap')
      );
    }
    return false;
  }

  /** Converte a exceção do banco em 409 ou repassa o erro original. */
  rethrow(error: unknown): never {
    if (this.isOverlapViolation(error)) {
      throw new SlotUnavailableException();
    }
    throw error;
  }
}
