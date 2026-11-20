import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Chip, InputAdornment, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import {
  formatFecha,
  formatHora,
  formatMonto,
  hoy,
  MEDIOS_PAGO,
  nombrePlan,
  type CambioResumen,
  type VarianteEncontrada,
  type VentaResumen,
} from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';
import { ClienteSelector, type ClienteElegido } from '../../components/ClienteSelector';

const fechaLocal = (iso: string) => formatFecha(hoy(new Date(iso)));

type Busqueda = { titulo: string; url: string };

/** Encontrar la venta sobre la que se hace el cambio, y los últimos cambios registrados. */
export function CambiosPage() {
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const ventas = useQuery({
    queryKey: ['ventas', 'buscar', busqueda?.url],
    queryFn: () => api<VentaResumen[]>(busqueda!.url),
    enabled: !!busqueda,
  });
  const ultimos = useQuery({ queryKey: ['cambios'], queryFn: () => api<CambioResumen[]>('/cambios') });

  const escanear = async (e: FormEvent) => {
    e.preventDefault();
    const t = codigo.trim();
    setAviso(null);
    if (!t) return;
    try {
      const v = await api<VarianteEncontrada>(`/variantes/codigo/${encodeURIComponent(t)}`);
      setCliente(null);
      setBusqueda({ titulo: `Ventas con ${v.producto.tipo.nombre} ${v.producto.nombre} ${v.color.nombre} ${v.talle.nombre}`, url: `/ventas/buscar?varianteId=${v.id}` });
    } catch (err) {
      setAviso(err instanceof ApiRequestError && err.status === 404 ? `No hay ninguna prenda con el código ${t}.` : mensajeDeError(err));
    }
    setCodigo('');
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
        Cambios y devoluciones
      </Typography>

      <Paper sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 600 }}>¿De qué venta es la prenda?</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Escaneá la etiqueta de la prenda que trae el cliente o buscalo por nombre. También podés abrir la venta desde{' '}
          <RouterLink to="/ventas?tab=dia">Ventas del día</RouterLink>.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Box component="form" onSubmit={escanear} sx={{ flex: 1 }}>
            <TextField
              autoFocus
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              label="Código de la prenda"
              placeholder="Escaneá y apretá Enter"
              slotProps={{
                input: { startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment> },
                htmlInput: { enterKeyHint: 'search', autoComplete: 'off' },
              }}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <ClienteSelector
              label="Cliente"
              permitirCrear={false}
              value={cliente}
              onChange={(c) => {
                setCliente(c);
                setAviso(null);
                setBusqueda(c ? { titulo: `Compras de ${c.nombre}`, url: `/ventas/buscar?clienteId=${c.id}` } : null);
              }}
            />
          </Box>
        </Stack>
        {aviso && <Alert severity="warning" sx={{ mt: 1.5 }}>{aviso}</Alert>}
      </Paper>

      {busqueda && (
        <Paper>
          <Typography sx={{ px: 2, py: 1.5, fontWeight: 600, bgcolor: 'action.hover' }}>{busqueda.titulo}</Typography>
          {ventas.error && <Alert severity="error">{mensajeDeError(ventas.error)}</Alert>}
          {ventas.isPending && <Typography color="text.secondary" sx={{ p: 2 }}>Buscando…</Typography>}
          {ventas.data?.length === 0 && (
            <Typography color="text.secondary" sx={{ p: 2 }}>
              No se encontraron ventas. Solo se pueden cambiar prendas vendidas con el sistema.
            </Typography>
          )}
          <List disablePadding>
            {ventas.data?.map((v) => (
              <ListItemButton key={v.id} divider onClick={() => navigate(`/ventas/${v.id}/cambio`)} sx={{ py: 1.5 }}>
                <ListItemText
                  primary={
                    <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <b>
                        {fechaLocal(v.creadoEn)} {formatHora(v.creadoEn)}
                      </b>
                      <span>{v.descripcion}</span>
                      {v.conCambios && <Chip label="Ya tuvo cambios" size="small" variant="outlined" />}
                    </Box>
                  }
                  secondary={[`Venta N° ${v.id}`, v.cliente?.nombre, `${v.unidades} ${v.unidades === 1 ? 'prenda' : 'prendas'}`, v.pagos.map(nombrePlan).join(' + ')]
                    .filter(Boolean)
                    .join(' · ')}
                />
                <Typography sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap' }}>{formatMonto(v.total)}</Typography>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      <Paper>
        <Typography sx={{ px: 2, py: 1.5, fontWeight: 600, bgcolor: 'action.hover' }}>Últimos cambios y devoluciones</Typography>
        {ultimos.error && <Alert severity="error">{mensajeDeError(ultimos.error)}</Alert>}
        {ultimos.data?.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            Todavía no hubo cambios ni devoluciones.
          </Typography>
        )}
        <List disablePadding>
          {ultimos.data?.map((c) => (
            <ListItemButton key={c.id} divider onClick={() => navigate(`/ventas/${c.ventaId}`)} sx={{ py: 1.5 }}>
              <ListItemText
                primary={
                  <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b>
                      {fechaLocal(c.creadoEn)} {formatHora(c.creadoEn)}
                    </b>
                    <Chip label={c.devolucion ? 'Devolución' : 'Cambio'} size="small" color={c.devolucion ? 'warning' : 'primary'} variant="outlined" />
                    <span>{c.descripcion}</span>
                  </Box>
                }
                secondary={[`Venta N° ${c.ventaId}`, c.cliente?.nombre, c.vendedor?.nombre].filter(Boolean).join(' · ')}
              />
              <Box sx={{ ml: 2, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {c.diferencia === 0 ? (
                  <Typography color="text.secondary">Sin diferencia</Typography>
                ) : (
                  <>
                    <Typography sx={{ fontWeight: 600 }} color={c.diferencia < 0 ? 'error' : 'success.main'}>
                      {c.diferencia < 0 ? '− ' : '+ '}
                      {formatMonto(Math.abs(c.pagos.reduce((s, p) => s + p.cobrado, 0)))}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {c.pagos.map((p) => MEDIOS_PAGO[p.medio]).join(' + ')}
                    </Typography>
                  </>
                )}
              </Box>
            </ListItemButton>
          ))}
        </List>
      </Paper>
    </Stack>
  );
}
