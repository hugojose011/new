'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-ink-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink-800">{title}</p>
      <p className="max-w-md text-sm text-ink-500">{description}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'success' && 'bg-emerald-50 text-emerald-700',
        tone === 'warning' && 'bg-amber-50 text-amber-700',
        tone === 'danger' && 'bg-red-50 text-red-700',
        tone === 'neutral' && 'bg-ink-100 text-ink-700',
      )}
    >
      {children}
    </span>
  );
}

export function TimezonePicker({
  value,
  onChange,
  options,
  id = 'timezone',
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  id?: string;
}) {
  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Fuso horário"
    >
      {options.map((timezone) => (
        <option key={timezone} value={timezone}>
          {timezone.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}
