import { Inject, Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { EMAIL_PROVIDER, EmailProvider } from './notification.types';
import { APP_CONFIG, AppConfig } from '../config/configuration';

export interface BookingNotificationData {
  eventName: string;
  hostName: string;
  hostEmail: string;
  inviteeName: string;
  inviteeEmail: string;
  startAt: Date;
  endAt: Date;
  inviteeTimezone: string;
  hostTimezone: string;
  meetUrl: string | null;
  cancelUrl: string;
  rescheduleUrl: string;
}

/**
 * NotificationService desacoplado (§50).
 *
 * O domínio chama métodos de intenção ("reserva confirmada"), não um provedor.
 * Lembretes 24h/1h e follow-up entram aqui no futuro, atrás da mesma interface.
 *
 * Falhas de envio são registradas mas nunca propagadas: um e-mail que não saiu
 * não pode invalidar um agendamento já criado no banco e no Google.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async bookingConfirmed(data: BookingNotificationData): Promise<void> {
    const inviteeWhen = this.formatRange(data.startAt, data.endAt, data.inviteeTimezone);
    const hostWhen = this.formatRange(data.startAt, data.endAt, data.hostTimezone);

    await this.safeSend({
      to: data.inviteeEmail,
      subject: `Agendamento confirmado: ${data.eventName}`,
      tag: 'booking-confirmed',
      text: [
        `Olá, ${data.inviteeName}!`,
        '',
        `Seu agendamento com ${data.hostName} está confirmado.`,
        '',
        `Evento: ${data.eventName}`,
        `Quando: ${inviteeWhen}`,
        ...(data.meetUrl ? [`Google Meet: ${data.meetUrl}`] : []),
        '',
        `Reagendar: ${data.rescheduleUrl}`,
        `Cancelar: ${data.cancelUrl}`,
      ].join('\n'),
    });

    await this.safeSend({
      to: data.hostEmail,
      subject: `Novo agendamento: ${data.eventName} — ${data.inviteeName}`,
      tag: 'booking-confirmed-host',
      text: [
        `${data.inviteeName} (${data.inviteeEmail}) agendou um horário com você.`,
        '',
        `Evento: ${data.eventName}`,
        `Quando: ${hostWhen}`,
        ...(data.meetUrl ? [`Google Meet: ${data.meetUrl}`] : []),
      ].join('\n'),
    });
  }

  async bookingCancelled(data: BookingNotificationData, cancelledBy: 'INVITEE' | 'HOST'): Promise<void> {
    const when = this.formatRange(data.startAt, data.endAt, data.inviteeTimezone);
    const who = cancelledBy === 'HOST' ? data.hostName : data.inviteeName;

    await this.safeSend({
      to: data.inviteeEmail,
      subject: `Agendamento cancelado: ${data.eventName}`,
      tag: 'booking-cancelled',
      text: `O agendamento "${data.eventName}" de ${when} foi cancelado por ${who}.`,
    });

    await this.safeSend({
      to: data.hostEmail,
      subject: `Agendamento cancelado: ${data.eventName} — ${data.inviteeName}`,
      tag: 'booking-cancelled-host',
      text: `O agendamento com ${data.inviteeName} (${when}) foi cancelado.`,
    });
  }

  async bookingRescheduled(
    data: BookingNotificationData,
    previous: { startAt: Date; endAt: Date },
  ): Promise<void> {
    const before = this.formatRange(previous.startAt, previous.endAt, data.inviteeTimezone);
    const after = this.formatRange(data.startAt, data.endAt, data.inviteeTimezone);

    await this.safeSend({
      to: data.inviteeEmail,
      subject: `Agendamento reagendado: ${data.eventName}`,
      tag: 'booking-rescheduled',
      text: [
        `Seu agendamento "${data.eventName}" foi movido.`,
        '',
        `Antes: ${before}`,
        `Agora: ${after}`,
        ...(data.meetUrl ? ['', `Google Meet: ${data.meetUrl}`] : []),
        '',
        `Cancelar: ${data.cancelUrl}`,
      ].join('\n'),
    });

    await this.safeSend({
      to: data.hostEmail,
      subject: `Agendamento reagendado: ${data.eventName} — ${data.inviteeName}`,
      tag: 'booking-rescheduled-host',
      text: `${data.inviteeName} moveu o agendamento de ${before} para ${after}.`,
    });
  }

  private formatRange(start: Date, end: Date, timezone: string): string {
    const from = DateTime.fromJSDate(start, { zone: timezone }).setLocale('pt-BR');
    const to = DateTime.fromJSDate(end, { zone: timezone }).setLocale('pt-BR');
    return `${from.toFormat("cccc, dd 'de' LLLL 'de' yyyy, HH:mm")}–${to.toFormat('HH:mm')} (${timezone})`;
  }

  private async safeSend(message: Parameters<EmailProvider['send']>[0]): Promise<void> {
    try {
      await this.provider.send(message);
    } catch (error) {
      this.logger.error(`Falha ao notificar ${message.to}: ${(error as Error).message}`);
    }
  }
}
