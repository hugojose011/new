import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailProvider } from '../notification.types';

/**
 * Implementação HTTP direta do Resend (sem SDK adicional).
 * Trocar de provedor significa escrever outra classe com esta interface —
 * o domínio não muda (§50).
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger('Email');

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.tag ? { tags: [{ name: 'category', value: message.tag }] } : {}),
      }),
    });

    if (!response.ok) {
      // Notificação não pode derrubar um agendamento já confirmado.
      this.logger.error(`Falha ao enviar e-mail (HTTP ${response.status}).`);
    }
  }
}
