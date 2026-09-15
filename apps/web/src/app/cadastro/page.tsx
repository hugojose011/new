'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, messageForError } from '@/lib/api';
import { detectTimezone } from '@/lib/time';
import { Field } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () =>
      apiFetch('/auth/register', {
        method: 'POST',
        // O fuso do navegador vira o padrão do host; ele ajusta no onboarding.
        body: JSON.stringify({ name, email, password, timezone: detectTimezone() }),
      }),
    onSuccess: () => {
      router.push('/onboarding');
      router.refresh();
    },
    onError: (err) => setError(messageForError(err)),
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Criar conta</h1>
      <p className="mt-1.5 text-sm text-ink-500">Leva menos de um minuto.</p>

      <form
        className="card mt-8 space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          register.mutate();
        }}
      >
        <Field label="Nome completo" htmlFor="name">
          <input
            id="name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
          />
        </Field>

        <Field label="E-mail" htmlFor="email">
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Senha" htmlFor="password" hint="Mínimo de 8 caracteres.">
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={register.isPending}>
          {register.isPending ? 'Criando…' : 'Criar conta'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Já tem conta?{' '}
        <Link href="/entrar" className="font-medium text-brand-700 underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </main>
  );
}
