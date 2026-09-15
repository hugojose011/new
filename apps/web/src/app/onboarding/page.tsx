'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AvailabilityScheduleDto, CalendarConnectionDto } from '@agenda/shared';
import { apiFetch, messageForError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { commonTimezones, detectTimezone, minutesToTime, timeToMinutes } from '@/lib/time';
import { Field, Skeleton, TimezonePicker } from '@/components/ui';
import { useToast } from '@/components/toast';

const STEPS = ['Seus dados', 'Google Agenda', 'Suas agendas', 'Disponibilidade'];
const WEEKDAYS = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useCurrentUser();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [timezone, setTimezone] = useState(detectTimezone());
  const [locale, setLocale] = useState('pt-BR');

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setUsername(user.username ?? '');
    setTimezone(user.timezone);
    setStep(Math.min(user.onboardingStep, 3));
  }, [user]);

  const { data: connection } = useQuery({
    queryKey: ['google-calendars'],
    queryFn: () => apiFetch<CalendarConnectionDto>('/integrations/google/calendars'),
    enabled: step >= 1,
  });

  const { data: schedules } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => apiFetch<AvailabilityScheduleDto[]>('/availability-schedules'),
    enabled: step >= 3,
  });

  const schedule = schedules?.find((item) => item.isDefault) ?? schedules?.[0];
  const [rules, setRules] = useState<Record<number, { startMinute: number; endMinute: number }[]>>({});

  useEffect(() => {
    if (!schedule) return;
    const map: Record<number, { startMinute: number; endMinute: number }[]> = {};
    for (const weekday of WEEKDAYS) map[weekday.value] = [];
    for (const rule of schedule.rules) {
      map[rule.weekday] = [
        ...(map[rule.weekday] ?? []),
        { startMinute: rule.startMinute, endMinute: rule.endMinute },
      ];
    }
    setRules(map);
  }, [schedule?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = useMutation({
    mutationFn: () =>
      apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify({ name, username, timezone, locale }),
      }),
    onSuccess: async () => {
      await apiFetch('/users/onboarding', { method: 'POST', body: JSON.stringify({ step: 1 }) });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setStep(1);
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const connectGoogle = useMutation({
    mutationFn: () => apiFetch<{ url: string }>('/integrations/google/connect'),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const saveCalendars = useMutation({
    mutationFn: (payload: { conflictCalendarIds: string[]; destinationCalendarId: string | null }) =>
      apiFetch('/integrations/google/calendars', { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await apiFetch('/users/onboarding', { method: 'POST', body: JSON.stringify({ step: 3 }) });
      setStep(3);
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const saveAvailability = useMutation({
    mutationFn: () =>
      apiFetch(`/availability-schedules/${schedule?.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          timezone,
          rules: Object.entries(rules).flatMap(([weekday, intervals]) =>
            intervals.map((interval) => ({ weekday: Number(weekday), ...interval })),
          ),
        }),
      }),
    onSuccess: async () => {
      await apiFetch('/users/onboarding', { method: 'POST', body: JSON.stringify({ step: 4 }) });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.show('Tudo pronto!', 'success');
      router.push('/visao-geral');
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const [conflicts, setConflicts] = useState<string[]>([]);
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    if (!connection) return;
    setConflicts(connection.calendars.filter((c) => c.checkConflicts).map((c) => c.id));
    setDestination(connection.calendars.find((c) => c.isBookingDestination)?.id ?? null);
  }, [connection]);

  if (isLoading || !user) return <Skeleton className="m-8 h-96" />;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12">
      <ol className="mb-8 flex flex-wrap gap-2 text-sm" aria-label="Progresso do onboarding">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={`rounded-full px-3 py-1.5 ${
              index === step
                ? 'bg-ink-900 text-white'
                : index < step
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-white text-ink-400'
            }`}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form
          className="card space-y-5 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfile.mutate();
          }}
        >
          <h1 className="text-xl font-semibold text-ink-900">Seus dados</h1>

          <Field label="Nome" htmlFor="name">
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>

          <Field
            label="Username"
            htmlFor="username"
            hint="Define seu endereço público, por exemplo /diogo/reuniao."
          >
            <input
              id="username"
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              pattern="[a-z0-9\-]{3,40}"
              required
            />
          </Field>

          <Field label="Idioma" htmlFor="locale">
            <select id="locale" className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en-US">English (US)</option>
            </select>
          </Field>

          <Field label="Fuso horário" htmlFor="tz" hint="Detectamos pelo seu navegador.">
            <TimezonePicker id="tz" value={timezone} options={commonTimezones(timezone)} onChange={setTimezone} />
          </Field>

          <button type="submit" className="btn-primary w-full" disabled={saveProfile.isPending}>
            Continuar
          </button>
        </form>
      )}

      {step === 1 && (
        <div className="card space-y-5 p-6">
          <h1 className="text-xl font-semibold text-ink-900">Conectar Google Agenda</h1>
          <p className="text-sm text-ink-600">
            Pedimos apenas permissão para listar suas agendas, verificar ocupado/livre e criar os
            eventos dos agendamentos. Não lemos o conteúdo dos seus compromissos.
          </p>

          {connection?.connected ? (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              Conectado como {connection.accountEmail}.
            </p>
          ) : (
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => connectGoogle.mutate()}
              disabled={connectGoogle.isPending}
            >
              Conectar Google Agenda
            </button>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(0)}>
              Voltar
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={async () => {
                await apiFetch('/users/onboarding', { method: 'POST', body: JSON.stringify({ step: 2 }) });
                setStep(2);
              }}
            >
              {connection?.connected ? 'Continuar' : 'Pular por enquanto'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-5 p-6">
          <h1 className="text-xl font-semibold text-ink-900">Escolher agendas</h1>

          {!connection?.connected || connection.calendars.length === 0 ? (
            <p className="text-sm text-ink-600">
              Nenhuma agenda conectada. Você pode configurar isso depois em Integrações.
            </p>
          ) : (
            <ul className="divide-y divide-ink-200/70">
              {connection.calendars.map((calendar) => {
                const writable = calendar.accessRole === 'owner' || calendar.accessRole === 'writer';
                return (
                  <li key={calendar.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="text-sm font-medium text-ink-900">{calendar.name}</span>
                    <div className="flex gap-5">
                      <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input
                          type="checkbox"
                          checked={conflicts.includes(calendar.id)}
                          onChange={(event) =>
                            setConflicts((current) =>
                              event.target.checked
                                ? [...current, calendar.id]
                                : current.filter((id) => id !== calendar.id),
                            )
                          }
                        />
                        Conflitos
                      </label>
                      <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input
                          type="radio"
                          name="destination"
                          disabled={!writable}
                          checked={destination === calendar.id}
                          onChange={() => setDestination(calendar.id)}
                        />
                        Destino
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>
              Voltar
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => {
                if (connection?.connected && connection.calendars.length > 0) {
                  saveCalendars.mutate({
                    conflictCalendarIds: conflicts,
                    destinationCalendarId: destination,
                  });
                } else {
                  setStep(3);
                }
              }}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-5 p-6">
          <h1 className="text-xl font-semibold text-ink-900">Sua disponibilidade</h1>
          <p className="text-sm text-ink-600">
            Horários no fuso {timezone.replace(/_/g, ' ')}. Você pode refinar depois.
          </p>

          <div className="space-y-3">
            {WEEKDAYS.map((weekday) => {
              const intervals = rules[weekday.value] ?? [];
              const enabled = intervals.length > 0;
              return (
                <div key={weekday.value} className="flex flex-wrap items-center gap-3">
                  <label className="flex w-28 items-center gap-2 text-sm font-medium text-ink-800">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) =>
                        setRules((current) => ({
                          ...current,
                          [weekday.value]: event.target.checked
                            ? [{ startMinute: 9 * 60, endMinute: 18 * 60 }]
                            : [],
                        }))
                      }
                      aria-label={weekday.label}
                    />
                    {weekday.label}
                  </label>

                  {enabled ? (
                    intervals.map((interval, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="time"
                          className="input w-28"
                          value={minutesToTime(interval.startMinute)}
                          onChange={(event) =>
                            setRules((current) => {
                              const next = { ...current };
                              const list = [...next[weekday.value]];
                              list[index] = { ...interval, startMinute: timeToMinutes(event.target.value) };
                              next[weekday.value] = list;
                              return next;
                            })
                          }
                          aria-label={`Início ${weekday.label}`}
                        />
                        <span className="text-sm text-ink-400">até</span>
                        <input
                          type="time"
                          className="input w-28"
                          value={minutesToTime(interval.endMinute)}
                          onChange={(event) =>
                            setRules((current) => {
                              const next = { ...current };
                              const list = [...next[weekday.value]];
                              list[index] = { ...interval, endMinute: timeToMinutes(event.target.value) };
                              next[weekday.value] = list;
                              return next;
                            })
                          }
                          aria-label={`Fim ${weekday.label}`}
                        />
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-ink-400">Indisponível</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setStep(2)}>
              Voltar
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => saveAvailability.mutate()}
              disabled={saveAvailability.isPending || !schedule}
            >
              Concluir
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
