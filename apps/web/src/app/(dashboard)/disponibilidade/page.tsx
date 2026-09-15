'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AvailabilityScheduleDto } from '@agenda/shared';
import { apiFetch, messageForError } from '@/lib/api';
import { commonTimezones, minutesToTime, timeToMinutes } from '@/lib/time';
import { Field, PageHeader, Skeleton, TimezonePicker } from '@/components/ui';
import { useToast } from '@/components/toast';

const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

type Interval = { startMinute: number; endMinute: number };
type RulesByDay = Record<number, Interval[]>;

function toRulesByDay(schedule: AvailabilityScheduleDto): RulesByDay {
  const map: RulesByDay = {};
  for (const weekday of WEEKDAYS) map[weekday.value] = [];
  for (const rule of schedule.rules) {
    map[rule.weekday] = [
      ...(map[rule.weekday] ?? []),
      { startMinute: rule.startMinute, endMinute: rule.endMinute },
    ];
  }
  return map;
}

export default function AvailabilityPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => apiFetch<AvailabilityScheduleDto[]>('/availability-schedules'),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');
  const [rules, setRules] = useState<RulesByDay>({});
  const [overrides, setOverrides] = useState<AvailabilityScheduleDto['overrides']>([]);

  const selected = schedules?.find((schedule) => schedule.id === selectedId) ?? schedules?.[0];

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setName(selected.name);
    setTimezone(selected.timezone);
    setRules(toRulesByDay(selected));
    setOverrides(selected.overrides);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/availability-schedules/${selected?.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          timezone,
          rules: Object.entries(rules).flatMap(([weekday, intervals]) =>
            intervals.map((interval) => ({ weekday: Number(weekday), ...interval })),
          ),
          overrides,
        }),
      }),
    onSuccess: async () => {
      toast.show('Disponibilidade salva.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<AvailabilityScheduleDto>('/availability-schedules', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Nova agenda',
          timezone,
          rules: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startMinute: 9 * 60,
            endMinute: 18 * 60,
          })),
        }),
      }),
    onSuccess: async (schedule) => {
      await queryClient.invalidateQueries({ queryKey: ['schedules'] });
      setSelectedId(schedule.id);
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  if (isLoading || !selected) return <Skeleton className="h-96 w-full" />;

  function updateInterval(weekday: number, index: number, patch: Partial<Interval>) {
    setRules((current) => {
      const next = { ...current };
      const intervals = [...(next[weekday] ?? [])];
      intervals[index] = { ...intervals[index], ...patch };
      next[weekday] = intervals;
      return next;
    });
  }

  /** Copia os intervalos de um dia para todos os outros dias ativos. */
  function copyToAll(weekday: number) {
    const source = rules[weekday] ?? [];
    setRules((current) => {
      const next: RulesByDay = {};
      for (const day of WEEKDAYS) {
        next[day.value] =
          (current[day.value] ?? []).length > 0 || day.value === weekday
            ? source.map((interval) => ({ ...interval }))
            : [];
      }
      return next;
    });
    toast.show('Horários copiados para os dias ativos.', 'success');
  }

  return (
    <>
      <PageHeader
        title="Disponibilidade"
        description="Defina quando você aceita reuniões. Os horários valem no fuso da agenda."
        action={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => create.mutate()}>
              Nova agenda
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      />

      {schedules && schedules.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {schedules.map((schedule) => (
            <button
              key={schedule.id}
              type="button"
              onClick={() => setSelectedId(schedule.id)}
              className={
                schedule.id === selected.id ? 'btn-primary px-4 py-2' : 'btn-secondary px-4 py-2'
              }
            >
              {schedule.name}
              {schedule.isDefault && ' ★'}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome da agenda" htmlFor="schedule-name">
              <input
                id="schedule-name"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>

            <Field label="Fuso horário" htmlFor="schedule-tz">
              <TimezonePicker
                id="schedule-tz"
                value={timezone}
                options={commonTimezones(timezone)}
                onChange={setTimezone}
              />
            </Field>
          </div>

          <div className="mt-6 space-y-4">
            {WEEKDAYS.map((weekday) => {
              const intervals = rules[weekday.value] ?? [];
              const enabled = intervals.length > 0;

              return (
                <div
                  key={weekday.value}
                  className="grid gap-3 border-t border-ink-200/70 pt-4 sm:grid-cols-[180px_minmax(0,1fr)]"
                >
                  <label className="flex items-center gap-2.5 text-sm font-medium text-ink-800">
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
                      aria-label={`Ativar ${weekday.label}`}
                    />
                    {weekday.label}
                  </label>

                  <div className="space-y-2">
                    {!enabled && <p className="text-sm text-ink-400">Indisponível</p>}

                    {intervals.map((interval, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          className="input w-32"
                          value={minutesToTime(interval.startMinute)}
                          onChange={(event) =>
                            updateInterval(weekday.value, index, {
                              startMinute: timeToMinutes(event.target.value),
                            })
                          }
                          aria-label={`Início do intervalo ${index + 1} de ${weekday.label}`}
                        />
                        <span className="text-sm text-ink-400">até</span>
                        <input
                          type="time"
                          className="input w-32"
                          value={minutesToTime(interval.endMinute)}
                          onChange={(event) =>
                            updateInterval(weekday.value, index, {
                              endMinute: timeToMinutes(event.target.value),
                            })
                          }
                          aria-label={`Fim do intervalo ${index + 1} de ${weekday.label}`}
                        />
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-sm"
                          onClick={() =>
                            setRules((current) => ({
                              ...current,
                              [weekday.value]: current[weekday.value].filter(
                                (_, position) => position !== index,
                              ),
                            }))
                          }
                          aria-label={`Remover intervalo ${index + 1} de ${weekday.label}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    {enabled && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-sm"
                          onClick={() =>
                            setRules((current) => ({
                              ...current,
                              [weekday.value]: [
                                ...current[weekday.value],
                                { startMinute: 14 * 60, endMinute: 18 * 60 },
                              ],
                            }))
                          }
                        >
                          + Adicionar horário
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-sm"
                          onClick={() => copyToAll(weekday.value)}
                        >
                          Copiar para os dias ativos
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card h-fit p-6">
          <h2 className="text-sm font-semibold text-ink-800">Exceções por data</h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Bloqueie um dia específico ou defina um horário diferente. As exceções têm prioridade
            sobre a disponibilidade semanal.
          </p>

          <div className="mt-4 space-y-3">
            {overrides.map((override, index) => (
              <div key={`${override.date}-${index}`} className="rounded-xl border border-ink-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="date"
                    className="input w-auto"
                    value={override.date}
                    onChange={(event) => {
                      const next = [...overrides];
                      next[index] = { ...override, date: event.target.value };
                      setOverrides(next);
                    }}
                    aria-label="Data da exceção"
                  />
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-sm"
                    onClick={() => setOverrides(overrides.filter((_, i) => i !== index))}
                    aria-label="Remover exceção"
                  >
                    ✕
                  </button>
                </div>

                <select
                  className="input mt-2"
                  value={override.type}
                  onChange={(event) => {
                    const next = [...overrides];
                    const type = event.target.value as 'UNAVAILABLE' | 'CUSTOM_HOURS';
                    next[index] = {
                      ...override,
                      type,
                      intervals:
                        type === 'CUSTOM_HOURS' && override.intervals.length === 0
                          ? [{ startMinute: 9 * 60, endMinute: 12 * 60 }]
                          : override.intervals,
                    };
                    setOverrides(next);
                  }}
                  aria-label="Tipo da exceção"
                >
                  <option value="UNAVAILABLE">Indisponível o dia todo</option>
                  <option value="CUSTOM_HOURS">Horário personalizado</option>
                </select>

                {override.type === 'CUSTOM_HOURS' &&
                  override.intervals.map((interval, position) => (
                    <div key={position} className="mt-2 flex items-center gap-2">
                      <input
                        type="time"
                        className="input w-28"
                        value={minutesToTime(interval.startMinute)}
                        onChange={(event) => {
                          const next = [...overrides];
                          const intervals = [...override.intervals];
                          intervals[position] = {
                            ...interval,
                            startMinute: timeToMinutes(event.target.value),
                          };
                          next[index] = { ...override, intervals };
                          setOverrides(next);
                        }}
                        aria-label="Início"
                      />
                      <span className="text-sm text-ink-400">até</span>
                      <input
                        type="time"
                        className="input w-28"
                        value={minutesToTime(interval.endMinute)}
                        onChange={(event) => {
                          const next = [...overrides];
                          const intervals = [...override.intervals];
                          intervals[position] = {
                            ...interval,
                            endMinute: timeToMinutes(event.target.value),
                          };
                          next[index] = { ...override, intervals };
                          setOverrides(next);
                        }}
                        aria-label="Fim"
                      />
                    </div>
                  ))}
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn-secondary mt-4 w-full"
            onClick={() =>
              setOverrides([
                ...overrides,
                {
                  date: new Date().toISOString().slice(0, 10),
                  type: 'UNAVAILABLE',
                  intervals: [],
                },
              ])
            }
          >
            Adicionar exceção
          </button>
        </section>
      </div>
    </>
  );
}
