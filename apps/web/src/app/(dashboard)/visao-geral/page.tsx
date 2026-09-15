'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { formatDateTimeLong } from '@/lib/time';
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui';

interface Summary {
  timezone: string;
  todayCount: number;
  next7DaysCount: number;
  upcoming: {
    id: string;
    startAt: string;
    inviteeName: string;
    googleMeetUrl: string | null;
    eventType: { name: string };
  }[];
  google: { status: string | null; accountEmail: string | null };
}

export default function OverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['summary'],
    queryFn: () => apiFetch<Summary>('/bookings/summary'),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  const googleTone =
    data.google.status === 'CONNECTED'
      ? 'success'
      : data.google.status === 'REAUTH_REQUIRED'
        ? 'warning'
        : 'danger';

  return (
    <>
      <PageHeader title="Visão geral" description={`Fuso do painel: ${data.timezone}`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Hoje</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900">{data.todayCount}</p>
          <p className="text-sm text-ink-500">
            {data.todayCount === 1 ? 'reunião' : 'reuniões'}
          </p>
        </div>

        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Próximos 7 dias</p>
          <p className="mt-2 text-3xl font-semibold text-ink-900">{data.next7DaysCount}</p>
          <p className="text-sm text-ink-500">reuniões agendadas</p>
        </div>

        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Google Agenda</p>
          <div className="mt-3">
            <Badge tone={googleTone}>
              {data.google.status === 'CONNECTED'
                ? 'Conectado'
                : data.google.status === 'REAUTH_REQUIRED'
                  ? 'Precisa reconectar'
                  : 'Não conectado'}
            </Badge>
          </div>
          {data.google.accountEmail && (
            <p className="mt-2 truncate text-xs text-ink-500">{data.google.accountEmail}</p>
          )}
          {data.google.status !== 'CONNECTED' && (
            <Link href="/integracoes" className="mt-3 inline-block text-sm font-medium text-brand-700 underline underline-offset-4">
              Conectar agora
            </Link>
          )}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">Próximos agendamentos</h2>

        {data.upcoming.length === 0 ? (
          <EmptyState
            title="Nenhum agendamento por enquanto"
            description="Compartilhe o link de um tipo de evento para começar a receber reservas."
            action={
              <Link href="/tipos-de-evento" className="btn-secondary mt-2">
                Ver tipos de evento
              </Link>
            }
          />
        ) : (
          <ul className="card divide-y divide-ink-200/70">
            {data.upcoming.map((booking) => (
              <li key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    {booking.eventType.name} — {booking.inviteeName}
                  </p>
                  <p className="text-sm text-ink-500">
                    {formatDateTimeLong(booking.startAt, data.timezone)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {booking.googleMeetUrl && (
                    <a
                      href={booking.googleMeetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-brand-700 underline underline-offset-4"
                    >
                      Meet
                    </a>
                  )}
                  <Link href={`/agendamentos`} className="btn-ghost px-3 py-1.5 text-sm">
                    Detalhes
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
