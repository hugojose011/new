'use client';

import { use, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { AvailabilityResponseDto } from '@agenda/shared';
import { ApiError, apiFetch, messageForError } from '@/lib/api';
import { detectTimezone, formatDateLong, formatDateTimeLong, formatTime } from '@/lib/time';
import { MonthCalendar } from '@/components/month-calendar';
import { Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';

interface RescheduleView {
  id: string;
  status: string;
  eventName: string;
  startAt: string;
  timezone: string;
  hostName: string;
  hostUsername: string;
  eventType: { id: string; slug: string; name: string; durationMinutes: number };
}

export default function ReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const toast = useToast();
  const queryClient = useQueryClient();

  const [timezone] = useState(() => detectTimezone());
  const [month, setMonth] = useState(() => DateTime.now().setZone(detectTimezone()).startOf('month'));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const bookingQuery = useQuery({
    queryKey: ['booking-reschedule', token],
    queryFn: () => apiFetch<RescheduleView>(`/booking/reschedule/${token}`),
    retry: false,
  });

  const booking = bookingQuery.data;

  const rangeStart = useMemo(() => {
    const today = DateTime.now().setZone(timezone).startOf('day');
    const monthStart = month.startOf('month');
    return (monthStart > today ? monthStart : today).toISODate() as string;
  }, [month, timezone]);

  const availabilityQuery = useQuery({
    queryKey: ['reschedule-availability', token, rangeStart, month.month, timezone],
    enabled: Boolean(booking),
    queryFn: () =>
      apiFetch<AvailabilityResponseDto>(
        `/public/${booking!.hostUsername}/${booking!.eventType.slug}/availability`,
        {
          query: {
            startDate: rangeStart,
            endDate: month.endOf('month').toISODate() as string,
            timezone,
          },
        },
      ),
  });

  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    for (const day of availabilityQuery.data?.days ?? []) {
      if (day.slots.length > 0) dates.add(day.date);
    }
    return dates;
  }, [availabilityQuery.data]);

  const slots =
    availabilityQuery.data?.days.find((day) => day.date === selectedDate)?.slots ?? [];

  const reschedule = useMutation({
    mutationFn: (start: string) =>
      apiFetch<{ startAt: string }>(`/booking/reschedule/${token}`, {
        method: 'POST',
        body: JSON.stringify({ start, timezone }),
      }),
    onSuccess: (result) => setDone(result.startAt),
    onError: async (error) => {
      toast.show(messageForError(error), 'error');
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ['reschedule-availability'] });
      }
    },
  });

  if (bookingQuery.isLoading) return <Skeleton className="m-8 h-96" />;

  if (bookingQuery.isError || !booking) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-xl font-semibold text-ink-900">Agendamento não encontrado</h1>
        <p className="mt-2 text-sm text-ink-500">O link pode ter expirado ou já foi utilizado.</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <div className="card p-7 text-center">
          <h1 className="text-xl font-semibold text-ink-900">Agendamento reagendado</h1>
          <p className="mt-2 text-sm text-ink-600">
            Novo horário: {formatDateTimeLong(done, timezone)} ({timezone.replace(/_/g, ' ')}).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12">
      <div className="card p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-ink-900">Reagendar</h1>
        <p className="mt-2 text-sm text-ink-600">
          {booking.eventName} com {booking.hostName}
        </p>
        <p className="text-sm text-ink-500">
          Horário atual: {formatDateTimeLong(booking.startAt, timezone)}
        </p>

        <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_220px]">
          <MonthCalendar
            month={month}
            timezone={timezone}
            selectedDate={selectedDate}
            availableDates={availableDates}
            loading={availabilityQuery.isFetching}
            onMonthChange={(next) => {
              setMonth(next);
              setSelectedDate(null);
            }}
            onSelect={setSelectedDate}
          />

          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-800">
              {selectedDate
                ? formatDateLong(`${selectedDate}T12:00:00`, timezone)
                : 'Selecione um dia'}
            </h2>

            <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {slots.map((slot) => (
                <li key={slot.start}>
                  <button
                    type="button"
                    disabled={reschedule.isPending}
                    onClick={() => reschedule.mutate(slot.start)}
                    className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm font-semibold
                      text-ink-800 transition hover:border-ink-900 hover:bg-ink-900 hover:text-white"
                  >
                    {formatTime(slot.start, timezone)}
                  </button>
                </li>
              ))}
            </ul>

            {selectedDate && slots.length === 0 && (
              <p className="text-sm text-ink-500">Nenhum horário livre neste dia.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
