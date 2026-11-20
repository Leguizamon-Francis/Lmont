import { Link as RouterLink } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Paper, Stack, Typography } from '@mui/material';
import PointOfSaleIcon from '@mui/icons-material/PointOfSaleOutlined';
import { formatMonto, type ListaVentas } from '@lmont/shared';
import { useSesion } from '../auth/useSesion';
import { api } from '../api/client';

type ResumenStock = { stockBajo: number; sinStock: number; unidades: number };

export function InicioPage() {
  const { data: usuario } = useSesion();
  const { data: stock } = useQuery({ queryKey: ['stock', 'resumen'], queryFn: () => api<ResumenStock>('/stock/resumen') });
  const { data: ventas } = useQuery({ queryKey: ['ventas', 'hoy'], queryFn: () => api<ListaVentas>('/ventas') });
  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4">Hola{usuario ? `, ${usuario.nombre}` : ''}</Typography>
        <Button component={RouterLink} to="/ventas" variant="contained" size="large" startIcon={<PointOfSaleIcon />}>
          Nueva venta
        </Button>
      </Stack>

      {ventas && (
        <Paper sx={{ p: 2.5 }}>
          <Typography color="text.secondary">Vendido hoy</Typography>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {formatMonto(ventas.totales.total)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {ventas.totales.ventas} {ventas.totales.ventas === 1 ? 'venta' : 'ventas'} · {ventas.totales.unidades}{' '}
            {ventas.totales.unidades === 1 ? 'prenda' : 'prendas'}
          </Typography>
          <Button component={RouterLink} to="/ventas?tab=dia" size="small" sx={{ ml: -1, mt: 0.5 }}>
            Ver ventas del día
          </Button>
        </Paper>
      )}

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
          Ya podés vender escaneando las prendas (el stock se descuenta solo), cargar productos, ingresar mercadería, ajustar el
          stock, ver lo que se está terminando y llevar la caja. Las demás secciones del menú se habilitan en las próximas etapas:
          promociones, cambios, clientes y reportes.
        </Typography>
      </Paper>
    </Stack>
  );
}
