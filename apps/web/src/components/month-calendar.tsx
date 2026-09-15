'use client';

import clsx from 'clsx';
import { DateTime } from 'luxon';

const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/**
 * Calendário mensal acessível: navegação por teclado nativa (são botões),
 * dias sem horário ficam desabilitados e o dia selecionado é anunciado.
 */
export function MonthCalendar({
  month,
  timezone,
  selectedDate,
  availableDates,
  loading,
  onSelect,
  onMonthChange,
  minDate,
}: {
  month: DateTime;
  timezone: string;
  selectedDate: string | null;
  availableDates: Set<string>;
  loading: boolean;
  onSelect: (date: string) => void;
  onMonthChange: (month: DateTime) => void;
  minDate?: string;
}) {
  const start = month.startOf('month');
  const daysInMonth = month.daysInMonth ?? 30;
  // Luxon: 1 = segunda ... 7 = domingo. A grade começa no domingo.
  const leading = start.weekday % 7;
  const today = DateTime.now().setZone(timezone).toISODate() as string;
  const floor = minDate ?? today;

  const cells: (DateTime | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => start.plus({ days: index })),
  ];

  const canGoBack = month.startOf('month') > DateTime.now().setZone(timezone).startOf('month');

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold capitalize text-ink-900">
          {month.setLocale('pt-BR').toFormat('LLLL yyyy')}
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn-ghost px-2.5 py-1.5"
            onClick={() => onMonthChange(month.minus({ months: 1 }))}
            disabled={!canGoBack}
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn-ghost px-2.5 py-1.5"
            onClick={() => onMonthChange(month.plus({ months: 1 }))}
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-400">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <div key={`${initial}-${index}`} className="py-1.5">
            {initial}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;

          const iso = day.toISODate() as string;
          const isAvailable = availableDates.has(iso);
          const isSelected = iso === selectedDate;
          const isPast = iso < floor;

          return (
            <button
              key={iso}
              type="button"
              disabled={!isAvailable || isPast || loading}
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              aria-label={`${day.setLocale('pt-BR').toFormat("d 'de' LLLL")}${
                isAvailable ? '' : ' — sem horários'
              }`}
              className={clsx(
                'aspect-square rounded-xl text-sm font-medium transition',
                isSelected && 'bg-ink-900 text-white',
                !isSelected && isAvailable && 'bg-brand-50 text-brand-800 hover:bg-brand-100',
                !isAvailable && 'text-ink-300',
                loading && isAvailable && !isSelected && 'opacity-60',
              )}
            >
              {day.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
