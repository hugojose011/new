'use client';

import { use, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch, messageForError } from '@/lib/api';
import { formatDateTimeLong } from '@/lib/time';
import { Field, Skeleton } from '@/components/ui';

interface BookingView {
  id: string;
  status: string;
  eventName: string;
  startAt: string;
  endAt: string;
  timezone: string;
  hostName: string;
  inviteeName: string;
  canCancel: boolean;
}

export default function CancelBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['booking-cancel', token],
    queryFn: () => apiFetch<BookingView>(`/booking/cancel/${token}`),
    retry: false,
  });

  const cancel = useMutation({
    mutationFn: () =>
      apiFetch(`/booking/cancel/${token}`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || undefined }),
      }),
    onError: (err) => setError(messageForError(err)),
  });

  if (isLoading) return <Skeleton className="m-8 h-64" />;

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-xl font-semibold text-ink-900">Agendamento não encontrado</h1>
        <p className="mt-2 text-sm text-ink-500">O link pode ter expirado ou já foi utilizado.</p>
      </main>
    );
  }

  const cancelled = cancel.isSuccess || data.status === 'CANCELLED';

  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <div className="card p-7">
        {cancelled ? (
          <>
            <h1 className="text-xl font-semibold text-ink-900">Agendamento cancelado</h1>
            <p className="mt-2 text-sm text-ink-600">
              O horário foi liberado e o evento removido da agenda de {data.hostName}.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-ink-900">Cancelar agendamento</h1>
            <dl className="mt-5 space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-400">Evento</dt>
                <dd className="text-ink-900">{data.eventName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-400">Quando</dt>
                <dd className="text-ink-900">{formatDateTimeLong(data.startAt, data.timezone)}</dd>
                <dd className="text-xs text-ink-500">{data.timezone}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-400">Com</dt>
                <dd className="text-ink-900">{data.hostName}</dd>
              </div>
            </dl>

            <div className="mt-6">
              <Field label="Motivo (opcional)" htmlFor="reason">
                <textarea
                  id="reason"
                  className="input min-h-[80px]"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </div>

            {error && (
              <p className="mt-4 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className="btn-primary mt-6 w-full"
              onClick={() => {
                setError(null);
                cancel.mutate();
              }}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
