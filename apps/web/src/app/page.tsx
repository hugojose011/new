import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Agenda</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
        Compartilhe um link. Receba agendamentos sem trocar e-mails.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-ink-600">
        Conecte sua Google Agenda, defina quando você atende e deixe que as pessoas escolham um
        horário realmente livre. O evento e o Meet são criados automaticamente.
      </p>

      <div className="mt-9 flex flex-wrap gap-3">
        <Link href="/cadastro" className="btn-primary px-5 py-3">
          Criar conta
        </Link>
        <Link href="/entrar" className="btn-secondary px-5 py-3">
          Entrar
        </Link>
      </div>

      <ul className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          {
            title: 'Disponibilidade real',
            text: 'Free/Busy do Google, reservas internas, buffers e limites diários no mesmo cálculo.',
          },
          {
            title: 'Sem reserva duplicada',
            text: 'A sobreposição é impedida pelo próprio banco de dados, não só pela tela.',
          },
          {
            title: 'Fusos corretos',
            text: 'Você define no seu fuso; o convidado enxerga no dele, inclusive no horário de verão.',
          },
        ].map((feature) => (
          <li key={feature.title} className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900">{feature.title}</h2>
            <p className="mt-2 text-sm text-ink-600">{feature.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
