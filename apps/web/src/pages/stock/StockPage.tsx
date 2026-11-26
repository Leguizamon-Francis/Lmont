import { useSearchParams } from 'react-router';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { NuevoIngreso } from './NuevoIngreso';
import { StockBajo } from './StockBajo';
import { IngresosLista } from './IngresosLista';

const SECCIONES = [
  { id: 'ingresar', texto: 'Ingresar mercadería', panel: <NuevoIngreso /> },
  { id: 'bajo', texto: 'Stock bajo', panel: <StockBajo /> },
  { id: 'ingresos', texto: 'Ingresos anteriores', panel: <IngresosLista /> },
] as const;

export function StockPage() {
  const [params, setParams] = useSearchParams();
  const actual = Math.max(0, SECCIONES.findIndex((s) => s.id === params.get('tab')));
  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
        Stock
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={actual} onChange={(_, v: number) => setParams({ tab: SECCIONES[v]!.id }, { replace: true })} variant="scrollable" allowScrollButtonsMobile>
          {SECCIONES.map((s) => (
            <Tab key={s.id} label={s.texto} />
          ))}
        </Tabs>
      </Box>
      {SECCIONES[actual]!.panel}
    </Stack>
  );
}
