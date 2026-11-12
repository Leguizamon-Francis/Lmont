import { useQuery } from '@tanstack/react-query';
import type { ItemLista, ProductoDetalle, Talle } from '@lmont/shared';
import { api } from './client';

export type TipoLista = 'tipos' | 'talles' | 'colores';

/** Tipos de prenda, talles o colores. `soloActivos` para los selectores de carga. */
export function useLista<T extends ItemLista = ItemLista>(tipo: TipoLista, soloActivos = false) {
  return useQuery({
    queryKey: [tipo, soloActivos ? 'activos' : 'todos'],
    queryFn: () => api<T[]>(`/${tipo}${soloActivos ? '?activos=1' : ''}`),
  });
}

export const useTalles = (soloActivos = false) => useLista<Talle>('talles', soloActivos);

export function useProducto(id: number) {
  return useQuery({
    queryKey: ['producto', id],
    queryFn: () => api<ProductoDetalle>(`/productos/${id}`),
  });
}

/** Un texto parece código de barras si no tiene espacios y tiene al menos 4 dígitos. */
export const pareceCodigo = (s: string) => /^[0-9A-Za-z-]+$/.test(s) && (s.match(/\d/g)?.length ?? 0) >= 4;
