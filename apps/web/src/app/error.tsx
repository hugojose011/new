'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  // Nunca exibimos stack trace ao usuário (§61); o detalhe fica no log do servidor.
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Algo deu errado</h1>
      <p className="mt-2 text-sm text-ink-500">
        Não foi possível concluir a operação. Tente novamente em instantes.
      </p>
      <button type="button" className="btn-secondary mx-auto mt-6" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
