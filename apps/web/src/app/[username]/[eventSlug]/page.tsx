import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PublicEventTypeDto } from '@agenda/shared';
import { API_URL } from '@/lib/api';
import { BookingFlow } from './booking-flow';

interface PageProps {
  params: Promise<{ username: string; eventSlug: string }>;
}

/** Busca no servidor para a primeira pintura da página ser rápida (§67). */
async function loadEventType(username: string, slug: string): Promise<PublicEventTypeDto | null> {
  const response = await fetch(`${API_URL}/public/${username}/${slug}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username, eventSlug } = await params;
  const eventType = await loadEventType(username, eventSlug);
  if (!eventType) return { title: 'Agendamento não encontrado' };

  return {
    title: `${eventType.name} com ${eventType.host.name}`,
    description: eventType.description ?? `Escolha um horário com ${eventType.host.name}.`,
  };
}

export default async function PublicBookingPage({ params }: PageProps) {
  const { username, eventSlug } = await params;
  const eventType = await loadEventType(username, eventSlug);
  if (!eventType) notFound();

  return <BookingFlow eventType={eventType} username={username} />;
}
