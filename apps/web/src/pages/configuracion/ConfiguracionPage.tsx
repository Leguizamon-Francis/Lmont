import { useState } from 'react';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { VendedoresPanel } from './VendedoresPanel';
import { CuentaPanel } from './CuentaPanel';
import { ListaPanel } from './ListaPanel';

const SECCIONES = [
  { id: 'vendedores', texto: 'Vendedores', panel: <VendedoresPanel /> },
  { id: 'tipos', texto: 'Tipos de prenda', panel: <ListaPanel key="tipos" tipo="tipos" /> },
  { id: 'talles', texto: 'Talles', panel: <ListaPanel key="talles" tipo="talles" /> },
  { id: 'colores', texto: 'Colores', panel: <ListaPanel key="colores" tipo="colores" /> },
  { id: 'cuenta', texto: 'Mi cuenta', panel: <CuentaPanel /> },
] as const;

export function ConfiguracionPage() {
  const [tab, setTab] = useState(0);
  return (
    <Stack spacing={2} sx={{ maxWidth: 800 }}>
      <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
        Configuración
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" allowScrollButtonsMobile>
          {SECCIONES.map((s) => (
            <Tab key={s.id} label={s.texto} />
          ))}
        </Tabs>
      </Box>
      {SECCIONES[tab]?.panel}
    </Stack>
  );
}
