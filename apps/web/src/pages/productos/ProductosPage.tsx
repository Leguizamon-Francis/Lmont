import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { formatMonto, type ListaProductos, type VarianteEncontrada } from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';
import { pareceCodigo, useLista } from '../../api/catalogo';
import { ProductoFormDialog } from './ProductoFormDialog';

const POR_PAGINA = 50;

export function ProductosPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const tipoId = params.get('tipo') ?? '';
  const activos = params.get('activos') ?? '1';
  const pagina = Number(params.get('pagina') ?? 1);

  const [texto, setTexto] = useState(q);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const tipos = useLista('tipos');

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ['productos', { q, tipoId, activos, pagina }],
    queryFn: () => {
      const s = new URLSearchParams({ pagina: String(pagina) });
      if (q) s.set('q', q);
      if (tipoId) s.set('tipoId', tipoId);
      if (activos) s.set('activos', activos);
      return api<ListaProductos>(`/productos?${s}`);
    },
    placeholderData: keepPreviousData,
  });

  const cambiar = (cambios: Record<string, string>) => {
    const s = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) s.set(k, v);
      else s.delete(k);
    }
    if (!('pagina' in cambios)) s.delete('pagina');
    setParams(s, { replace: true });
  };

  // El lector de códigos escribe el código y manda Enter: si es un código conocido, abrimos el producto.
  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    setAviso(null);
    if (pareceCodigo(t)) {
      try {
        const v = await api<VarianteEncontrada>(`/variantes/codigo/${encodeURIComponent(t)}`);
        navigate(`/productos/${v.producto.id}?variante=${v.id}`);
        return;
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.status === 404)) {
          setAviso(mensajeDeError(err));
          return;
        }
        if (/^\d+$/.test(t)) {
          setAviso(`No hay ningún producto con el código ${t}`);
          setTexto('');
          return;
        }
      }
    }
    cambiar({ q: t });
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 1000 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
          Productos
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNuevo(true)} sx={{ ml: 'auto' }}>
          Nuevo producto
        </Button>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Box component="form" onSubmit={buscar}>
            <TextField
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por modelo, tipo, color o escanear el código"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
                htmlInput: { enterKeyHint: 'search', 'aria-label': 'Buscar productos' },
              }}
            />
          </Box>
          <Stack direction="row" spacing={1.5}>
            <TextField select size="small" label="Tipo de prenda" value={tipoId} onChange={(e) => cambiar({ tipo: e.target.value })}>
              <MenuItem value="">Todos</MenuItem>
              {tipos.data?.map((t) => (
                <MenuItem key={t.id} value={String(t.id)}>
                  {t.nombre}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Estado" value={activos} onChange={(e) => cambiar({ activos: e.target.value })}>
              <MenuItem value="1">Activos</MenuItem>
              <MenuItem value="0">Inactivos</MenuItem>
              <MenuItem value="">Todos</MenuItem>
            </TextField>
          </Stack>
          {q && (
            <Box>
              <Chip
                label={`Búsqueda: ${q}`}
                onDelete={() => {
                  setTexto('');
                  cambiar({ q: '' });
                }}
              />
            </Box>
          )}
        </Stack>
      </Paper>

      {aviso && (
        <Alert severity="warning" onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      )}
      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}

      {data && (
        <Paper sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          {data.productos.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 3 }}>
              {q || tipoId ? 'No hay productos que coincidan con la búsqueda.' : 'Todavía no hay productos cargados.'}
            </Typography>
          ) : (
            <List disablePadding>
              {data.productos.map((p) => (
                <ListItemButton key={p.id} divider onClick={() => navigate(`/productos/${p.id}`)} sx={{ py: 1.5 }}>
                  <ListItemText
                    primary={
                      <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Box component="span" sx={{ fontWeight: 600 }}>
                          {p.tipo.nombre} {p.nombre}
                        </Box>
                        {!p.activo && <Chip label="Inactivo" size="small" />}
                        {p.variantesStockBajo > 0 && (
                          <Chip label={`${p.variantesStockBajo} con stock bajo`} size="small" color="warning" variant="outlined" />
                        )}
                      </Box>
                    }
                    secondary={`${p.cantidadVariantes} ${p.cantidadVariantes === 1 ? 'variante' : 'variantes'} · ${p.stockTotal} en stock`}
                  />
                  <Typography sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap' }}>{formatMonto(p.precioVenta)}</Typography>
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>
      )}

      {data && data.total > POR_PAGINA && (
        <Pagination
          count={Math.ceil(data.total / POR_PAGINA)}
          page={pagina}
          onChange={(_, n) => cambiar({ pagina: String(n) })}
          sx={{ alignSelf: 'center' }}
        />
      )}

      {nuevo && <ProductoFormDialog onClose={() => setNuevo(false)} onGuardado={(p) => navigate(`/productos/${p.id}`)} />}
    </Stack>
  );
}
