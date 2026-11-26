import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { api, mensajeDeError } from '../../api/client';
import { SelectorPeriodo, usePeriodo, type Periodo } from './periodo';
import { ResumenTab } from './ResumenTab';
import { MesAMesTab } from './MesAMesTab';
import { VentasTab } from './VentasTab';
import { MercaderiaTab } from './MercaderiaTab';
import { ClientesTab } from './ClientesTab';
import { CambiosTab } from './CambiosTab';

const VISTAS = [
  { id: 'resumen', texto: 'Resumen' },
  { id: 'meses', texto: 'Mes a mes' },
  { id: 'ventas', texto: 'Ventas' },
  { id: 'mercaderia', texto: 'Mercadería' },
  { id: 'clientes', texto: 'Clientes' },
  { id: 'cambios', texto: 'Cambios' },
] as const;
type Vista = (typeof VISTAS)[number]['id'];

export function ReportesPage() {
  const [params, setParams] = useSearchParams();
  const vista = (VISTAS.find((v) => v.id === params.get('vista'))?.id ?? 'resumen') as Vista;
  const [periodo, setPeriodo] = usePeriodo();
  const cambiarVista = (v: Vista) => {
    const s = new URLSearchParams(params);
    if (v === 'resumen') s.delete('vista');
    else s.set('vista', v);
    setParams(s, { replace: true });
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 1100 }}>
      <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
        Reportes
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={vista} variant="scrollable" allowScrollButtonsMobile onChange={(_, v: Vista) => cambiarVista(v)}>
          {VISTAS.map((v) => (
            <Tab key={v.id} value={v.id} label={v.texto} />
          ))}
        </Tabs>
      </Box>
      {/* "Mes a mes" muestra siempre los últimos 12 meses: no usa el período. */}
      {vista !== 'meses' && <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />}
      {vista === 'resumen' && <ResumenTab periodo={periodo} />}
      {vista === 'meses' && (
        <MesAMesTab
          onElegirMes={(p) => {
            setParams({ desde: p.desde, hasta: p.hasta }, { replace: true });
          }}
        />
      )}
      {vista === 'ventas' && <VentasTab periodo={periodo} />}
      {vista === 'mercaderia' && <MercaderiaTab periodo={periodo} />}
      {vista === 'clientes' && <ClientesTab periodo={periodo} />}
      {vista === 'cambios' && <CambiosTab periodo={periodo} />}
    </Stack>
  );
}

/** Pide un reporte del período. Mientras recarga, deja lo anterior a la vista (más tenue). */
export function useReporte<T>(ruta: string, periodo: Periodo | null, extra = '') {
  const qs = periodo ? `desde=${periodo.desde}&hasta=${periodo.hasta}${extra}` : extra.replace(/^&/, '');
  return useQuery({
    queryKey: ['reportes', ruta, qs],
    queryFn: () => api<T>(`/reportes/${ruta}${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

/** Estado de carga y error comunes, y el contenido atenuado mientras se actualiza. */
export function Contenido<T>({ q, children }: { q: { data?: T; isPending: boolean; isFetching: boolean; error: unknown }; children: (data: T) => ReactNode }) {
  return (
    <>
      {q.error ? <Alert severity="error">{mensajeDeError(q.error)}</Alert> : null}
      {q.isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {q.data && (
        <Stack spacing={2} sx={{ opacity: q.isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          {children(q.data)}
        </Stack>
      )}
    </>
  );
}
