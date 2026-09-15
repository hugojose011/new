'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AvailabilityScheduleDto, LocationType, QuestionType } from '@agenda/shared';
import { apiFetch, messageForError } from '@/lib/api';
import { Field, PageHeader } from '@/components/ui';
import { useToast } from '@/components/toast';

export interface EventTypeFormValues {
  name: string;
  slug: string;
  description: string;
  scheduleId: string;
  durationMinutes: number;
  slotIntervalMinutes: number;
  locationType: LocationType;
  locationValue: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minimumNoticeMinutes: number;
  bookingWindowDays: number;
  maxBookingsPerDay: number | null;
  questions: {
    label: string;
    type: QuestionType;
    required: boolean;
    options: string[];
    order: number;
  }[];
}

const DURATIONS = [15, 30, 45, 60];
const NOTICE_OPTIONS = [
  { value: 0, label: 'Sem antecedência mínima' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
  { value: 720, label: '12 horas' },
  { value: 1440, label: '24 horas' },
  { value: 2880, label: '48 horas' },
];
const BUFFERS = [0, 5, 10, 15, 30, 45, 60];

export function EventTypeEditor({
  initial,
  eventTypeId,
}: {
  initial: EventTypeFormValues;
  eventTypeId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(initial);
  const [customDuration, setCustomDuration] = useState(
    !DURATIONS.includes(initial.durationMinutes),
  );

  const { data: schedules } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => apiFetch<AvailabilityScheduleDto[]>('/availability-schedules'),
  });

  function set<K extends keyof EventTypeFormValues>(key: K, value: EventTypeFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: values.name,
        slug: values.slug || undefined,
        description: values.description || undefined,
        scheduleId: values.scheduleId || undefined,
        durationMinutes: values.durationMinutes,
        slotIntervalMinutes: values.slotIntervalMinutes,
        locationType: values.locationType,
        locationValue: values.locationValue || null,
        bufferBeforeMinutes: values.bufferBeforeMinutes,
        bufferAfterMinutes: values.bufferAfterMinutes,
        minimumNoticeMinutes: values.minimumNoticeMinutes,
        bookingWindowDays: values.bookingWindowDays,
        maxBookingsPerDay: values.maxBookingsPerDay,
        questions: values.questions.map((question, index) => ({
          ...question,
          order: index,
        })),
      };

      return eventTypeId
        ? apiFetch(`/event-types/${eventTypeId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : apiFetch('/event-types', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: async () => {
      toast.show('Tipo de evento salvo.', 'success');
      await queryClient.invalidateQueries({ queryKey: ['event-types'] });
      router.push('/tipos-de-evento');
    },
    onError: (error) => toast.show(messageForError(error), 'error'),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <PageHeader
        title={eventTypeId ? 'Editar tipo de evento' : 'Novo tipo de evento'}
        description="Duração, local, disponibilidade e limites."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => router.push('/tipos-de-evento')}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        }
      />

      <div className="space-y-6">
        <section className="card space-y-5 p-6">
          <h2 className="text-sm font-semibold text-ink-800">Informações básicas</h2>

          <Field label="Nome" htmlFor="name">
            <input
              id="name"
              className="input"
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              required
            />
          </Field>

          <Field
            label="Slug"
            htmlFor="slug"
            hint="Parte final do link público. Deixe em branco para gerar a partir do nome."
          >
            <input
              id="slug"
              className="input"
              value={values.slug}
              onChange={(event) => set('slug', event.target.value)}
              pattern="[a-z0-9\-]*"
            />
          </Field>

          <Field label="Descrição" htmlFor="description">
            <textarea
              id="description"
              className="input min-h-[96px]"
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
            />
          </Field>
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="text-sm font-semibold text-ink-800">Duração</h2>

          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => {
                  setCustomDuration(false);
                  set('durationMinutes', minutes);
                  set('slotIntervalMinutes', minutes);
                }}
                className={
                  !customDuration && values.durationMinutes === minutes
                    ? 'btn-primary px-4 py-2'
                    : 'btn-secondary px-4 py-2'
                }
              >
                {minutes} min
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomDuration(true)}
              className={customDuration ? 'btn-primary px-4 py-2' : 'btn-secondary px-4 py-2'}
            >
              Personalizado
            </button>
          </div>

          {customDuration && (
            <Field label="Duração (minutos)" htmlFor="duration">
              <input
                id="duration"
                type="number"
                min={5}
                max={1440}
                className="input"
                value={values.durationMinutes}
                onChange={(event) => set('durationMinutes', Number(event.target.value))}
              />
            </Field>
          )}

          <Field
            label="Intervalo entre horários exibidos (minutos)"
            htmlFor="slot"
            hint="Ex.: reuniões de 60 min podendo começar a cada 30 min."
          >
            <input
              id="slot"
              type="number"
              min={5}
              max={1440}
              className="input"
              value={values.slotIntervalMinutes}
              onChange={(event) => set('slotIntervalMinutes', Number(event.target.value))}
            />
          </Field>
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="text-sm font-semibold text-ink-800">Local</h2>

          <Field label="Tipo de local" htmlFor="locationType">
            <select
              id="locationType"
              className="input"
              value={values.locationType}
              onChange={(event) => set('locationType', event.target.value as LocationType)}
            >
              <option value="GOOGLE_MEET">Google Meet (gerado automaticamente)</option>
              <option value="PHYSICAL">Presencial</option>
              <option value="CUSTOM_LINK">Link personalizado</option>
              <option value="PHONE">Telefone</option>
              <option value="NONE">A combinar</option>
            </select>
          </Field>

          {values.locationType !== 'GOOGLE_MEET' && values.locationType !== 'NONE' && (
            <Field
              label={
                values.locationType === 'PHYSICAL'
                  ? 'Endereço'
                  : values.locationType === 'PHONE'
                    ? 'Telefone'
                    : 'URL'
              }
              htmlFor="locationValue"
            >
              <input
                id="locationValue"
                className="input"
                value={values.locationValue}
                onChange={(event) => set('locationValue', event.target.value)}
                required
              />
            </Field>
          )}
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="text-sm font-semibold text-ink-800">Disponibilidade</h2>

          <Field label="Agenda de disponibilidade" htmlFor="schedule">
            <select
              id="schedule"
              className="input"
              value={values.scheduleId}
              onChange={(event) => set('scheduleId', event.target.value)}
            >
              {(schedules ?? []).map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.name} ({schedule.timezone})
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="card grid gap-5 p-6 sm:grid-cols-2">
          <h2 className="text-sm font-semibold text-ink-800 sm:col-span-2">Limites e buffers</h2>

          <Field label="Buffer antes (minutos)" htmlFor="bufferBefore">
            <select
              id="bufferBefore"
              className="input"
              value={values.bufferBeforeMinutes}
              onChange={(event) => set('bufferBeforeMinutes', Number(event.target.value))}
            >
              {BUFFERS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? 'Sem buffer' : `${minutes} min`}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Buffer depois (minutos)" htmlFor="bufferAfter">
            <select
              id="bufferAfter"
              className="input"
              value={values.bufferAfterMinutes}
              onChange={(event) => set('bufferAfterMinutes', Number(event.target.value))}
            >
              {BUFFERS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? 'Sem buffer' : `${minutes} min`}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Antecedência mínima" htmlFor="notice">
            <select
              id="notice"
              className="input"
              value={values.minimumNoticeMinutes}
              onChange={(event) => set('minimumNoticeMinutes', Number(event.target.value))}
            >
              {NOTICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Janela de agendamento (dias)"
            htmlFor="window"
            hint="Quantos dias à frente o convidado pode reservar, contando hoje."
          >
            <input
              id="window"
              type="number"
              min={1}
              max={365}
              className="input"
              value={values.bookingWindowDays}
              onChange={(event) => set('bookingWindowDays', Number(event.target.value))}
            />
          </Field>

          <Field
            label="Limite de reuniões por dia"
            htmlFor="maxPerDay"
            hint="Deixe vazio para não limitar."
          >
            <input
              id="maxPerDay"
              type="number"
              min={1}
              max={100}
              className="input"
              value={values.maxBookingsPerDay ?? ''}
              onChange={(event) =>
                set('maxBookingsPerDay', event.target.value ? Number(event.target.value) : null)
              }
            />
          </Field>
        </section>

        <section className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Perguntas adicionais</h2>
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-sm"
              onClick={() =>
                set('questions', [
                  ...values.questions,
                  { label: '', type: 'TEXT', required: false, options: [], order: values.questions.length },
                ])
              }
            >
              Adicionar pergunta
            </button>
          </div>

          {values.questions.length === 0 && (
            <p className="text-sm text-ink-500">
              O convidado sempre informa nome e e-mail. Adicione perguntas para coletar mais contexto.
            </p>
          )}

          {values.questions.map((question, index) => (
            <div key={index} className="rounded-xl border border-ink-200 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <Field label="Pergunta" htmlFor={`q-${index}`}>
                  <input
                    id={`q-${index}`}
                    className="input"
                    value={question.label}
                    onChange={(event) => {
                      const next = [...values.questions];
                      next[index] = { ...question, label: event.target.value };
                      set('questions', next);
                    }}
                    required
                  />
                </Field>

                <Field label="Tipo" htmlFor={`qt-${index}`}>
                  <select
                    id={`qt-${index}`}
                    className="input"
                    value={question.type}
                    onChange={(event) => {
                      const next = [...values.questions];
                      next[index] = { ...question, type: event.target.value as QuestionType };
                      set('questions', next);
                    }}
                  >
                    <option value="TEXT">Texto curto</option>
                    <option value="TEXTAREA">Texto longo</option>
                    <option value="SELECT">Lista suspensa</option>
                    <option value="RADIO">Escolha única</option>
                    <option value="CHECKBOX">Caixa de seleção</option>
                  </select>
                </Field>
              </div>

              {(question.type === 'SELECT' || question.type === 'RADIO') && (
                <Field
                  label="Opções"
                  htmlFor={`qo-${index}`}
                  hint="Separe as opções por vírgula."
                >
                  <input
                    id={`qo-${index}`}
                    className="input"
                    value={question.options.join(', ')}
                    onChange={(event) => {
                      const next = [...values.questions];
                      next[index] = {
                        ...question,
                        options: event.target.value
                          .split(',')
                          .map((option) => option.trim())
                          .filter(Boolean),
                      };
                      set('questions', next);
                    }}
                  />
                </Field>
              )}

              <div className="mt-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) => {
                      const next = [...values.questions];
                      next[index] = { ...question, required: event.target.checked };
                      set('questions', next);
                    }}
                  />
                  Obrigatória
                </label>

                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  onClick={() =>
                    set(
                      'questions',
                      values.questions.filter((_, position) => position !== index),
                    )
                  }
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </form>
  );
}

export const EMPTY_EVENT_TYPE: EventTypeFormValues = {
  name: '',
  slug: '',
  description: '',
  scheduleId: '',
  durationMinutes: 30,
  slotIntervalMinutes: 30,
  locationType: 'GOOGLE_MEET',
  locationValue: '',
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minimumNoticeMinutes: 120,
  bookingWindowDays: 30,
  maxBookingsPerDay: null,
  questions: [],
};
