import { useSearchParams } from 'react-router';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { NuevaVenta } from './NuevaVenta';
import { VentasDelDia } from './VentasDelDia';

const SECCIONES = [
  { id: 'nueva', texto: 'Nueva venta', panel: <NuevaVenta /> },
  { id: 'dia', texto: 'Ventas del día', panel: <VentasDelDia /> },
] as const;

export function VentasPage() {
  const [params, setParams] = useSearchParams();
  const actual = Math.max(0, SECCIONES.findIndex((s) => s.id === params.get('tab')));
  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
        Ventas
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={actual} onChange={(_, v: number) => setParams({ tab: SECCIONES[v]!.id }, { replace: true })}>
          {SECCIONES.map((s) => (
            <Tab key={s.id} label={s.texto} />
          ))}
        </Tabs>
      </Box>
      {SECCIONES[actual]!.panel}
    </Stack>
  );
}
