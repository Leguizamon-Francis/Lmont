import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, List, ListItemButton, ListItemText, Paper, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/EditOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { formatFecha, formatMonto, hoy, linkWhatsapp, nombrePlan, type ClienteDetalle } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { ClienteDialog } from './ClienteDialog';

const fechaLocal = (iso: string) => formatFecha(hoy(new Date(iso)));

/** Ficha del cliente con su historial de compras. */
export function ClientePage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [editando, setEditando] = useState(false);
  const { data: c, isPending, error } = useQuery({ queryKey: ['clientes', 'detalle', id], queryFn: () => api<ClienteDetalle>(`/clientes/${id}`) });

  if (isPending) return <Typography color="text.secondary">Cargando…</Typography>;
  if (error || !c) return <Alert severity="error">{mensajeDeError(error)}</Alert>;

  return (
    <Stack spacing={2} sx={{ maxWidth: 800 }}>
      <Box>
        <Button component={RouterLink} to="/clientes" startIcon={<ArrowBackIcon />} sx={{ ml: -1 }}>
          Clientes
        </Button>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {c.nombre}
              {!c.activo && <Chip label="Inactivo" />}
            </Typography>
            {c.whatsapp && <Typography color="text.secondary">WhatsApp {c.whatsapp}</Typography>}
          </Box>
          <Stack direction="row" spacing={1}>
            {c.whatsapp && (
              <Button variant="outlined" color="success" startIcon={<WhatsAppIcon />} href={linkWhatsapp(c.whatsapp)} target="_blank" rel="noopener">
                Escribirle
              </Button>
            )}
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditando(true)}>
              Editar
            </Button>
          </Stack>
        </Stack>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mt: 2 }}>
          <Typography color="text.secondary">Talles:</Typography>
          {c.talles.length ? c.talles.map((t) => <Chip key={t.id} label={t.nombre} />) : <Typography color="text.secondary">sin cargar</Typography>}
        </Box>
        {c.notas && <Typography sx={{ mt: 1.5, whiteSpace: 'pre-line' }}>{c.notas}</Typography>}
      </Paper>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Dato titulo="Compras" valor={String(c.compras)} />
        <Dato titulo="Total comprado" valor={formatMonto(c.totalComprado)} />
        <Dato titulo="Última compra" valor={c.ultimaCompra ? fechaLocal(c.ultimaCompra) : '—'} />
      </Stack>

      <Paper>
        <Typography sx={{ px: 2, py: 1.5, fontWeight: 600, bgcolor: 'action.hover' }}>Historial de compras</Typography>
        {c.ventas.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            Todavía no tiene compras. Elegilo como cliente al vender para que queden acá.
          </Typography>
        ) : (
          <List disablePadding>
            {c.ventas.map((v) => (
              <ListItemButton key={v.id} divider onClick={() => navigate(`/ventas/${v.id}`)} sx={{ py: 1.5, opacity: v.anulada ? 0.6 : 1 }}>
                <ListItemText
                  primary={
                    <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <b>{fechaLocal(v.creadoEn)}</b>
                      <span>{v.descripcion}</span>
                      {v.anulada && <Chip label="Anulada" size="small" color="error" variant="outlined" />}
                      {v.conCambios && <Chip label="Con cambios" size="small" variant="outlined" />}
                    </Box>
                  }
                  secondary={[`${v.unidades} ${v.unidades === 1 ? 'prenda' : 'prendas'}`, v.pagos.map(nombrePlan).join(' + ')].join(' · ')}
                />
                <Typography sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap', textDecoration: v.anulada ? 'line-through' : undefined }}>
                  {formatMonto(v.total)}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>

      {editando && <ClienteDialog cliente={c} onClose={() => setEditando(false)} />}
    </Stack>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Paper sx={{ p: 2.5, flex: 1 }}>
      <Typography color="text.secondary">{titulo}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {valor}
      </Typography>
    </Paper>
  );
}
