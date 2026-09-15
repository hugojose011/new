import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Página não encontrada</h1>
      <p className="mt-2 text-sm text-ink-500">
        O link de agendamento pode ter sido desativado ou o endereço está incorreto.
      </p>
      <Link href="/" className="btn-secondary mx-auto mt-6">
        Voltar ao início
      </Link>
    </main>
  );
}
