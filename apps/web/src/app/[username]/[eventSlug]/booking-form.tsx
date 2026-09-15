'use client';

import { useState } from 'react';
import type { PublicQuestionDto } from '@agenda/shared';
import { Field } from '@/components/ui';

interface FormValues {
  name: string;
  email: string;
  phone?: string;
  answers: { questionId: string; answer: string }[];
  utm?: Record<string, string>;
}

/** Lê os parâmetros UTM da URL para atribuição de campanha (§87). */
function readUtm(): Record<string, string> | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ['source', 'medium', 'campaign', 'content', 'term']) {
    const value = params.get(`utm_${key}`);
    if (value) utm[key] = value.slice(0, 120);
  }
  return Object.keys(utm).length > 0 ? utm : undefined;
}

export function BookingForm({
  questions,
  submitting,
  onSubmit,
}: {
  questions: PublicQuestionDto[];
  submitting: boolean;
  onSubmit: (values: FormValues) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Validação de conveniência: o backend revalida tudo (§74).
    const nextErrors: Record<string, string> = {};
    if (name.trim().length < 2) nextErrors.name = 'Informe seu nome.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) nextErrors.email = 'Informe um e-mail válido.';
    for (const question of questions) {
      if (question.required && !answers[question.id]?.trim()) {
        nextErrors[question.id] = 'Campo obrigatório.';
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      answers: Object.entries(answers)
        .filter(([, value]) => value.trim().length > 0)
        .map(([questionId, answer]) => ({ questionId, answer: answer.trim() })),
      utm: readUtm(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5" noValidate>
      <Field label="Nome" htmlFor="name" error={errors.name}>
        <input
          id="name"
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
        />
      </Field>

      <Field label="E-mail" htmlFor="email" error={errors.email}>
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

      <Field label="Telefone (opcional)" htmlFor="phone">
        <input
          id="phone"
          className="input"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
        />
      </Field>

      {questions.map((question) => (
        <Field
          key={question.id}
          label={question.required ? question.label : `${question.label} (opcional)`}
          htmlFor={question.id}
          error={errors[question.id]}
        >
          {question.type === 'TEXTAREA' && (
            <textarea
              id={question.id}
              className="input min-h-[96px]"
              value={answers[question.id] ?? ''}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
              }
            />
          )}

          {question.type === 'TEXT' && (
            <input
              id={question.id}
              className="input"
              value={answers[question.id] ?? ''}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
              }
            />
          )}

          {question.type === 'SELECT' && (
            <select
              id={question.id}
              className="input"
              value={answers[question.id] ?? ''}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
              }
            >
              <option value="">Selecione…</option>
              {question.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}

          {question.type === 'RADIO' && (
            <div role="radiogroup" aria-labelledby={question.id} className="space-y-2">
              {question.options.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={answers[question.id] === option}
                    onChange={() =>
                      setAnswers((current) => ({ ...current, [question.id]: option }))
                    }
                  />
                  {option}
                </label>
              ))}
            </div>
          )}

          {question.type === 'CHECKBOX' && (
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={answers[question.id] === 'sim'}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: event.target.checked ? 'sim' : '',
                  }))
                }
              />
              Sim
            </label>
          )}
        </Field>
      ))}

      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? 'Confirmando…' : 'Confirmar agendamento'}
      </button>
    </form>
  );
}
