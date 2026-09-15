'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiFetch } from './api';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  timezone: string;
  locale: string;
  onboardingDone: boolean;
  onboardingStep: number;
  workspaceId: string;
  googleStatus?: 'CONNECTED' | 'DISCONNECTED' | 'REAUTH_REQUIRED' | null;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<CurrentUser>('/auth/me'),
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      router.push('/entrar');
    },
  });
}
