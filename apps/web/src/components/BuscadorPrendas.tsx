import { useState, type FormEvent, type Ref } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { formatMonto, type ListaProductos, type ProductoDetalle, type VarianteEncontrada } from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../api/client';
import { pareceCodigo } from '../api/catalogo';

/** Prenda elegida (viene del lector o del buscador). */
export type Elegida = Pick<VarianteEncontrada, 'id' | 'color' | 'talle' | 'stock' | 'activo'> & {
  producto: Pick<VarianteEncontrada['producto'], 'id' | 'nombre' | 'tipo' | 'precioVenta' | 'activo'>;
};

/**
 * Campo para escanear el código de barras (el lector escribe el código y Enter) o buscar por
 * nombre y elegir color y talle. `onElegir` devuelve un aviso si no se pudo agregar.
 */
export function BuscadorPrendas(props: {
  onElegir: (v: Elegida) => string | null;
  /** Unidades de cada variante que ya están en la lista (para mostrar cuántas quedan). */
  reservadas: (varianteId: number) => number;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ListaProductos['productos'] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<number | null>(null);

  const elegir = (v: Elegida) => {
    const a = props.onElegir(v);
    setAviso(a);
    return a === null;
  };

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    setAviso(null);
    if (!t) return;
    if (pareceCodigo(t)) {
      try {
        const v = await api<VarianteEncontrada>(`/variantes/codigo/${encodeURIComponent(t)}`);
        elegir(v);
        setTexto('');
        setResultados(null);
        return;
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.status === 404)) return setAviso(mensajeDeError(err));
        if (/^\d+$/.test(t)) {
          setTexto('');
          return setAviso(`No hay ninguna prenda con el código ${t}. Buscala por nombre.`);
        }
      }
    }
    try {
      const r = await api<ListaProductos>(`/productos?activos=1&q=${encodeURIComponent(t)}`);
      setResultados(r.productos);
    } catch (err) {
      setAviso(mensajeDeError(err));
    }
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Box component="form" onSubmit={buscar}>
        <TextField
          inputRef={props.inputRef}
          autoFocus={props.autoFocus}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (!e.target.value) setResultados(null);
          }}
          placeholder={props.placeholder ?? 'Escaneá el código o buscá por nombre y apretá Enter'}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> },
            htmlInput: { enterKeyHint: 'search', 'aria-label': 'Buscar prenda', autoComplete: 'off' },
          }}
        />
      </Box>
      {aviso && <Alert severity="warning" sx={{ mt: 1.5 }} onClose={() => setAviso(null)}>{aviso}</Alert>}
      {resultados && (
        <List dense sx={{ mt: 1 }}>
          {resultados.length === 0 && <Typography color="text.secondary" sx={{ px: 1 }}>No se encontró nada con esa búsqueda.</Typography>}
          {resultados.slice(0, 10).map((p) => (
            <ListItemButton key={p.id} onClick={() => setEligiendo(p.id)} disabled={p.stockTotal === 0}>
              <ListItemText
                primary={`${p.tipo.nombre} ${p.nombre}`}
                secondary={p.stockTotal === 0 ? 'Sin stock' : `${p.stockTotal} en stock · ${formatMonto(p.precioVenta)}`}
              />
              <AddIcon color="action" />
            </ListItemButton>
          ))}
        </List>
      )}

      {eligiendo && (
        <ElegirVarianteDialog
          productoId={eligiendo}
          reservadas={props.reservadas}
          onClose={() => setEligiendo(null)}
          onElegir={(v) => {
            if (elegir(v)) {
              setResultados(null);
              setTexto('');
            }
            setEligiendo(null);
          }}
        />
      )}
    </Paper>
  );
}

/** Elegir color y talle de un producto buscado por nombre. */
function ElegirVarianteDialog(props: { productoId: number; reservadas: (id: number) => number; onClose: () => void; onElegir: (v: Elegida) => void }) {
  const { data: p, error } = useQuery({
    queryKey: ['producto', props.productoId],
    queryFn: () => api<ProductoDetalle>(`/productos/${props.productoId}`),
  });
  const activas = p?.variantes.filter((v) => v.activo) ?? [];
  const colores = [...new Set(activas.map((v) => v.color.nombre))];

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>{p ? `${p.tipo.nombre} ${p.nombre} · ${formatMonto(p.precioVenta)}` : 'Cargando…'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
        <Stack spacing={2} sx={{ pt: 1 }}>
          {colores.map((color) => (
            <Box key={color}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                {color}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {activas
                  .filter((v) => v.color.nombre === color)
                  .map((v) => {
                    const quedan = v.stock - props.reservadas(v.id);
                    return (
                      <Chip
                        key={v.id}
                        label={`${v.talle.nombre} · ${quedan > 0 ? quedan : 'sin stock'}`}
                        disabled={quedan <= 0}
                        variant="outlined"
                        onClick={() => p && props.onElegir({ ...v, producto: p })}
                        sx={{ minHeight: 40, fontSize: 15 }}
                      />
                    );
                  })}
              </Box>
            </Box>
          ))}
          {p && activas.length === 0 && <Typography color="text.secondary">Este producto no tiene variantes activas.</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
}
