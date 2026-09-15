import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailProvider } from '../notification.types';

/**
 * Provider padrão de desenvolvimento: registra a mensagem no log em vez de
 * enviar. Mantém o fluxo real da aplicação intacto sem exigir credenciais —
 * e deixa explícito no log que nada foi enviado de fato.
 */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger('Email');

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`[não enviado] para=${message.to} assunto="${message.subject}"`);
  }
}
