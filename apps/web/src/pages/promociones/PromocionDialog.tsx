import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { describirPromo, montoParaInput, promocionSchema, type ComponentePromo, type ListaProductos, type Promocion, type PromocionInput } from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';
import { useLista } from '../../api/catalogo';
import { MontoField } from '../../components/campos';

/** Cómo se presenta al usuario (combo y "varias unidades" son las dos de precio fijo). */
type Clase = 'COMBO' | 'UNIDADES' | 'NXM';
type Fila = { tipoId: string; productoId: string; cantidad: string };

const CLASES: { id: Clase; texto: string; ayuda: string }[] = [
  { id: 'COMBO', texto: 'Combo', ayuda: 'Productos distintos a un precio fijo. Ej: remera + bermuda a $ 30.000.' },
  { id: 'UNIDADES', texto: 'Varias unidades', ayuda: 'Varias del mismo producto o tipo a un precio fijo. Ej: 3 boxers por $ 15.000.' },
  { id: 'NXM', texto: 'Lleva N, paga M', ayuda: 'Ej: 2x1 o 3x2. Se paga la más cara; las más baratas salen gratis.' },
];

function claseDe(p?: Promocion): Clase {
  if (!p) return 'COMBO';
  if (p.modo === 'NXM') return 'NXM';
  return p.componentes.length > 1 ? 'COMBO' : 'UNIDADES';
}
const filaDe = (c: ComponentePromo): Fila => ({
  tipoId: String(c.producto?.tipo.id ?? c.tipo?.id ?? ''),
  productoId: c.producto ? String(c.producto.id) : '',
  cantidad: String(c.cantidad),
});
const filaVacia = (cantidad = '1'): Fila => ({ tipoId: '', productoId: '', cantidad });

