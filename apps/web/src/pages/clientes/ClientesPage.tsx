import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, InputAdornment, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddIcon from '@mui/icons-material/PersonAddOutlined';
import { formatFecha, formatMonto, hoy, type ListaClientes } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { ClienteDialog } from './ClienteDialog';

export function ClientesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [creando, setCreando] = useState(false);
  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ['clientes', 'lista', q.trim()],
    queryFn: () => api<ListaClientes>(`/clientes?q=${encodeURIComponent(q.trim())}`),
    placeholderData: keepPreviousData,
  });

  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
          Clientes
        </Typography>
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setCreando(true)} sx={{ ml: 'auto' }}>
          Nuevo cliente
        </Button>
      </Stack>

      <TextField
        value={q}
        onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
        placeholder="Buscar por nombre o WhatsApp"
        slotProps={{
          input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> },
          htmlInput: { 'aria-label': 'Buscar cliente', autoComplete: 'off' },
        }}
      />

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {data && (
        <Paper sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          {data.clientes.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              {q ? 'No hay clientes con esa búsqueda.' : 'Todavía no hay clientes. Se pueden agregar acá o al vender.'}
            </Typography>
          ) : (
            <List disablePadding>
              {data.clientes.map((c) => (
                <ListItemButton key={c.id} divider onClick={() => navigate(`/clientes/${c.id}`)} sx={{ py: 1.5, opacity: c.activo ? 1 : 0.6 }}>
                  <ListItemText
                    primary={
                      <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b>{c.nombre}</b>
                        {c.talles.map((t) => (
                          <Chip key={t.id} label={t.nombre} size="small" variant="outlined" />
                        ))}
                        {!c.activo && <Chip label="Inactivo" size="small" />}
                      </Box>
                    }
                    secondary={[
                      c.whatsapp,
                      c.compras ? `${c.compras} ${c.compras === 1 ? 'compra' : 'compras'}` : 'Sin compras',
                      c.ultimaCompra && `última el ${formatFecha(hoy(new Date(c.ultimaCompra)))}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                  {c.compras > 0 && <Typography sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap' }}>{formatMonto(c.totalComprado)}</Typography>}
                </ListItemButton>
              ))}
            </List>
          )}
          {data.total > data.clientes.length && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Se muestran {data.clientes.length} de {data.total}. Buscá por nombre para encontrar al resto.
            </Typography>
          )}
        </Paper>
      )}

      {creando && <ClienteDialog nombreInicial={q} onClose={() => setCreando(false)} onGuardado={(c) => navigate(`/clientes/${c.id}`)} />}
    </Stack>
  );
}
