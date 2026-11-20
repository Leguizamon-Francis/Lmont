import { Link as RouterLink } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Paper, Stack, Typography } from '@mui/material';
import { useSesion } from '../auth/useSesion';
import { api } from '../api/client';

type ResumenStock = { stockBajo: number; sinStock: number; unidades: number };

export function InicioPage() {
  const { data: usuario } = useSesion();
  const { data: stock } = useQuery({ queryKey: ['stock', 'resumen'], queryFn: () => api<ResumenStock>('/stock/resumen') });
  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <Typography variant="h4">Hola{usuario ? `, ${usuario.nombre}` : ''}</Typography>

      {stock && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Paper sx={{ p: 2.5, flex: 1 }}>
            <Typography color="text.secondary">Prendas en stock</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{stock.unidades}</Typography>
          </Paper>
          <Paper sx={{ p: 2.5, flex: 1 }}>
            <Typography color="text.secondary">Con stock bajo</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }} color={stock.stockBajo ? 'warning.main' : undefined}>
              {stock.stockBajo}
            </Typography>
            <Button component={RouterLink} to="/stock?tab=bajo" size="small" sx={{ ml: -1 }}>
              Ver lista
            </Button>
          </Paper>
          <Paper sx={{ p: 2.5, flex: 1 }}>
            <Typography color="text.secondary">Sin stock</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{stock.sinStock}</Typography>
          </Paper>
        </Stack>
      )}

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Sistema en construcción
        </Typography>
        <Typography color="text.secondary">
          Ya podés cargar productos, ingresar mercadería escaneando los códigos, ajustar el stock y ver lo que se está
          terminando. Las demás secciones del menú se habilitan en las próximas etapas: ventas, promociones, cambios, caja y
          reportes.
        </Typography>
      </Paper>
    </Stack>
  );
}
