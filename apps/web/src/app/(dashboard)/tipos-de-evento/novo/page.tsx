'use client';

import { useQuery } from '@tanstack/react-query';
import type { AvailabilityScheduleDto } from '@agenda/shared';
import { apiFetch } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import { EMPTY_EVENT_TYPE, EventTypeEditor } from '../event-type-editor';

export default function NewEventTypePage() {
  const { data: schedules, isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => apiFetch<AvailabilityScheduleDto[]>('/availability-schedules'),
  });

  if (isLoading || !schedules) return <Skeleton className="h-96 w-full" />;

  const defaultSchedule = schedules.find((schedule) => schedule.isDefault) ?? schedules[0];

  return (
    <EventTypeEditor
      initial={{ ...EMPTY_EVENT_TYPE, scheduleId: defaultSchedule?.id ?? '' }}
    />
  );
}
