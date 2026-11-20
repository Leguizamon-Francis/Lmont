import { Link as RouterLink, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { formatFecha, formatMonto, type IngresoDetalle } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';

export function IngresoPage() {
  const id = Number(useParams().id);
  const { data: i, isPending, error } = useQuery({
    queryKey: ['ingresos', 'detalle', id],
    queryFn: () => api<IngresoDetalle>(`/ingresos/${id}`),
  });

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Box>
        <Button component={RouterLink} to="/stock?tab=ingresos" startIcon={<ArrowBackIcon />} sx={{ ml: -1 }}>
          Ingresos
        </Button>
      </Box>
      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {i && (
        <>
          <Paper sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography color="text.secondary">Ingreso de mercadería del {formatFecha(i.fecha)}</Typography>
            <Typography variant="h5" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {i.proveedor?.nombre ?? 'Sin proveedor'}
              {i.pagadoConCaja && <Chip label="Pagado con caja" size="small" variant="outlined" />}
            </Typography>
            <Stack direction="row" spacing={4} sx={{ mt: 2 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Unidades</Typography>
                <Typography variant="h6">{i.unidades}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Total</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatMonto(i.total)}</Typography>
              </Box>
            </Stack>
            {i.nota && <Typography sx={{ mt: 2 }} color="text.secondary">{i.nota}</Typography>}
          </Paper>
          <Paper sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Prenda</TableCell>
                  <TableCell align="right">Cant.</TableCell>
                  <TableCell align="right">Costo</TableCell>
                  <TableCell align="right">Subtotal</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {i.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <RouterLink to={`/productos/${it.variante.producto.id}?variante=${it.variante.id}`}>
                        {it.variante.producto.tipo.nombre} {it.variante.producto.nombre}
                      </RouterLink>
                      <Typography variant="body2" color="text.secondary">
                        {it.variante.color.nombre} · {it.variante.talle.nombre}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{it.cantidad}</TableCell>
                    <TableCell align="right">{formatMonto(it.costoUnitario)}</TableCell>
                    <TableCell align="right">{formatMonto(it.cantidad * it.costoUnitario)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
          <Typography variant="body2" color="text.secondary">
            Si algo se cargó mal, corregí el stock desde la variante con "Ajustar stock".
          </Typography>
        </>
      )}
    </Stack>
  );
}
