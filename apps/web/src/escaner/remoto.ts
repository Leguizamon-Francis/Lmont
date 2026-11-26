import { useEffect, useRef } from 'react';

/**
 * Códigos que llegan desde el celular (pantalla Escáner) a la pantalla abierta en la notebook.
 * Se escucha una sola conexión por pestaña; el código va a la última pantalla o diálogo que lo
 * pidió (por ejemplo, el diálogo de una variante abierto sobre la lista de productos), solo si la
 * pestaña está a la vista y es una computadora: así un celular que también está vendiendo no
 * recibe los códigos de otro.
 */

type Receptor = { current: (codigo: string) => void };

const receptores: Receptor[] = [];
let fuente: EventSource | null = null;
let reintento: ReturnType<typeof setTimeout> | undefined;

export const esComputadora = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function conectar() {
  if (fuente || !receptores.length) return;
  const f = new EventSource('/api/escaner/eventos');
  fuente = f;
  f.onmessage = (e: MessageEvent<string>) => {
    if (document.visibilityState !== 'visible') return;
    try {
      const { codigo } = JSON.parse(e.data) as { codigo?: unknown };
      if (typeof codigo === 'string') receptores.at(-1)?.current(codigo);
    } catch {
      // mensaje inválido: se ignora
    }
  };
  // Si se cortó del todo (por ejemplo, el servidor se reinició), se vuelve a intentar.
  f.onerror = () => {
    if (f.readyState !== EventSource.CLOSED) return;
    fuente = null;
    clearTimeout(reintento);
    reintento = setTimeout(conectar, 10_000);
  };
}

function desconectar() {
  clearTimeout(reintento);
  fuente?.close();
  fuente = null;
}

/** Recibe los códigos escaneados con el celular mientras el componente está en pantalla. */
export function useCodigosRemotos(onCodigo: (codigo: string) => void, activo = true) {
  const ref = useRef(onCodigo);
  useEffect(() => {
    ref.current = onCodigo;
  });
  useEffect(() => {
    if (!activo || !esComputadora()) return;
    const r: Receptor = { current: (c) => ref.current(c) };
    receptores.push(r);
    conectar();
    return () => {
      receptores.splice(receptores.indexOf(r), 1);
      if (!receptores.length) desconectar();
    };
  }, [activo]);
}
