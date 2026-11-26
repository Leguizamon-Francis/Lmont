import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, List, ListItemButton, ListItemText, Paper, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import { describirPromo, formatFecha, promoVigente, type Promocion } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { PromocionDialog } from './PromocionDialog';

function vigencia(p: Promocion) {
  if (p.desde && p.hasta) return `Del ${formatFecha(p.desde)} al ${formatFecha(p.hasta)}`;
  if (p.desde) return `Desde el ${formatFecha(p.desde)}`;
  if (p.hasta) return `Hasta el ${formatFecha(p.hasta)}`;
  return null;
}

export function PromocionesPage() {
  const { data, isPending, error } = useQuery({ queryKey: ['promociones', 'todas'], queryFn: () => api<Promocion[]>('/promociones') });
  const [editando, setEditando] = useState<Promocion | 'nueva' | null>(null);

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
          Promociones
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditando('nueva')} sx={{ ml: 'auto' }}>
          Nueva promoción
        </Button>
      </Stack>
      <Typography color="text.secondary">
        Al vender, el sistema avisa qué promos entran con las prendas cargadas y se aplican con un toque. Tocá una promo para editarla,
        desactivarla o eliminarla: las ventas ya hechas no cambian.
      </Typography>

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {data && (
        <Paper>
          {data.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              Todavía no hay promociones. Creá la primera con “Nueva promoción”.
            </Typography>
          ) : (
            <List disablePadding>
              {data.map((p) => {
                const vigente = promoVigente(p);
                return (
                  <ListItemButton key={p.id} divider onClick={() => setEditando(p)} sx={{ py: 1.5, opacity: vigente ? 1 : 0.6 }}>
                    <ListItemText
                      primary={
                        <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                          <b>{p.nombre}</b>
                          {!p.activo ? (
                            <Chip label="Inactiva" size="small" />
                          ) : (
                            !vigente && <Chip label="Fuera de fecha" size="small" color="warning" variant="outlined" />
                          )}
                        </Box>
                      }
                      secondary={[describirPromo(p), vigencia(p)].filter(Boolean).join(' · ')}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 2, whiteSpace: 'nowrap' }}>
                      {p.vendidas ? `${p.vendidas} vendida${p.vendidas === 1 ? '' : 's'}` : 'Sin ventas'}
                    </Typography>
                    <EditIcon color="action" fontSize="small" sx={{ ml: 1.5 }} aria-label="Editar" />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Paper>
      )}

      {editando && <PromocionDialog promo={editando === 'nueva' ? undefined : editando} onClose={() => setEditando(null)} />}
    </Stack>
  );
}
