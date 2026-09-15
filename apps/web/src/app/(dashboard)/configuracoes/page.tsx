'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch, messageForError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { commonTimezones } from '@/lib/time';
import { Field, PageHeader, Skeleton, TimezonePicker } from '@/components/ui';
import { useToast } from '@/components/toast';

export default function SettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useCurrentUser();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [locale, setLocale] = useState('pt-BR');

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setUsername(user.username ?? '');
    setTimezone(user.timezone);
    setLocale(user.locale);
  }, [user]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name, username: username || undefined, timezone, locale }),
      }),
    onSuccess: async () => {
      toast.show('Configurações salvas.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  if (isLoading || !user) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <PageHeader title="Configurações" description="Perfil, link público e preferências." />

      <form
        className="card space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Nome" htmlFor="name">
          <input
            id="name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="E-mail" htmlFor="email" hint="O e-mail de acesso não pode ser alterado aqui.">
          <input id="email" className="input" value={user.email} disabled />
        </Field>

        <Field
          label="Username"
          htmlFor="username"
          hint={
            username
              ? `Seu link público: ${typeof window !== 'undefined' ? window.location.origin : ''}/${username}/{evento}`
              : 'Letras minúsculas, números e hífen.'
          }
        >
          <input
            id="username"
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            pattern="[a-z0-9\-]*"
          />
        </Field>

        <Field
          label="Fuso horário"
          htmlFor="timezone"
          hint="Sua disponibilidade é interpretada neste fuso."
        >
          <TimezonePicker
            id="timezone"
            value={timezone}
            options={commonTimezones(timezone)}
            onChange={setTimezone}
          />
        </Field>

        <Field label="Idioma" htmlFor="locale">
          <select
            id="locale"
            className="input"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en-US">English (US)</option>
          </select>
        </Field>

        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </form>

      <section className="card mt-6 p-6">
        <h2 className="text-base font-semibold text-ink-900">Integrações</h2>
        <p className="mt-1.5 text-sm text-ink-500">
          Gerencie a conexão com o Google Agenda e escolha quais agendas verificam conflitos.
        </p>
        <Link href="/integracoes" className="btn-secondary mt-4 inline-flex">
          Abrir integrações
        </Link>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-base font-semibold text-ink-900">Segurança</h2>
        <p className="mt-1.5 text-sm text-ink-500">
          Sua sessão usa cookie HttpOnly e expira automaticamente. Os tokens do Google ficam
          criptografados no servidor e nunca são enviados ao navegador.
        </p>
      </section>
    </>
  );
}
