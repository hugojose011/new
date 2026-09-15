'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type {
  AvailabilityResponseDto,
  BookingConfirmationDto,
  PublicEventTypeDto,
} from '@agenda/shared';
import { apiFetch, messageForError, ApiError } from '@/lib/api';
import { detectTimezone, durationLabel, formatDateLong, formatTime } from '@/lib/time';
import { commonTimezones } from '@/lib/time';
import { MonthCalendar } from '@/components/month-calendar';
import { Skeleton, TimezonePicker } from '@/components/ui';
import { useToast } from '@/components/toast';
import { BookingForm } from './booking-form';
import { Confirmation } from './confirmation';

const LOCATION_LABELS: Record<string, string> = {
  GOOGLE_MEET: 'Google Meet',
  PHYSICAL: 'Presencial',
  CUSTOM_LINK: 'Link online',
  PHONE: 'Telefone',
  NONE: 'A combinar',
};

type Step = 'pick' | 'form' | 'done';

export function BookingFlow({
  eventType,
  username,
}: {
  eventType: PublicEventTypeDto;
  username: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [timezone, setTimezone] = useState(() => detectTimezone());
  const [month, setMonth] = useState(() => DateTime.now().setZone(detectTimezone()).startOf('month'));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [confirmation, setConfirmation] = useState<BookingConfirmationDto | null>(null);

  // Uma chave por tentativa de reserva: cliques duplos e retries de rede não
  // criam duas reservas (§33).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const rangeStart = useMemo(() => {
    const today = DateTime.now().setZone(timezone).startOf('day');
    const monthStart = month.startOf('month');
    return (monthStart > today ? monthStart : today).toISODate() as string;
  }, [month, timezone]);

  const rangeEnd = month.endOf('month').toISODate() as string;

  const availabilityQuery = useQuery({
    queryKey: ['availability', username, eventType.slug, timezone, rangeStart, rangeEnd],
    queryFn: () =>
      apiFetch<AvailabilityResponseDto>(
        `/public/${username}/${eventType.slug}/availability`,
        { query: { startDate: rangeStart, endDate: rangeEnd, timezone } },
      ),
  });

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    for (const day of availabilityQuery.data?.days ?? []) {
      if (day.slots.length > 0) dates.add(day.date);
    }
    return dates;
  }, [availabilityQuery.data]);

  const slots = useMemo(() => {
    if (!selectedDate) return [];
    return availabilityQuery.data?.days.find((day) => day.date === selectedDate)?.slots ?? [];
  }, [availabilityQuery.data, selectedDate]);

  const bookMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<BookingConfirmationDto>(`/public/${username}/${eventType.slug}/book`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, idempotencyKey }),
      }),
    onSuccess: (result) => {
      setConfirmation(result);
      setStep('done');
    },
    onError: async (error) => {
      toast.show(messageForError(error), 'error');

      if (error instanceof ApiError && error.status === 409) {
        // O horário foi tomado entre a listagem e o clique: volta para a
        // seleção com a lista já atualizada (§31).
        setSelectedSlot(null);
        setStep('pick');
        setIdempotencyKey(crypto.randomUUID());
        await queryClient.invalidateQueries({ queryKey: ['availability'] });
      }
    },
  });

  if (step === 'done' && confirmation) {
    return <Confirmation confirmation={confirmation} eventType={eventType} timezone={timezone} />;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-14">
      <div className="card overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          {/* Coluna esquerda: identidade do evento */}
          <aside className="border-b border-ink-200/70 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="text-sm font-medium text-ink-500">{eventType.host.name}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
              {eventType.name}
            </h1>

            <dl className="mt-6 space-y-3 text-sm text-ink-600">
              <div className="flex gap-2.5">
                <dt className="sr-only">Duração</dt>
                <dd>⏱ {durationLabel(eventType.durationMinutes)}</dd>
              </div>
              <div className="flex gap-2.5">
                <dt className="sr-only">Local</dt>
                <dd>📍 {LOCATION_LABELS[eventType.locationType]}</dd>
              </div>
              <div className="flex gap-2.5">
                <dt className="sr-only">Fuso horário</dt>
                <dd>🌐 Horários em {timezone.replace(/_/g, ' ')}</dd>
              </div>
            </dl>

            {eventType.description && (
              <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-ink-600">
                {eventType.description}
              </p>
            )}

            <div className="mt-8">
              <label className="label" htmlFor="tz">
                Fuso horário
              </label>
              <TimezonePicker
                id="tz"
                value={timezone}
                options={commonTimezones(timezone)}
                onChange={(value) => {
                  setTimezone(value);
                  setSelectedSlot(null);
                }}
              />
            </div>
          </aside>

          {/* Colunas central e direita */}
          {step === 'pick' ? (
            <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_220px]">
              <MonthCalendar
                month={month}
                timezone={timezone}
                selectedDate={selectedDate}
                availableDates={availableDates}
                loading={availabilityQuery.isFetching}
                onMonthChange={(next) => {
                  setMonth(next);
                  setSelectedDate(null);
                  setSelectedSlot(null);
                }}
                onSelect={(date) => {
                  setSelectedDate(date);
                  setSelectedSlot(null);
                }}
              />

              <div>
                <h2 className="mb-3 text-sm font-semibold text-ink-800">
                  {selectedDate
                    ? formatDateLong(`${selectedDate}T12:00:00`, timezone)
                    : 'Selecione um dia'}
                </h2>

                {availabilityQuery.isLoading && (
                  <div className="space-y-2">
                    {Array.from({ length: 6 }, (_, index) => (
                      <Skeleton key={index} className="h-11 w-full" />
                    ))}
                  </div>
                )}

                {availabilityQuery.isError && (
                  <p className="text-sm text-red-600" role="alert">
                    Não foi possível carregar os horários. Atualize a página.
                  </p>
                )}

                {!availabilityQuery.isLoading && selectedDate && slots.length === 0 && (
                  <p className="text-sm text-ink-500">Nenhum horário livre neste dia.</p>
                )}

                <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {slots.map((slot) => (
                    <li key={slot.start}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSlot(slot.start);
                          setStep('form');
                        }}
                        className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm
                          font-semibold text-ink-800 transition hover:border-ink-900 hover:bg-ink-900 hover:text-white"
                      >
                        {formatTime(slot.start, timezone)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="p-6 sm:p-8">
              <button
                type="button"
                className="btn-ghost mb-4 -ml-2 px-2"
                onClick={() => setStep('pick')}
              >
                ← Voltar
              </button>

              <p className="mb-6 text-sm text-ink-600">
                <strong className="font-semibold text-ink-900">
                  {selectedSlot && formatTime(selectedSlot, timezone)}
                </strong>{' '}
                · {selectedDate && formatDateLong(`${selectedDate}T12:00:00`, timezone)}
              </p>

              <BookingForm
                questions={eventType.questions}
                submitting={bookMutation.isPending}
                onSubmit={(values) =>
                  bookMutation.mutate({
                    ...values,
                    start: selectedSlot,
                    timezone,
                  })
                }
              />
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-ink-400">
        Horários exibidos em {timezone.replace(/_/g, ' ')}.
      </p>
    </main>
  );
}
