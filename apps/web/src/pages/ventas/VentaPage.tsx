import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { formatFecha, formatHora, formatMonto, hoy, nombrePlan, textoPorcentaje, type VentaDetalle } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';

const fechaLocal = (iso: string) => hoy(new Date(iso));

export function VentaPage() {
  const id = Number(useParams().id);
  const [anulando, setAnulando] = useState(false);
  const { data: v, isPending, error } = useQuery({ queryKey: ['ventas', 'detalle', id], queryFn: () => api<VentaDetalle>(`/ventas/${id}`) });

  if (isPending) return <Typography color="text.secondary">Cargando…</Typography>;
  if (error || !v) return <Alert severity="error">{mensajeDeError(error)}</Alert>;
  const dia = fechaLocal(v.creadoEn);

  return (
    <Stack spacing={2} sx={{ maxWidth: 800 }}>
      <Box>
        <Button component={RouterLink} to={`/ventas?tab=dia&fecha=${dia}`} startIcon={<ArrowBackIcon />} sx={{ ml: -1 }}>
          Ventas del {formatFecha(dia)}
        </Button>
      </Box>

      {v.anulada && (
        <Alert severity="warning">
          Venta anulada{v.anuladaEn ? ` el ${formatFecha(fechaLocal(v.anuladaEn))} a las ${formatHora(v.anuladaEn)}` : ''}: {v.motivoAnulacion}. El
          stock ya se devolvió y no suma en los totales.
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography color="text.secondary">
              {formatFecha(dia)} · {formatHora(v.creadoEn)}
              {v.vendedor ? ` · vendió ${v.vendedor.nombre}` : ''}
            </Typography>
            <Typography variant="h4">Venta N° {v.id}</Typography>
          </Box>
          {!v.anulada && (
            <Button color="error" variant="outlined" onClick={() => setAnulando(true)}>
              Anular venta
            </Button>
          )}
        </Stack>
        {v.nota && (
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>
            {v.nota}
          </Typography>
        )}
      </Paper>

      <Paper>
        {v.items.map((it, i) => (
          <Box key={it.id}>
            {i > 0 && <Divider />}
            <Stack direction="row" spacing={2} sx={{ p: 2, alignItems: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  <RouterLink to={`/productos/${it.variante.producto.id}?variante=${it.variante.id}`} style={{ color: 'inherit' }}>
                    {it.variante.producto.tipo.nombre} {it.variante.producto.nombre}
                  </RouterLink>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {it.variante.color.nombre} · {it.variante.talle.nombre} · {it.cantidad} × {formatMonto(it.precioUnitario)}
                  {it.precioUnitario !== it.precioLista && ` (lista ${formatMonto(it.precioLista)})`}
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMonto(it.cantidad * it.precioUnitario)}</Typography>
            </Stack>
          </Box>
        ))}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Fila texto="Subtotal" valor={formatMonto(v.subtotal)} />
          {v.pagos.map((p) => (
            <Box key={p.id}>
              <Fila texto={nombrePlan(p)} valor={formatMonto(p.cobrado)} />
              {!!p.porcentaje && (
                <Typography variant="body2" color="text.secondary">
                  {formatMonto(p.monto)} con {textoPorcentaje(p.porcentaje)} ({p.ajuste > 0 ? '+' : ''}
                  {formatMonto(p.ajuste)})
                </Typography>
              )}
            </Box>
          ))}
          <Divider />
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography variant="h6">Total cobrado</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, textDecoration: v.anulada ? 'line-through' : undefined }}>
              {formatMonto(v.total)}
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {anulando && <AnularDialog venta={v} onClose={() => setAnulando(false)} />}
    </Stack>
  );
}

function Fila({ texto, valor }: { texto: string; valor: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
      <Typography color="text.secondary">{texto}</Typography>
      <Typography>{valor}</Typography>
    </Stack>
  );
}

function AnularDialog({ venta, onClose }: { venta: VentaDetalle; onClose: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const anular = useMutation({
    mutationFn: () => api<VentaDetalle>(`/ventas/${venta.id}/anular`, { body: { motivo } }),
    onSuccess: () => {
      for (const k of ['ventas', 'productos', 'producto', 'stock', 'caja']) qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          anular.mutate();
        }}
      >
        <DialogTitle>¿Anular la venta N° {venta.id}?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Usalo cuando la venta se cargó por error. Las {venta.unidades} {venta.unidades === 1 ? 'prenda vuelve' : 'prendas vuelven'} al stock
              y los {formatMonto(venta.total)} dejan de contar. Si el cliente devuelve algo, usá Cambios y devoluciones.
            </Typography>
            <TextField
              autoFocus
              label="Motivo"
              placeholder="Ej: se cargó dos veces"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              error={!!anular.error}
              helperText={anular.error ? mensajeDeError(anular.error) : undefined}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" color="error" variant="contained" loading={anular.isPending}>
            Anular venta
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
