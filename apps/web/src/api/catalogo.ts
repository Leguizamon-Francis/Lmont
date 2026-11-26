import { useQuery } from '@tanstack/react-query';
import type { ItemLista, ProductoDetalle, Talle, VarianteEncontrada } from '@lmont/shared';
import { api, ApiRequestError } from './client';

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

/** Busca la prenda por código de barras exacto. `null` si ese código no está cargado. */
export async function buscarPorCodigo(codigo: string): Promise<VarianteEncontrada | null> {
  try {
    return await api<VarianteEncontrada>(`/variantes/codigo/${encodeURIComponent(codigo)}`);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
}

/** "Remera Básica · Negro M" */
export const nombreVariante = (v: Pick<VarianteEncontrada, 'producto' | 'color' | 'talle'>) =>
  `${v.producto.tipo.nombre} ${v.producto.nombre} · ${v.color.nombre} ${v.talle.nombre}`;
