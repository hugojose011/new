'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { apiFetch } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import { EventTypeEditor, type EventTypeFormValues } from '../event-type-editor';

interface EventTypeResponse extends Omit<EventTypeFormValues, 'description' | 'locationValue' | 'slug'> {
  id: string;
  slug: string;
  description: string | null;
  locationValue: string | null;
}

export default function EditEventTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading } = useQuery({
    queryKey: ['event-type', id],
    queryFn: () => apiFetch<EventTypeResponse>(`/event-types/${id}`),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;

  return (
    <EventTypeEditor
      eventTypeId={id}
      initial={{
        name: data.name,
        slug: data.slug,
        description: data.description ?? '',
        scheduleId: data.scheduleId,
        durationMinutes: data.durationMinutes,
        slotIntervalMinutes: data.slotIntervalMinutes,
        locationType: data.locationType,
        locationValue: data.locationValue ?? '',
        bufferBeforeMinutes: data.bufferBeforeMinutes,
        bufferAfterMinutes: data.bufferAfterMinutes,
        minimumNoticeMinutes: data.minimumNoticeMinutes,
        bookingWindowDays: data.bookingWindowDays,
        maxBookingsPerDay: data.maxBookingsPerDay,
        questions: data.questions ?? [],
      }}
    />
  );
}
