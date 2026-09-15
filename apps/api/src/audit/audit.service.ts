import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  workspaceId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Registro de eventos relevantes (§59).
 *
 * Nunca recebe tokens ou conteúdo de eventos do Google — apenas identificadores
 * internos. Falhas de auditoria não derrubam a operação de negócio.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          workspaceId: entry.workspaceId ?? null,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao gravar auditoria "${entry.action}": ${(error as Error).message}`,
      );
    }
  }
}
