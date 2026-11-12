import { Paper, Stack, Typography } from '@mui/material';
import { useSesion } from '../auth/useSesion';

export function InicioPage() {
  const { data: usuario } = useSesion();
  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <Typography variant="h4">Hola{usuario ? `, ${usuario.nombre}` : ''}</Typography>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Sistema en construcción
        </Typography>
        <Typography color="text.secondary">
          Ya podés cargar los productos con sus colores, talles y códigos de barras. En Configuración están los
          vendedores y las listas de tipos de prenda, talles y colores. Las demás secciones del menú se habilitan en las
          próximas etapas: stock, ventas, promociones, cambios, caja y reportes.
        </Typography>
      </Paper>
    </Stack>
  );
}
