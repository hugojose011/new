'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { apiFetch, messageForError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { formatDateTimeLong } from '@/lib/time';
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';

interface BookingRow {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'FAILED';
  startAt: string;
  endAt: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteePhone: string | null;
  inviteeTimezone: string;
  googleMeetUrl: string | null;
  eventType: { id: string; name: string; slug: string };
  answers: { questionLabelSnapshot: string; answer: string }[];
}

const FILTERS = [
  { key: 'upcoming', label: 'Próximos' },
  { key: 'past', label: 'Passados' },
  { key: 'cancelled', label: 'Cancelados' },
  { key: 'all', label: 'Todos' },
] as const;

const STATUS_LABEL: Record<BookingRow['status'], string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  RESCHEDULED: 'Reagendado',
  FAILED: 'Falhou',
};

export default function BookingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('upcoming');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', filter],
    queryFn: () => apiFetch<BookingRow[]>('/bookings', { query: { filter } }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: async () => {
      toast.show('Agendamento cancelado.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const timezone = user?.timezone ?? 'America/Sao_Paulo';

  return (
    <>
      <PageHeader title="Agendamentos" description={`Horários no seu fuso: ${timezone}`} />

      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtro">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={clsx(
              'rounded-xl px-3.5 py-2 text-sm font-medium transition',
              filter === item.key ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 hover:bg-ink-100',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <EmptyState
          title="Nada por aqui"
          description="Quando alguém reservar um horário, o agendamento aparece nesta lista."
        />
      )}

      {!isLoading && data && data.length > 0 && (
        <ul className="card divide-y divide-ink-200/70">
          {data.map((booking) => (
            <li key={booking.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink-900">{booking.inviteeName}</p>
                    <Badge
                      tone={
                        booking.status === 'CONFIRMED'
                          ? 'success'
                          : booking.status === 'CANCELLED' || booking.status === 'FAILED'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {STATUS_LABEL[booking.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-600">{booking.eventType.name}</p>
                  <p className="text-sm text-ink-500">
                    {formatDateTimeLong(booking.startAt, timezone)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {booking.googleMeetUrl && (
                    <a
                      href={booking.googleMeetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary px-3 py-1.5 text-sm"
                    >
                      Meet
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1.5 text-sm"
                    onClick={() => setExpanded(expanded === booking.id ? null : booking.id)}
                    aria-expanded={expanded === booking.id}
                  >
                    {expanded === booking.id ? 'Ocultar' : 'Detalhes'}
                  </button>
                  {(booking.status === 'CONFIRMED' || booking.status === 'PENDING') && (
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      onClick={() => cancel.mutate(booking.id)}
                      disabled={cancel.isPending}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {expanded === booking.id && (
                <dl className="mt-4 grid gap-3 rounded-xl bg-ink-50 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink-400">E-mail</dt>
                    <dd className="text-ink-800">{booking.inviteeEmail}</dd>
                  </div>
                  {booking.inviteePhone && (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-ink-400">Telefone</dt>
                      <dd className="text-ink-800">{booking.inviteePhone}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-ink-400">
                      Fuso do convidado
                    </dt>
                    <dd className="text-ink-800">{booking.inviteeTimezone}</dd>
                  </div>
                  {booking.answers.map((answer) => (
                    <div key={answer.questionLabelSnapshot} className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-ink-400">
                        {answer.questionLabelSnapshot}
                      </dt>
                      <dd className="text-ink-800">{answer.answer}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
