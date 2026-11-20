import { useState } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Box, Chip, List, ListItemButton, ListItemText, Pagination, Paper, Stack, Typography } from '@mui/material';
import { formatFecha, formatMonto, type ListaIngresos } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';

const POR_PAGINA = 30;

export function IngresosLista() {
  const navigate = useNavigate();
  const [pagina, setPagina] = useState(1);
  const { data, isPending, error } = useQuery({
    queryKey: ['ingresos', pagina],
    queryFn: () => api<ListaIngresos>(`/ingresos?pagina=${pagina}`),
    placeholderData: keepPreviousData,
  });

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {data && (
        <Paper>
          {data.ingresos.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              Todavía no se registró ningún ingreso de mercadería.
            </Typography>
          ) : (
            <List disablePadding>
              {data.ingresos.map((i) => (
                <ListItemButton key={i.id} divider onClick={() => navigate(`/stock/ingresos/${i.id}`)}>
                  <ListItemText
                    primary={
                      <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b>{formatFecha(i.fecha)}</b> {i.proveedor?.nombre ?? 'Sin proveedor'}
                        {i.pagadoConCaja && <Chip label="Pagado con caja" size="small" variant="outlined" />}
                      </Box>
                    }
                    secondary={`${i.unidades} ${i.unidades === 1 ? 'unidad' : 'unidades'}`}
                  />
                  <Typography sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap' }}>{formatMonto(i.total)}</Typography>
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>
      )}
      {data && data.total > POR_PAGINA && (
        <Pagination count={Math.ceil(data.total / POR_PAGINA)} page={pagina} onChange={(_, n) => setPagina(n)} sx={{ alignSelf: 'center' }} />
      )}
    </Stack>
  );
}
