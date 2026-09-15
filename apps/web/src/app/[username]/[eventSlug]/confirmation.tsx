'use client';

import { DateTime } from 'luxon';
import type { BookingConfirmationDto, PublicEventTypeDto } from '@agenda/shared';
import { formatDateTimeLong } from '@/lib/time';

/** Link "Adicionar à agenda" para quem não usa Google Calendar. */
function googleCalendarLink(confirmation: BookingConfirmationDto): string {
  const format = (iso: string) =>
    DateTime.fromISO(iso).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: confirmation.eventName,
    dates: `${format(confirmation.startAt)}/${format(confirmation.endAt)}`,
    details: confirmation.meetUrl ? `Google Meet: ${confirmation.meetUrl}` : '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function Confirmation({
  confirmation,
  eventType,
  timezone,
}: {
  confirmation: BookingConfirmationDto;
  eventType: PublicEventTypeDto;
  timezone: string;
}) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-14">
      <div className="card p-8 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl"
          aria-hidden
        >
          ✓
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">
          Agendamento confirmado
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Enviamos os detalhes para {confirmation.inviteeEmail}.
        </p>

        <dl className="mt-8 space-y-4 text-left">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Evento</dt>
            <dd className="text-[15px] text-ink-900">{confirmation.eventName}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Quando</dt>
            <dd className="text-[15px] text-ink-900">
              {formatDateTimeLong(confirmation.startAt, timezone)}
            </dd>
            <dd className="text-xs text-ink-500">{timezone.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">Com</dt>
            <dd className="text-[15px] text-ink-900">{eventType.host.name}</dd>
          </div>
          {confirmation.meetUrl && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">
                Google Meet
              </dt>
              <dd>
                <a
                  className="text-[15px] font-medium text-brand-700 underline underline-offset-4"
                  href={confirmation.meetUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {confirmation.meetUrl}
                </a>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <a
            className="btn-secondary flex-1"
            href={googleCalendarLink(confirmation)}
            target="_blank"
            rel="noreferrer"
          >
            Adicionar à agenda
          </a>
          {confirmation.rescheduleUrl && (
            <a className="btn-secondary flex-1" href={confirmation.rescheduleUrl}>
              Reagendar
            </a>
          )}
          {confirmation.cancelUrl && (
            <a className="btn-ghost flex-1" href={confirmation.cancelUrl}>
              Cancelar
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
