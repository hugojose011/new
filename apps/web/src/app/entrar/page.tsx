'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, messageForError } from '@/lib/api';
import { Field } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: () =>
      apiFetch<{ onboardingDone: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (user) => {
      router.push(user.onboardingDone ? '/visao-geral' : '/onboarding');
      router.refresh();
    },
    onError: (err) => setError(messageForError(err)),
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Entrar</h1>
      <p className="mt-1.5 text-sm text-ink-500">Acesse o painel da sua agenda.</p>

      <form
        className="card mt-8 space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          login.mutate();
        }}
      >
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

        <Field label="Senha" htmlFor="password">
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Não tem conta?{' '}
        <Link href="/cadastro" className="font-medium text-brand-700 underline underline-offset-4">
          Criar agora
        </Link>
      </p>
    </main>
  );
}
