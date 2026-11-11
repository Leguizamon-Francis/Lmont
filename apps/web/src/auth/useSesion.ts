import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginInput } from '@lmont/shared';
import { api, ApiRequestError } from '../api/client';

export type UsuarioSesion = { id: number; usuario: string; nombre: string; rol: string };

export function useSesion() {
  return useQuery({
    queryKey: ['sesion'],
    queryFn: async () => {
      try {
        return await api<UsuarioSesion>('/auth/me');
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LoginInput) => api<UsuarioSesion>('/auth/login', { body: data }),
    onSuccess: (u) => qc.setQueryData(['sesion'], u),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(['sesion'], null);
    },
  });
}
