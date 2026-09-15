'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useCurrentUser, useLogout } from '@/lib/auth';
import { Skeleton } from '@/components/ui';

const NAV = [
  { href: '/visao-geral', label: 'Visão geral' },
  { href: '/agendamentos', label: 'Agendamentos' },
  { href: '/tipos-de-evento', label: 'Tipos de evento' },
  { href: '/disponibilidade', label: 'Disponibilidade' },
  { href: '/integracoes', label: 'Integrações' },
  { href: '/configuracoes', label: 'Configurações' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, isLoading, isError } = useCurrentUser();
  const logout = useLogout();

  useEffect(() => {
    if (isError) router.replace('/entrar');
  }, [isError, router]);

  if (isLoading || !user) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-ink-200/70 bg-white lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/visao-geral" className="text-lg font-semibold tracking-tight">
            Agenda
          </Link>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition',
                  active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden border-t border-ink-200/70 p-4 lg:block">
          <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
          <p className="truncate text-xs text-ink-500">{user.email}</p>
          {user.username && (
            <p className="mt-2 truncate text-xs text-ink-400">/{user.username}</p>
          )}
          <button
            type="button"
            className="btn-ghost mt-3 w-full justify-start px-2"
            onClick={() => logout.mutate()}
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
