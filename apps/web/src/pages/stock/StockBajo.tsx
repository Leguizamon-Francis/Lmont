import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, FormControlLabel, List, ListItemButton, Paper, Snackbar, Stack, Switch, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { VarianteEncontrada } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';

/** Lo que está en o por debajo del stock mínimo, agrupado por producto. */
export function StockBajo() {
  const navigate = useNavigate();
  const [sinStock, setSinStock] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const { data, isPending, error } = useQuery({
    queryKey: ['stock', 'bajo', sinStock],
    queryFn: () => api<VarianteEncontrada[]>(`/stock/bajo${sinStock ? '?sinStock=1' : ''}`),
  });

  const grupos = new Map<number, { nombre: string; variantes: VarianteEncontrada[] }>();
  for (const v of data ?? []) {
    const g = grupos.get(v.producto.id) ?? { nombre: `${v.producto.tipo.nombre} ${v.producto.nombre}`, variantes: [] };
    g.variantes.push(v);
    grupos.set(v.producto.id, g);
  }

  // Texto listo para pegar en el chat del proveedor.
  const copiar = async () => {
    const texto = [...grupos.values()]
      .map((g) => `• ${g.nombre}: ${g.variantes.map((v) => `${v.color.nombre} ${v.talle.nombre}`).join(', ')}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado('Lista copiada. Pegala en el WhatsApp del proveedor.');
    } catch {
      setCopiado('No se pudo copiar automáticamente.');
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <FormControlLabel
          control={<Switch checked={sinStock} onChange={(e) => setSinStock(e.target.checked)} />}
          label="Incluir todo lo que está en 0, aunque no tenga mínimo"
        />
        <Button startIcon={<ContentCopyIcon />} onClick={copiar} disabled={!data?.length}>
          Copiar lista para pedir
        </Button>
      </Stack>

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {data?.length === 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">
            No hay nada con stock bajo. El aviso aparece cuando una variante llega a su stock mínimo (se configura en cada
            variante desde Productos).
          </Typography>
        </Paper>
      )}

      {[...grupos].map(([productoId, g]) => (
        <Paper key={productoId} sx={{ overflow: 'hidden' }}>
          <Typography sx={{ px: 2, py: 1.5, fontWeight: 600, bgcolor: 'action.hover' }}>{g.nombre}</Typography>
          <List disablePadding>
            {g.variantes.map((v) => (
              <ListItemButton key={v.id} divider onClick={() => navigate(`/productos/${productoId}?variante=${v.id}`)} sx={{ gap: 2 }}>
                <Typography sx={{ flex: 1 }}>
                  {v.color.nombre} · {v.talle.nombre}
                </Typography>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 600 }} color={v.stock === 0 ? 'error.main' : 'warning.main'}>
                    {v.stock === 0 ? 'Sin stock' : `${v.stock} u.`}
                  </Typography>
                  {v.stockMinimo > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      mín. {v.stockMinimo}
                    </Typography>
                  )}
                </Box>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      ))}
      <Snackbar open={!!copiado} message={copiado} autoHideDuration={3000} onClose={() => setCopiado(null)} />
    </Stack>
  );
}
