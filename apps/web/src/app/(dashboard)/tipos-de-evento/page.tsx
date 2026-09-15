'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, messageForError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { durationLabel } from '@/lib/time';
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { useToast } from '@/components/toast';

interface EventTypeRow {
  id: string;
  name: string;
  slug: string;
  durationMinutes: number;
  locationType: string;
  isActive: boolean;
}

const LOCATION_LABELS: Record<string, string> = {
  GOOGLE_MEET: 'Google Meet',
  PHYSICAL: 'Presencial',
  CUSTOM_LINK: 'Link',
  PHONE: 'Telefone',
  NONE: 'A combinar',
};

export default function EventTypesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ['event-types'],
    queryFn: () => apiFetch<EventTypeRow[]>('/event-types'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['event-types'] });

  const toggle = useMutation({
    mutationFn: (row: EventTypeRow) =>
      apiFetch(`/event-types/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !row.isActive }),
      }),
    onSuccess: invalidate,
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => apiFetch(`/event-types/${id}/duplicate`, { method: 'POST' }),
    onSuccess: async () => {
      toast.show('Tipo de evento duplicado.', 'success');
      await invalidate();
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/event-types/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.show('Tipo de evento excluído.', 'success');
      await invalidate();
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  function publicUrl(slug: string): string {
    return `${window.location.origin}/${user?.username}/${slug}`;
  }

  async function copy(slug: string) {
    try {
      await navigator.clipboard.writeText(publicUrl(slug));
      toast.show('Link copiado.', 'success');
    } catch {
      toast.show('Não foi possível copiar o link.', 'error');
    }
  }

  return (
    <>
      <PageHeader
        title="Tipos de evento"
        description="Cada tipo de evento tem o próprio link público."
        action={
          <Link href="/tipos-de-evento/novo" className="btn-primary">
            Novo tipo de evento
          </Link>
        }
      />

      {!user?.username && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Defina um username em{' '}
          <Link href="/configuracoes" className="font-medium underline underline-offset-4">
            Configurações
          </Link>{' '}
          para gerar seus links públicos.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {!isLoading && data?.length === 0 && (
        <EmptyState
          title="Nenhum tipo de evento"
          description="Crie o primeiro tipo de evento para começar a compartilhar seu link."
          action={
            <Link href="/tipos-de-evento/novo" className="btn-primary mt-2">
              Criar tipo de evento
            </Link>
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.map((row) => (
          <article key={row.id} className="card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-ink-900">{row.name}</h2>
              <Badge tone={row.isActive ? 'success' : 'neutral'}>
                {row.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>

            <p className="mt-2 text-sm text-ink-600">
              {durationLabel(row.durationMinutes)} · {LOCATION_LABELS[row.locationType]}
            </p>
            {user?.username && (
              <p className="mt-1 truncate text-sm text-ink-400">
                /{user.username}/{row.slug}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm"
                onClick={() => copy(row.slug)}
                disabled={!user?.username}
              >
                Copiar link
              </button>
              <Link
                href={`/tipos-de-evento/${row.id}`}
                className="btn-secondary px-3 py-1.5 text-sm"
              >
                Editar
              </Link>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={() => toggle.mutate(row)}
              >
                {row.isActive ? 'Desativar' : 'Ativar'}
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-sm"
                onClick={() => duplicate.mutate(row.id)}
              >
                Duplicar
              </button>
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (confirm(`Excluir "${row.name}"? Os agendamentos já feitos são preservados.`)) {
                    remove.mutate(row.id);
                  }
                }}
              >
                Excluir
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
