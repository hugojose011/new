import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Booking, BookingStatus, EventQuestion, EventType, Prisma, User } from '@prisma/client';
import { DateTime } from 'luxon';
import { BookingConfirmationDto } from '@agenda/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { BookingTokensService } from './booking-tokens.service';
import { BookingConflictService } from './booking-conflict.service';
import { GoogleIntegrationService } from '../integrations/google/google-integration.service';
import { CALENDAR_PROVIDER, CalendarProvider } from '../integrations/calendar-provider';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import {
  BusinessRuleException,
  ERROR_CODES,
  IntegrationUnavailableException,
  SlotUnavailableException,
} from '../common/errors';
import { CancelBookingDto, CreateBookingDto, RescheduleBookingDto } from './dto/booking.dto';

type EventTypeWithRelations = EventType & { questions: EventQuestion[]; host: User };


@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly tokens: BookingTokensService,
    private readonly conflicts: BookingConflictService,
    private readonly google: GoogleIntegrationService,
    @Inject(CALENDAR_PROVIDER) private readonly calendar: CalendarProvider,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ==========================================================================
  // Criação
  // ==========================================================================

  /**
   * Fluxo de reserva (§34).
   *
   *   validar payload
   *   -> idempotência
   *   -> revalidar disponibilidade (inclusive Free/Busy do Google)
   *   -> criar Booking PENDING (a constraint de exclusão decide o vencedor)
   *   -> criar evento no Google (+ Meet)
   *   -> CONFIRMED
   *
   * Se o Google falhar, a reserva vai para FAILED — o que a remove do índice
   * parcial e libera o horário imediatamente — e o convidado recebe um erro
   * claro em vez de uma confirmação que não existe na agenda do host (§95).
   */
  async create(eventType: EventTypeWithRelations, dto: CreateBookingDto): Promise<BookingConfirmationDto> {
    if (!eventType.isActive || eventType.deletedAt) {
      throw new NotFoundException('Este tipo de evento não está disponível.');
    }

    // 1. Idempotência: mesma chave => mesma reserva, sem duplicar (§33).
    if (dto.idempotencyKey) {
      const existing = await this.prisma.booking.findUnique({
        where: {
          eventTypeId_idempotencyKey: {
            eventTypeId: eventType.id,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.status === 'FAILED') {
          // A tentativa anterior não completou; permite tentar de novo.
          await this.prisma.booking.update({
            where: { id: existing.id },
            data: { idempotencyKey: null },
          });
        } else {
          return this.toConfirmation(existing, eventType.host, null);
        }
      }
    }

    const start = this.parseStart(dto.start);
    const end = new Date(start.getTime() + eventType.durationMinutes * 60_000);
    const blockedStart = new Date(start.getTime() - eventType.bufferBeforeMinutes * 60_000);
    const blockedEnd = new Date(end.getTime() + eventType.bufferAfterMinutes * 60_000);

    const answers = this.validateAnswers(eventType.questions, dto.answers ?? []);

    // 2. Revalidação completa — nunca confiamos na lista exibida antes (§31).
    const available = await this.availability.isSlotAvailable({
      eventTypeId: eventType.id,
      start,
      viewerTimezone: dto.timezone,
    });
    if (!available) throw new SlotUnavailableException();

    // 3. A agenda de destino precisa existir antes de gravar qualquer coisa,
    //    para não deixar uma reserva órfã sem evento no Google (§83).
    const destination = (await this.requiresGoogle(eventType))
      ? await this.google.requireDestination(eventType.hostUserId)
      : null;

    const cancelToken = this.tokens.generate();
    const rescheduleToken = this.tokens.generate();

    // 4. Grava PENDING. Concorrência é resolvida pelo PostgreSQL.
    let booking: Booking;
    try {
      booking = await this.prisma.booking.create({
        data: {
          workspaceId: eventType.workspaceId,
          eventTypeId: eventType.id,
          hostUserId: eventType.hostUserId,
          inviteeName: dto.name,
          inviteeEmail: dto.email,
          inviteePhone: dto.phone ?? null,
          inviteeTimezone: dto.timezone,
          eventNameSnapshot: eventType.name,
          eventDurationSnapshot: eventType.durationMinutes,
          locationTypeSnapshot: eventType.locationType,
          locationValueSnapshot: eventType.locationValue,
          startAt: start,
          endAt: end,
          blockedStartAt: blockedStart,
          blockedEndAt: blockedEnd,
          status: 'PENDING',
          idempotencyKey: dto.idempotencyKey ?? null,
          cancelTokenHash: cancelToken.hash,
          rescheduleTokenHash: rescheduleToken.hash,
          googleCalendarId: destination?.calendarId ?? null,
          utmSource: dto.utm?.source ?? null,
          utmMedium: dto.utm?.medium ?? null,
          utmCampaign: dto.utm?.campaign ?? null,
          utmContent: dto.utm?.content ?? null,
          utmTerm: dto.utm?.term ?? null,
          answers: { create: answers },
          history: {
            create: { action: 'CREATED', newStartAt: start, newEndAt: end },
          },
        },
      });
    } catch (error) {
      this.conflicts.rethrow(error);
    }

    // 5. Evento no Google (fora da transação: chamada externa lenta não
    //    deve segurar locks no banco — §96).
    let meetUrl: string | null = null;
    if (destination) {
      try {
        const result = await this.calendar.createEvent(
          { connectionId: destination.connectionId, userId: eventType.hostUserId },
          {
            calendarId: destination.calendarId,
            summary: `${eventType.name} — ${dto.name}`,
            description: this.buildDescription(eventType, dto, booking!.id, answers),
            start,
            end,
            timezone: eventType.timezone,
            attendees: [{ email: dto.email, displayName: dto.name }],
            createMeet: eventType.locationType === 'GOOGLE_MEET',
            privateProperties: {
              bookingId: booking!.id,
              eventTypeId: eventType.id,
            },
            location: this.locationForCalendar(eventType),
            // O Google envia o convite; o nosso e-mail é complementar (§51).
            sendUpdates: true,
          },
        );
        meetUrl = result.meetUrl;

        booking = await this.prisma.booking.update({
          where: { id: booking!.id },
          data: {
            status: 'CONFIRMED',
            googleEventId: result.eventId,
            googleMeetUrl: result.meetUrl,
            syncError: null,
            history: { create: { action: 'CONFIRMED', newStartAt: start, newEndAt: end } },
          },
        });
      } catch (error) {
        await this.failBooking(booking!.id, error as Error);
        throw error instanceof IntegrationUnavailableException
          ? error
          : new IntegrationUnavailableException(
              ERROR_CODES.GOOGLE_UNAVAILABLE,
              'Não foi possível concluir o agendamento na agenda do host. Tente novamente.',
            );
      }
    } else {
      booking = await this.prisma.booking.update({
        where: { id: booking!.id },
        data: { status: 'CONFIRMED' },
      });
    }

    await this.audit.record({
      userId: eventType.hostUserId,
      workspaceId: eventType.workspaceId,
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: booking.id,
      metadata: { eventTypeId: eventType.id, startAt: start.toISOString() },
    });

    const confirmation = this.toConfirmation(booking, eventType.host, {
      cancel: cancelToken.token,
      reschedule: rescheduleToken.token,
    });

    await this.notifications.bookingConfirmed({
      eventName: booking.eventNameSnapshot,
      hostName: eventType.host.name,
      hostEmail: eventType.host.email,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      startAt: booking.startAt,
      endAt: booking.endAt,
      inviteeTimezone: booking.inviteeTimezone,
      hostTimezone: eventType.host.timezone,
      meetUrl,
      cancelUrl: confirmation.cancelUrl as string,
      rescheduleUrl: confirmation.rescheduleUrl as string,
    });

    return confirmation;
  }

  /**
   * Marca a reserva como FAILED. Como o índice parcial da constraint cobre
   * apenas PENDING/CONFIRMED, o horário volta a ficar livre na mesma operação.
   */
  private async failBooking(bookingId: string, error: Error): Promise<void> {
    this.logger.error(`Booking ${bookingId} falhou ao sincronizar com o Google: ${error.message}`);
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'FAILED',
        syncError: error.message.slice(0, 500),
        // Libera a chave de idempotência para permitir retry seguro (§95).
        idempotencyKey: null,
        history: { create: { action: 'FAILED', metadata: { reason: error.message.slice(0, 200) } } },
      },
    });
  }

  // ==========================================================================
  // Cancelamento
  // ==========================================================================

  async findByCancelToken(token: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { cancelTokenHash: this.tokens.hash(token) },
      include: { host: true, eventType: true },
    });
    if (!booking) throw new NotFoundException('Agendamento não encontrado.');
    return booking;
  }

  async findByRescheduleToken(token: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { rescheduleTokenHash: this.tokens.hash(token) },
      include: { host: true, eventType: { include: { questions: true } } },
    });
    if (!booking) throw new NotFoundException('Agendamento não encontrado.');
    return booking;
  }

  /** Cancelamento idempotente: cancelar duas vezes devolve o mesmo resultado. */
  async cancelByToken(token: string, dto: CancelBookingDto) {
    const booking = await this.findByCancelToken(token);

    if (booking.status === 'FAILED') {
      throw new BusinessRuleException(
        ERROR_CODES.BOOKING_ALREADY_CANCELLED,
        'Este agendamento não foi concluído e não precisa ser cancelado.',
      );
    }

    // A janela mínima vale para o convidado; o host cancela a qualquer momento.
    if (booking.status !== 'CANCELLED') {
      this.assertNoticeWindow(
        booking.startAt,
        booking.eventType.minimumCancellationNoticeMinutes,
        'cancelar',
      );
    }

    return this.cancelResolved(booking, dto, 'INVITEE');
  }

  // ==========================================================================
  // Reagendamento
  // ==========================================================================

  /**
   * Reagendamento (§37).
   *
   * O horário anterior só é liberado no commit do UPDATE: a mesma linha muda
   * de intervalo, e a constraint de exclusão valida o novo intervalo contra
   * as demais reservas. Não existe janela em que os dois horários estejam
   * livres nem em que ambos estejam ocupados.
   */
  async rescheduleByToken(token: string, dto: RescheduleBookingDto) {
    const booking = await this.findByRescheduleToken(token);

    if (booking.status === 'CANCELLED' || booking.status === 'FAILED') {
      throw new BusinessRuleException(
        ERROR_CODES.BOOKING_ALREADY_CANCELLED,
        'Este agendamento não está mais ativo.',
      );
    }

    this.assertNoticeWindow(
      booking.startAt,
      booking.eventType.minimumRescheduleNoticeMinutes,
      'reagendar',
    );

    const eventType = booking.eventType;
    const start = this.parseStart(dto.start);
    const end = new Date(start.getTime() + eventType.durationMinutes * 60_000);
    const blockedStart = new Date(start.getTime() - eventType.bufferBeforeMinutes * 60_000);
    const blockedEnd = new Date(end.getTime() + eventType.bufferAfterMinutes * 60_000);

    if (start.getTime() === booking.startAt.getTime()) {
      throw new BadRequestException('Escolha um horário diferente do atual.');
    }

    const available = await this.availability.isSlotAvailable({
      eventTypeId: eventType.id,
      start,
      viewerTimezone: dto.timezone,
      ignoreBookingId: booking.id, // a própria reserva não conflita consigo
    });
    if (!available) throw new SlotUnavailableException();

    const previous = { startAt: booking.startAt, endAt: booking.endAt };

    let updated: Booking;
    try {
      updated = await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          startAt: start,
          endAt: end,
          blockedStartAt: blockedStart,
          blockedEndAt: blockedEnd,
          inviteeTimezone: dto.timezone,
          rescheduledAt: new Date(),
          status: 'CONFIRMED',
          history: {
            create: {
              action: 'RESCHEDULED',
              oldStartAt: previous.startAt,
              oldEndAt: previous.endAt,
              newStartAt: start,
              newEndAt: end,
              metadata: { reason: dto.reason ?? null },
            },
          },
        },
      });
    } catch (error) {
      this.conflicts.rethrow(error);
    }

    // Atualiza o evento existente no Google, preservando o mesmo Meet.
    if (booking.googleEventId && booking.googleCalendarId) {
      const connection = await this.prisma.calendarConnection.findFirst({
        where: { userId: booking.hostUserId, status: 'CONNECTED' },
        orderBy: { createdAt: 'desc' },
      });

      if (connection) {
        try {
          await this.calendar.updateEvent(
            { connectionId: connection.id, userId: booking.hostUserId },
            {
              calendarId: booking.googleCalendarId,
              eventId: booking.googleEventId,
              start,
              end,
              timezone: eventType.timezone,
              sendUpdates: true,
            },
          );
        } catch (error) {
          // Compensação: volta o banco ao horário anterior para não divergir
          // da agenda do host. Se a reversão também falhar (alguém tomou o
          // horário antigo nesse intervalo), mantemos o novo horário e
          // registramos syncError para reconciliação manual.
          try {
            await this.prisma.booking.update({
              where: { id: booking.id },
              data: {
                startAt: previous.startAt,
                endAt: previous.endAt,
                blockedStartAt: booking.blockedStartAt,
                blockedEndAt: booking.blockedEndAt,
                rescheduledAt: booking.rescheduledAt,
              },
            });
          } catch (revertError) {
            this.logger.error(
              `Falha ao reverter reagendamento do booking ${booking.id}: ${(revertError as Error).message}`,
            );
            await this.prisma.booking.update({
              where: { id: booking.id },
              data: {
                syncError:
                  'Reagendado no sistema, mas o evento do Google não pôde ser atualizado.',
              },
            });
          }

          throw error instanceof IntegrationUnavailableException
            ? error
            : new IntegrationUnavailableException(
                ERROR_CODES.GOOGLE_UNAVAILABLE,
                'Não foi possível atualizar o evento na agenda do host. Tente novamente.',
              );
        }
      }
    }

    await this.audit.record({
      userId: booking.hostUserId,
      workspaceId: booking.workspaceId,
      action: 'BOOKING_RESCHEDULED',
      entityType: 'Booking',
      entityId: booking.id,
      metadata: { from: previous.startAt.toISOString(), to: start.toISOString() },
    });

    await this.notifications.bookingRescheduled(
      {
        eventName: booking.eventNameSnapshot,
        hostName: booking.host.name,
        hostEmail: booking.host.email,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        startAt: start,
        endAt: end,
        inviteeTimezone: dto.timezone,
        hostTimezone: booking.host.timezone,
        meetUrl: booking.googleMeetUrl,
        cancelUrl: '',
        rescheduleUrl: '',
      },
      previous,
    );

    return this.toConfirmation(updated!, booking.host, null);
  }

  // ==========================================================================
  // Consultas do host
  // ==========================================================================

  async listForHost(
    userId: string,
    filter: 'upcoming' | 'past' | 'cancelled' | 'all' = 'upcoming',
  ) {
    const now = new Date();
    const where: Prisma.BookingWhereInput = { hostUserId: userId };

    if (filter === 'upcoming') {
      where.status = { in: ['CONFIRMED', 'PENDING'] };
      where.endAt = { gte: now };
    } else if (filter === 'past') {
      where.status = { in: ['CONFIRMED', 'RESCHEDULED'] };
      where.endAt = { lt: now };
    } else if (filter === 'cancelled') {
      where.status = { in: ['CANCELLED', 'FAILED'] };
    }

    return this.prisma.booking.findMany({
      where,
      include: {
        eventType: { select: { id: true, name: true, slug: true } },
        answers: true,
      },
      orderBy: { startAt: filter === 'past' ? 'desc' : 'asc' },
      take: 200,
    });
  }

  async getForHost(userId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, hostUserId: userId },
      include: {
        eventType: true,
        answers: true,
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!booking) throw new NotFoundException('Agendamento não encontrado.');
    return booking;
  }

  /** Números do dashboard (§39). */
  async summaryForHost(userId: string) {
    const now = new Date();
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const zone = user.timezone;

    const startOfToday = DateTime.now().setZone(zone).startOf('day').toJSDate();
    const endOfToday = DateTime.now().setZone(zone).endOf('day').toJSDate();
    const endOfWeek = DateTime.now().setZone(zone).plus({ days: 7 }).endOf('day').toJSDate();

    const [today, next7Days, upcoming, connection] = await Promise.all([
      this.prisma.booking.count({
        where: {
          hostUserId: userId,
          status: 'CONFIRMED',
          startAt: { gte: startOfToday, lte: endOfToday },
        },
      }),
      this.prisma.booking.count({
        where: { hostUserId: userId, status: 'CONFIRMED', startAt: { gte: now, lte: endOfWeek } },
      }),
      this.prisma.booking.findMany({
        where: { hostUserId: userId, status: 'CONFIRMED', endAt: { gte: now } },
        include: { eventType: { select: { name: true } } },
        orderBy: { startAt: 'asc' },
        take: 5,
      }),
      this.prisma.calendarConnection.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      timezone: zone,
      todayCount: today,
      next7DaysCount: next7Days,
      upcoming,
      google: {
        status: connection?.status ?? null,
        accountEmail: connection?.accountEmail ?? null,
      },
    };
  }

  /** Cancelamento a partir do dashboard: exige ownership (§75). */
  async cancelAsHost(userId: string, bookingId: string, dto: CancelBookingDto) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, hostUserId: userId },
      include: { host: true, eventType: true },
    });
    if (!booking) throw new NotFoundException('Agendamento não encontrado.');
    if (booking.status === 'FAILED') {
      throw new BusinessRuleException(
        ERROR_CODES.BOOKING_ALREADY_CANCELLED,
        'Este agendamento não foi concluído.',
      );
    }
    return this.cancelResolved(booking, dto, 'HOST');
  }

  /**
   * Caminho único de cancelamento, usado tanto pelo link público quanto pelo
   * dashboard: remove o evento no Google, marca CANCELLED (liberando o
   * horário na constraint) e notifica as duas pontas.
   */
  private async cancelResolved(
    booking: Booking & { host: User; eventType: EventType },
    dto: CancelBookingDto,
    actor: 'INVITEE' | 'HOST',
  ) {
    // Idempotente: uma reserva já cancelada devolve o mesmo resultado.
    if (booking.status === 'CANCELLED') return this.toConfirmation(booking, booking.host, null);

    if (booking.googleEventId && booking.googleCalendarId) {
      const connection = await this.prisma.calendarConnection.findFirst({
        where: { userId: booking.hostUserId },
        orderBy: { createdAt: 'desc' },
      });
      if (connection) {
        try {
          await this.calendar.deleteEvent(
            { connectionId: connection.id, userId: booking.hostUserId },
            booking.googleCalendarId,
            booking.googleEventId,
            true,
          );
        } catch (error) {
          this.logger.warn(
            `Não foi possível remover o evento Google do booking ${booking.id}: ${(error as Error).message}`,
          );
        }
      }
    }

    const cancelled = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
        history: {
          create: {
            action: 'CANCELLED',
            oldStartAt: booking.startAt,
            oldEndAt: booking.endAt,
            metadata: { actor },
          },
        },
      },
    });

    await this.audit.record({
      userId: booking.hostUserId,
      workspaceId: booking.workspaceId,
      action: 'BOOKING_CANCELLED',
      entityType: 'Booking',
      entityId: booking.id,
      metadata: { actor },
    });

    await this.notifications.bookingCancelled(
      {
        eventName: booking.eventNameSnapshot,
        hostName: booking.host.name,
        hostEmail: booking.host.email,
        inviteeName: booking.inviteeName,
        inviteeEmail: booking.inviteeEmail,
        startAt: booking.startAt,
        endAt: booking.endAt,
        inviteeTimezone: booking.inviteeTimezone,
        hostTimezone: booking.host.timezone,
        meetUrl: booking.googleMeetUrl,
        cancelUrl: '',
        rescheduleUrl: '',
      },
      actor,
    );

    return this.toConfirmation(cancelled, booking.host, null);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * O Google é obrigatório quando o evento gera Meet ou quando o host tem uma
   * conexão ativa (ou seja, espera ver a reunião na própria agenda). Um host
   * que nunca conectou o Google continua recebendo agendamentos internos.
   */
  private async requiresGoogle(eventType: EventType): Promise<boolean> {
    if (eventType.locationType === 'GOOGLE_MEET') return true;
    const connections = await this.prisma.calendarConnection.count({
      where: { userId: eventType.hostUserId },
    });
    return connections > 0;
  }

  private parseStart(value: string): Date {
    const parsed = DateTime.fromISO(value, { setZone: true });
    if (!parsed.isValid) throw new BadRequestException('Horário inválido.');
    const date = parsed.toJSDate();
    // Slots nascem alinhados a minutos inteiros; segundos indicam payload forjado.
    if (date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) {
      throw new BadRequestException('Horário inválido.');
    }
    return date;
  }

  private assertNoticeWindow(startAt: Date, minimumMinutes: number, action: string): void {
    if (minimumMinutes <= 0) return;
    const limit = new Date(startAt.getTime() - minimumMinutes * 60_000);
    if (new Date() > limit) {
      const hours = Math.round(minimumMinutes / 60);
      throw new BusinessRuleException(
        ERROR_CODES.BOOKING_TOO_LATE,
        `Não é mais possível ${action} este agendamento (prazo mínimo de ${
          hours >= 1 ? `${hours}h` : `${minimumMinutes} minutos`
        }).`,
      );
    }
  }

  private validateAnswers(
    questions: EventQuestion[],
    answers: { questionId: string; answer: string }[],
  ) {
    const byId = new Map(questions.map((question) => [question.id, question]));
    const provided = new Map(answers.map((answer) => [answer.questionId, answer.answer.trim()]));

    for (const question of questions) {
      const value = provided.get(question.id);
      if (question.required && !value) {
        throw new BadRequestException(`Responda: "${question.label}".`);
      }
      if (
        value &&
        (question.type === 'SELECT' || question.type === 'RADIO') &&
        question.options.length > 0 &&
        !question.options.includes(value)
      ) {
        throw new BadRequestException(`Resposta inválida para "${question.label}".`);
      }
    }

    return answers
      .filter((answer) => byId.has(answer.questionId) && answer.answer.trim().length > 0)
      .map((answer) => ({
        questionId: answer.questionId,
        // Snapshot do enunciado: se a pergunta mudar, o histórico continua legível.
        questionLabelSnapshot: byId.get(answer.questionId)!.label,
        answer: answer.answer.trim(),
      }));
  }

  private buildDescription(
    eventType: EventType,
    dto: CreateBookingDto,
    bookingId: string,
    answers: { questionLabelSnapshot: string; answer: string }[],
  ): string {
    const lines = [
      `Agendamento via ${this.config.webUrl}`,
      '',
      `Convidado: ${dto.name}`,
      `E-mail: ${dto.email}`,
      ...(dto.phone ? [`Telefone: ${dto.phone}`] : []),
      `Fuso do convidado: ${dto.timezone}`,
    ];

    if (answers.length > 0) {
      lines.push('', 'Respostas:');
      for (const answer of answers) {
        lines.push(`- ${answer.questionLabelSnapshot}: ${answer.answer}`);
      }
    }

    lines.push('', `Identificador interno: ${bookingId}`);
    return lines.join('\n');
  }

  private locationForCalendar(eventType: EventType): string | null {
    switch (eventType.locationType) {
      case 'PHYSICAL':
        return eventType.locationValue;
      case 'CUSTOM_LINK':
        return eventType.locationValue;
      case 'PHONE':
        return eventType.locationValue ? `Telefone: ${eventType.locationValue}` : null;
      default:
        return null;
    }
  }

  private toConfirmation(
    booking: Booking,
    host: { name: string; timezone: string },
    tokens: { cancel: string; reschedule: string } | null,
  ): BookingConfirmationDto {
    return {
      id: booking.id,
      status: booking.status as BookingStatus,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      timezone: booking.inviteeTimezone,
      eventName: booking.eventNameSnapshot,
      hostName: host.name,
      inviteeName: booking.inviteeName,
      inviteeEmail: booking.inviteeEmail,
      locationType: booking.locationTypeSnapshot,
      locationValue: booking.locationValueSnapshot,
      meetUrl: booking.googleMeetUrl,
      // Os tokens em claro existem apenas no instante da criação.
      cancelUrl: tokens ? `${this.config.webUrl}/agendamento/cancelar/${tokens.cancel}` : null,
      rescheduleUrl: tokens
        ? `${this.config.webUrl}/agendamento/reagendar/${tokens.reschedule}`
        : null,
    };
  }
}
