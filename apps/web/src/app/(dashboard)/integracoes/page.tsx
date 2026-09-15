'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CalendarConnectionDto } from '@agenda/shared';
import { apiFetch, messageForError } from '@/lib/api';
import { Badge, PageHeader, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';

const CALLBACK_MESSAGES: Record<string, { text: string; tone: 'success' | 'error' }> = {
  connected: { text: 'Google Agenda conectado.', tone: 'success' },
  denied: { text: 'Você não autorizou o acesso à sua agenda.', tone: 'error' },
  invalid: { text: 'Não foi possível concluir a conexão. Tente novamente.', tone: 'error' },
  error: { text: 'Não foi possível concluir a conexão. Tente novamente.', tone: 'error' },
};

export default function IntegrationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [dirty, setDirty] = useState(false);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [destination, setDestination] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['google-calendars'],
    queryFn: () => apiFetch<CalendarConnectionDto>('/integrations/google/calendars'),
  });

  useEffect(() => {
    const status = searchParams.get('google');
    const message = status ? CALLBACK_MESSAGES[status] : null;
    if (message) {
      toast.show(message.text, message.tone);
      void queryClient.invalidateQueries({ queryKey: ['google-calendars'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      window.history.replaceState(null, '', '/integracoes');
    }
  }, [searchParams, toast, queryClient]);

  useEffect(() => {
    if (!data || dirty) return;
    setConflicts(data.calendars.filter((c) => c.checkConflicts).map((c) => c.id));
    setDestination(data.calendars.find((c) => c.isBookingDestination)?.id ?? null);
  }, [data, dirty]);

  const connect = useMutation({
    mutationFn: () => apiFetch<{ url: string }>('/integrations/google/connect'),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const savePreferences = useMutation({
    mutationFn: () =>
      apiFetch('/integrations/google/calendars', {
        method: 'PUT',
        body: JSON.stringify({
          conflictCalendarIds: conflicts,
          destinationCalendarId: destination,
        }),
      }),
    onSuccess: async () => {
      toast.show('Preferências de agenda salvas.', 'success');
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['google-calendars'] });
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const disconnect = useMutation({
    mutationFn: () => apiFetch('/integrations/google', { method: 'DELETE' }),
    onSuccess: async () => {
      toast.show('Google Agenda desconectado.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['google-calendars'] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const needsReauth = data.status === 'REAUTH_REQUIRED';

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Conecte sua Google Agenda para verificar conflitos e criar eventos automaticamente."
      />

      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">Google Agenda</h2>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={data.connected ? 'success' : needsReauth ? 'warning' : 'neutral'}>
                {data.connected ? 'Conectado' : needsReauth ? 'Precisa reconectar' : 'Não conectado'}
              </Badge>
              {data.accountEmail && <span className="text-sm text-ink-500">{data.accountEmail}</span>}
            </div>
            {data.lastSyncedAt && (
              <p className="mt-2 text-xs text-ink-400">
                Agendas sincronizadas em {new Date(data.lastSyncedAt).toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={data.connected ? 'btn-secondary' : 'btn-primary'}
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
            >
              {data.connected || needsReauth ? 'Reconectar' : 'Conectar Google Agenda'}
            </button>
            {(data.connected || needsReauth) && (
              <button
                type="button"
                className="btn-ghost text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (confirm('Desconectar o Google Agenda e apagar os tokens salvos?')) {
                    disconnect.mutate();
                  }
                }}
              >
                Desconectar
              </button>
            )}
          </div>
        </div>

        {needsReauth && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Sua conexão com o Google Agenda precisa ser renovada. Novos agendamentos ficam
            bloqueados até a reconexão.
          </p>
        )}
      </section>

      {data.calendars.length > 0 && (
        <section className="card mt-6 p-6">
          <h2 className="text-base font-semibold text-ink-900">Suas agendas</h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Marque quais agendas bloqueiam horários e escolha onde os novos eventos serão criados.
            Lemos apenas ocupado/livre — nunca o conteúdo dos seus compromissos.
          </p>

          <ul className="mt-5 divide-y divide-ink-200/70">
            {data.calendars.map((calendar) => {
              const writable = calendar.accessRole === 'owner' || calendar.accessRole === 'writer';
              return (
                <li key={calendar.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{calendar.name}</p>
                    <p className="text-xs text-ink-400">
                      {calendar.isPrimary ? 'Principal · ' : ''}
                      {calendar.accessRole}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={conflicts.includes(calendar.id)}
                        onChange={(event) => {
                          setDirty(true);
                          setConflicts((current) =>
                            event.target.checked
                              ? [...current, calendar.id]
                              : current.filter((id) => id !== calendar.id),
                          );
                        }}
                      />
                      Verificar conflitos
                    </label>

                    <label className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="radio"
                        name="destination"
                        checked={destination === calendar.id}
                        disabled={!writable}
                        onChange={() => {
                          setDirty(true);
                          setDestination(calendar.id);
                        }}
                      />
                      Receber eventos
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="btn-primary mt-5"
            onClick={() => savePreferences.mutate()}
            disabled={savePreferences.isPending || !dirty}
          >
            {savePreferences.isPending ? 'Salvando…' : 'Salvar preferências'}
          </button>
        </section>
      )}
    </>
  );
}
