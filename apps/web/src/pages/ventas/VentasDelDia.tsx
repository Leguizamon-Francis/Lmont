import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Box, Chip, IconButton, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { formatHora, formatMonto, hoy, MEDIOS_PAGO, nombrePlan, type ListaVentas } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { moverDia } from '../../fechas';

/** Lo vendido en un día, con los totales por medio de pago. */
export function VentasDelDia() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fecha = params.get('fecha') ?? hoy();
  const esHoy = fecha >= hoy();
  const cambiarFecha = (f: string) => setParams({ tab: 'dia', fecha: f }, { replace: true });

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ['ventas', fecha],
    queryFn: () => api<ListaVentas>(`/ventas?fecha=${fecha}`),
    placeholderData: keepPreviousData,
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <IconButton aria-label="Día anterior" onClick={() => cambiarFecha(moverDia(fecha, -1))}>
          <ChevronLeftIcon />
        </IconButton>
        <TextField
          type="date"
          size="small"
          label="Día"
          value={fecha}
          onChange={(e) => e.target.value && cambiarFecha(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: hoy() } }}
          sx={{ maxWidth: 190 }}
        />
        <IconButton aria-label="Día siguiente" disabled={esHoy} onClick={() => cambiarFecha(moverDia(fecha, 1))}>
          <ChevronRightIcon />
        </IconButton>
      </Stack>

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}

      {data && (
        <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
              <Box>
                <Typography color="text.secondary">Vendido {esHoy ? 'hoy' : 'ese día'}</Typography>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {formatMonto(data.totales.total)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.totales.ventas} {data.totales.ventas === 1 ? 'venta' : 'ventas'} · {data.totales.unidades}{' '}
                  {data.totales.unidades === 1 ? 'prenda' : 'prendas'}
                </Typography>
              </Box>
              {data.totales.porMedio.length > 0 && (
                <Stack spacing={0.5} sx={{ minWidth: 200 }}>
                  {data.totales.porMedio.map((m) => (
                    <Stack key={m.medio} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                      <Typography color="text.secondary">{MEDIOS_PAGO[m.medio]}</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{formatMonto(m.total)}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Paper>
            {data.ventas.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 3 }}>
                No hay ventas {esHoy ? 'todavía hoy' : 'ese día'}.
              </Typography>
            ) : (
              <List disablePadding>
                {data.ventas.map((v) => (
                  <ListItemButton key={v.id} divider onClick={() => navigate(`/ventas/${v.id}`)} sx={{ py: 1.5, opacity: v.anulada ? 0.6 : 1 }}>
                    <ListItemText
                      primary={
                        <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                          <b>{formatHora(v.creadoEn)}</b>
                          <span>{v.descripcion}</span>
                          {v.anulada && <Chip label="Anulada" size="small" color="error" variant="outlined" />}
                        </Box>
                      }
                      secondary={[
                        `${v.unidades} ${v.unidades === 1 ? 'prenda' : 'prendas'}`,
                        v.pagos.map(nombrePlan).join(' + '),
                        v.vendedor?.nombre,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                    <Typography
                      sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap', textDecoration: v.anulada ? 'line-through' : undefined }}
                    >
                      {formatMonto(v.total)}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
        </Box>
      )}
    </Stack>
  );
}