export function PromocionDialog({ promo, onClose }: { promo?: Promocion; onClose: () => void }) {
  const qc = useQueryClient();
  const tipos = useLista('tipos', true);
  const [clase, setClase] = useState<Clase>(claseDe(promo));
  const [nombre, setNombre] = useState(promo?.nombre ?? '');
  const [filas, setFilas] = useState<Fila[]>(promo ? promo.componentes.map(filaDe) : [filaVacia(), filaVacia()]);
  const [precio, setPrecio] = useState(promo?.precio ? montoParaInput(promo.precio) : '');
  const [paga, setPaga] = useState(promo?.pagaCantidad ? String(promo.pagaCantidad) : '1');
  const [desde, setDesde] = useState(promo?.desde ?? '');
  const [hasta, setHasta] = useState(promo?.hasta ?? '');
  const [activo, setActivo] = useState(promo?.activo ?? true);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  for (const c of promo?.componentes ?? []) if (c.producto) productosCache.set(String(c.producto.id), c.producto.nombre);

  const cambiarClase = (c: Clase) => {
    setClase(c);
    setErrores({});
    // Combo arranca con dos filas; las otras con una sola de varias unidades.
    if (c === 'COMBO' && filas.length < 2) setFilas([{ ...(filas[0] ?? filaVacia()), cantidad: '1' }, filaVacia()]);
    if (c !== 'COMBO') setFilas([{ ...(filas[0] ?? filaVacia()), cantidad: filas[0] && Number(filas[0].cantidad) >= 2 ? filas[0].cantidad : c === 'NXM' ? '2' : '3' }]);
  };
  const cambiarFila = (i: number, f: Partial<Fila>) => setFilas((xs) => xs.map((x, j) => (j === i ? { ...x, ...f } : x)));

  const datos: PromocionInput = {
    nombre,
    modo: clase === 'NXM' ? 'NXM' : 'PRECIO_FIJO',
    componentes: filas.map((f) => (f.productoId ? { productoId: f.productoId, tipoId: null, cantidad: f.cantidad } : { productoId: null, tipoId: f.tipoId, cantidad: f.cantidad })),
    precio: clase === 'NXM' ? null : precio,
    pagaCantidad: clase === 'NXM' ? paga : null,
    desde,
    hasta,
    activo,
  };

  const guardar = useMutation({
    mutationFn: (d: PromocionInput) => (promo ? api(`/promociones/${promo.id}`, { method: 'PUT', body: d }) : api('/promociones', { body: d })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promociones'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.campos) setErrores(e.campos);
    },
  });

  const eliminar = useMutation({
    mutationFn: () => api(`/promociones/${promo!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promociones'] });
      onClose();
    },
  });

  const enviar = () => {
    const r = promocionSchema.safeParse(datos);
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) errs[i.path.join('.') || '_'] ??= i.message;
      return setErrores(errs);
    }
    setErrores({});
    guardar.mutate(datos);
  };

  // Vista previa con los nombres elegidos.
  const vista = (() => {
    const r = promocionSchema.safeParse(datos);
    if (!r.success || !tipos.data) return null;
    return describirPromo({
      ...r.data,
      componentes: filas.map((f) => {
        const tipo = tipos.data.find((t) => String(t.id) === f.tipoId)!;
        const nombreProd = f.productoId ? productosCache.get(f.productoId) : undefined;
        return {
          cantidad: Number(f.cantidad),
          tipo: f.productoId ? null : tipo,
          producto: f.productoId ? { id: Number(f.productoId), nombre: nombreProd ?? '', tipo } : null,
        };
      }),
    });
  })();

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{promo ? 'Editar promoción' : 'Nueva promoción'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {guardar.error && <Alert severity="error">{mensajeDeError(guardar.error)}</Alert>}
          <TextField label="Nombre" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} error={!!errores.nombre} helperText={errores.nombre} placeholder="Ej: Combo verano" />

          <Box>
            <ToggleButtonGroup
              exclusive
              value={clase}
              onChange={(_, c: Clase | null) => c && cambiarClase(c)}
              sx={{ width: '100%', '& .MuiToggleButton-root': { flex: 1 } }}
              aria-label="Tipo de promoción"
            >
              {CLASES.map((c) => (
                <ToggleButton key={c.id} value={c.id} color="primary">
                  {c.texto}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {CLASES.find((c) => c.id === clase)!.ayuda}
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }} color={errores.componentes ? 'error' : undefined}>
              Qué prendas entran
            </Typography>
            <Stack spacing={1.5}>
              {filas.map((f, i) => (
                <FilaComponente
                  key={i}
                  fila={f}
                  tipos={tipos.data ?? []}
                  labelCantidad={clase === 'NXM' ? 'Lleva' : 'Cantidad'}
                  error={errores[`componentes.${i}`] ?? errores[`componentes.${i}.cantidad`]}
                  onChange={(x) => cambiarFila(i, x)}
                  onQuitar={clase === 'COMBO' && filas.length > 2 ? () => setFilas((xs) => xs.filter((_, j) => j !== i)) : undefined}
                />
              ))}
            </Stack>
            {errores.componentes && (
              <Typography variant="caption" color="error">
                {errores.componentes}
              </Typography>
            )}
            {clase === 'COMBO' && filas.length < 10 && (
              <Button startIcon={<AddIcon />} onClick={() => setFilas((xs) => [...xs, filaVacia()])} sx={{ mt: 1 }}>
                Agregar otro producto
              </Button>
            )}
          </Box>

          {clase === 'NXM' ? (
            <TextField
              label="Paga"
              value={paga}
              onChange={(e) => setPaga(e.target.value)}
              error={!!errores.pagaCantidad}
              helperText={errores.pagaCantidad ?? `Lleva ${filas[0]?.cantidad || '?'}, paga ${paga || '?'}`}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              sx={{ maxWidth: 200 }}
            />
          ) : (
            <MontoField
              label="Precio de la promo"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              error={!!errores.precio}
              helperText={errores.precio ?? 'Lo que paga el cliente por todo junto'}
              sx={{ maxWidth: 260 }}
            />
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              type="date"
              label="Desde (opcional)"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={!!errores.desde}
              helperText={errores.desde}
              sx={{ flex: 1 }}
            />
            <TextField
              type="date"
              label="Hasta (opcional)"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              error={!!errores.hasta}
              helperText={errores.hasta}
              sx={{ flex: 1 }}
            />
          </Stack>
          <FormControlLabel control={<Switch checked={activo} onChange={(e) => setActivo(e.target.checked)} />} label="Activa" />
          {vista && <Alert severity="info">{vista}</Alert>}
          {eliminar.error && <Alert severity="error">{mensajeDeError(eliminar.error)}</Alert>}
          {confirmarEliminar && promo && (
            <Alert
              severity="warning"
              action={
                <Stack direction="row" spacing={1}>
                  <Button color="inherit" size="small" onClick={() => setConfirmarEliminar(false)}>
                    No
                  </Button>
                  <Button color="error" size="small" variant="contained" onClick={() => eliminar.mutate()} loading={eliminar.isPending}>
                    Eliminar
                  </Button>
                </Stack>
              }
            >
              ¿Eliminar “{promo.nombre}”? Deja de aparecer al vender.
              {promo.vendidas ? ' Las ventas que ya la usaron no cambian y siguen saliendo en los reportes.' : ''} Si solo querés frenarla
              un tiempo, mejor desactivala.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {promo && !confirmarEliminar && (
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setConfirmarEliminar(true)} sx={{ mr: 'auto' }}>
            Eliminar
          </Button>
        )}
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={enviar} loading={guardar.isPending}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Nombres de productos ya cargados, para la vista previa. */
const productosCache = new Map<string, string>();

function FilaComponente(props: {
  fila: Fila;
  tipos: { id: number; nombre: string }[];
  labelCantidad: string;
  error?: string;
  onChange: (f: Partial<Fila>) => void;
  onQuitar?: () => void;
}) {
  const { fila } = props;
  const productos = useQuery({
    queryKey: ['productos', 'tipo', fila.tipoId],
    queryFn: () => api<ListaProductos>(`/productos?activos=1&tipoId=${fila.tipoId}`),
    enabled: !!fila.tipoId,
  });
  for (const p of productos.data?.productos ?? []) productosCache.set(String(p.id), p.nombre);
  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
        <TextField
          select
          size="small"
          label="Tipo de prenda"
          value={fila.tipoId}
          onChange={(e) => props.onChange({ tipoId: e.target.value, productoId: '' })}
          error={!!props.error && !fila.tipoId}
          sx={{ flex: 1 }}
        >
          {props.tipos.map((t) => (
            <MenuItem key={t.id} value={String(t.id)}>
              {t.nombre}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Modelo"
          value={fila.productoId || 'todos'}
          onChange={(e) => props.onChange({ productoId: e.target.value === 'todos' ? '' : e.target.value })}
          disabled={!fila.tipoId}
          sx={{ flex: 1 }}
        >
          <MenuItem value="todos">Cualquiera</MenuItem>
          {productos.data?.productos.map((p) => (
            <MenuItem key={p.id} value={String(p.id)}>
              {p.nombre}
            </MenuItem>
          ))}
          {/* El producto elegido se muestra aunque todavía no haya cargado la lista. */}
          {fila.productoId && !productos.data?.productos.some((p) => String(p.id) === fila.productoId) && (
            <MenuItem value={fila.productoId}>{productosCache.get(fila.productoId) ?? 'Producto elegido'}</MenuItem>
          )}
        </TextField>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            size="small"
            label={props.labelCantidad}
            value={fila.cantidad}
            onChange={(e) => props.onChange({ cantidad: e.target.value })}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            sx={{ width: 90 }}
          />
          {props.onQuitar && (
            <IconButton aria-label="Quitar" onClick={props.onQuitar}>
              <DeleteIcon />
            </IconButton>
          )}
        </Stack>
      </Stack>
      {props.error && (
        <Typography variant="caption" color="error">
          {props.error}
        </Typography>
      )}
    </Box>
  );
}
