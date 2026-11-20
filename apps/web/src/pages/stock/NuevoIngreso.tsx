import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import {
  formatMonto,
  hoy,
  montoParaInput,
  parseMonto,
  type IngresoDetalle,
  type IngresoInput,
  type ListaProductos,
  type ProductoDetalle,
  type Proveedor,
  type VarianteEncontrada,
} from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';
import { pareceCodigo } from '../../api/catalogo';
import { MontoField } from '../../components/campos';

type ItemBorrador = { varianteId: number; color: string; talle: string; stock: number; cantidad: string };
type LineaBorrador = { productoId: number; nombre: string; costo: string; items: ItemBorrador[] };
type Borrador = { proveedorId: string; fecha: string; pagadoConCaja: boolean; nota: string; lineas: LineaBorrador[] };

const CLAVE_BORRADOR = 'lmont.ingreso.borrador';
const vacio = (): Borrador => ({ proveedorId: '', fecha: hoy(), pagadoConCaja: false, nota: '', lineas: [] });

function leerBorrador(): Borrador {
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) ?? 'null') as Borrador | null;
    return b && Array.isArray(b.lineas) ? b : vacio();
  } catch {
    return vacio();
  }
}
function guardarBorrador(b: Borrador) {
  try {
    if (b.lineas.length) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b));
    else localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // Sin almacenamiento disponible: el borrador simplemente no se recuerda.
  }
}

const enteros = (s: string) => s.replace(/\D/g, '').slice(0, 5);

/** Pantalla para registrar la mercadería que llegó. Se puede escanear o buscar por nombre. */
export function NuevoIngreso() {
  const qc = useQueryClient();
  const [b, setB] = useState<Borrador>(leerBorrador);
  useEffect(() => guardarBorrador(b), [b]);

  const proveedores = useQuery({ queryKey: ['proveedores', 'activos'], queryFn: () => api<Proveedor[]>('/proveedores?activos=1') });

  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ListaProductos['productos'] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agregado, setAgregado] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<number | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState<IngresoDetalle | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  const actualizarLinea = (productoId: number, f: (l: LineaBorrador) => LineaBorrador | null) =>
    setB((x) => ({
      ...x,
      lineas: x.lineas.flatMap((l) => {
        if (l.productoId !== productoId) return [l];
        const n = f(l);
        return n && n.items.length ? [n] : [];
      }),
    }));

  /** Suma unidades de variantes de un producto (crea la línea si no estaba). */
  function sumar(
    producto: { id: number; nombre: string; tipo: { nombre: string }; precioCompra: number },
    variantes: { id: number; color: { nombre: string }; talle: { nombre: string }; stock: number; cantidad: number }[],
  ) {
    setB((x) => {
      const lineas = [...x.lineas];
      let i = lineas.findIndex((l) => l.productoId === producto.id);
      if (i === -1) {
        lineas.unshift({ productoId: producto.id, nombre: `${producto.tipo.nombre} ${producto.nombre}`, costo: montoParaInput(producto.precioCompra), items: [] });
        i = 0;
      }
      const linea = { ...lineas[i]!, items: [...lineas[i]!.items] };
      for (const v of variantes) {
        const j = linea.items.findIndex((it) => it.varianteId === v.id);
        if (j === -1) linea.items.push({ varianteId: v.id, color: v.color.nombre, talle: v.talle.nombre, stock: v.stock, cantidad: String(v.cantidad) });
        else linea.items[j] = { ...linea.items[j]!, cantidad: String(Number(linea.items[j]!.cantidad || 0) + v.cantidad) };
      }
      lineas[i] = linea;
      return { ...x, lineas };
    });
  }

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    setAviso(null);
    if (!t) return;
    if (pareceCodigo(t)) {
      try {
        const v = await api<VarianteEncontrada>(`/variantes/codigo/${encodeURIComponent(t)}`);
        sumar(v.producto, [{ ...v, cantidad: 1 }]);
        setAgregado(`+1 ${v.producto.tipo.nombre} ${v.producto.nombre} · ${v.color.nombre} ${v.talle.nombre}`);
        setTexto('');
        setResultados(null);
        return;
      } catch (err) {
        if (!(err instanceof ApiRequestError && err.status === 404)) return setAviso(mensajeDeError(err));
        if (/^\d+$/.test(t)) {
          setTexto('');
          return setAviso(`No hay ninguna prenda con el código ${t}. Buscala por nombre y cargale el código desde Productos.`);
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

  const registrar = useMutation({
    mutationFn: (d: IngresoInput) => api<IngresoDetalle>('/ingresos', { body: d }),
    onSuccess: (r) => {
      setHecho(r);
      setB(vacio());
      setErrores({});
      qc.invalidateQueries({ queryKey: ['ingresos'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['producto'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });

  // Totales y validación antes de mandar (el servidor vuelve a validar todo).
  let unidades = 0;
  let total = 0;
  for (const l of b.lineas) {
    const c = parseMonto(l.costo);
    for (const it of l.items) {
      const n = Number(it.cantidad || 0);
      unidades += n;
      if (c.ok) total += n * c.value;
    }
  }

  const confirmar = () => {
    const errs: Record<string, string> = {};
    const items: IngresoInput['items'] = [];
    for (const l of b.lineas) {
      const c = parseMonto(l.costo);
      if (!c.ok) errs[`costo-${l.productoId}`] = c.error;
      for (const it of l.items) {
        if (!Number(it.cantidad)) errs[`cant-${it.varianteId}`] = 'Mínimo 1';
        items.push({ varianteId: it.varianteId, cantidad: Number(it.cantidad || 0), costoUnitario: c.ok ? c.value : l.costo });
      }
    }
    setErrores(errs);
    if (Object.keys(errs).length) return;
    setHecho(null);
    registrar.mutate({
      fecha: b.fecha,
      proveedorId: b.proveedorId ? Number(b.proveedorId) : null,
      pagadoConCaja: b.pagadoConCaja,
      nota: b.nota,
      items,
    });
  };

  return (
    <Stack spacing={2}>
      {hecho && (
        <Alert severity="success" onClose={() => setHecho(null)}>
          Ingreso registrado: {hecho.unidades} {hecho.unidades === 1 ? 'unidad' : 'unidades'} por {formatMonto(hecho.total)}.{' '}
          <RouterLink to={`/stock/ingresos/${hecho.id}`}>Ver detalle</RouterLink>
          {!!hecho.preciosActualizados?.length && (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
              {hecho.preciosActualizados.map((p) => (
                <li key={p.productoId}>
                  Precio de compra de {p.nombre}: {formatMonto(p.antes)} → {formatMonto(p.ahora)}. Revisá si querés cambiar el precio de venta.
                </li>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Paper sx={{ p: 2 }}>
        <Box component="form" onSubmit={buscar}>
          <TextField
            inputRef={buscador}
            autoFocus
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (!e.target.value) setResultados(null);
            }}
            placeholder="Escaneá el código o buscá por nombre y apretá Enter"
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
              <ListItemButton key={p.id} onClick={() => setEligiendo(p.id)}>
                <ListItemText primary={`${p.tipo.nombre} ${p.nombre}`} secondary={`${p.stockTotal} en stock · costo ${formatMonto(p.precioCompra)}`} />
                <AddIcon color="action" />
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>

      {b.lineas.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">
            Escaneá cada prenda que llegó (cada lectura suma 1) o buscala por nombre para cargar varias cantidades de una.
          </Typography>
        </Paper>
      ) : (
        b.lineas.map((l) => (
          <Paper key={l.productoId} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, mb: 1 }}>
              <Typography sx={{ fontWeight: 600, flex: 1 }}>{l.nombre}</Typography>
              <MontoField
                size="small"
                label="Costo por unidad"
                value={l.costo}
                onChange={(e) => actualizarLinea(l.productoId, (x) => ({ ...x, costo: e.target.value }))}
                error={!!errores[`costo-${l.productoId}`]}
                helperText={errores[`costo-${l.productoId}`]}
                sx={{ maxWidth: { sm: 200 } }}
              />
            </Stack>
            {l.items.map((it) => (
              <Stack key={it.varianteId} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap>
                    {it.color} · {it.talle}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Hay {it.stock} → quedan {it.stock + Number(it.cantidad || 0)}
                  </Typography>
                </Box>
                <IconButton
                  aria-label="Una menos"
                  onClick={() =>
                    actualizarLinea(l.productoId, (x) => ({
                      ...x,
                      items: x.items.map((y) => (y.varianteId === it.varianteId ? { ...y, cantidad: String(Math.max(1, Number(y.cantidad || 0) - 1)) } : y)),
                    }))
                  }
                >
                  <RemoveIcon />
                </IconButton>
                <TextField
                  size="small"
                  value={it.cantidad}
                  onChange={(e) =>
                    actualizarLinea(l.productoId, (x) => ({
                      ...x,
                      items: x.items.map((y) => (y.varianteId === it.varianteId ? { ...y, cantidad: enteros(e.target.value) } : y)),
                    }))
                  }
                  error={!!errores[`cant-${it.varianteId}`]}
                  slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `Cantidad ${it.color} ${it.talle}`, style: { textAlign: 'center' } } }}
                  sx={{ width: 64 }}
                />
                <IconButton
                  aria-label="Una más"
                  onClick={() =>
                    actualizarLinea(l.productoId, (x) => ({
                      ...x,
                      items: x.items.map((y) => (y.varianteId === it.varianteId ? { ...y, cantidad: String(Number(y.cantidad || 0) + 1) } : y)),
                    }))
                  }
                >
                  <AddIcon />
                </IconButton>
                <IconButton
                  aria-label={`Quitar ${it.color} ${it.talle}`}
                  onClick={() => actualizarLinea(l.productoId, (x) => ({ ...x, items: x.items.filter((y) => y.varianteId !== it.varianteId) }))}
                >
                  <DeleteIcon />
                </IconButton>
              </Stack>
            ))}
          </Paper>
        ))
      )}

      {b.lineas.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                select
                label="Proveedor"
                value={b.proveedorId}
                onChange={(e) => setB((x) => ({ ...x, proveedorId: e.target.value }))}
                helperText={proveedores.data?.length === 0 ? 'Cargalos en Configuración → Proveedores' : undefined}
              >
                <MenuItem value="">Sin especificar</MenuItem>
                {proveedores.data?.map((p) => (
                  <MenuItem key={p.id} value={String(p.id)}>
                    {p.nombre}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                type="date"
                label="Fecha en que llegó"
                value={b.fecha}
                onChange={(e) => setB((x) => ({ ...x, fecha: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: hoy() } }}
              />
            </Stack>
            <TextField label="Nota (opcional)" value={b.nota} onChange={(e) => setB((x) => ({ ...x, nota: e.target.value }))} />
            <FormControlLabel
              control={<Checkbox checked={b.pagadoConCaja} onChange={(e) => setB((x) => ({ ...x, pagadoConCaja: e.target.checked }))} />}
              label="Se pagó con plata de la caja (va a figurar como gasto en Caja)"
            />
            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography color="text.secondary">
                  {unidades} {unidades === 1 ? 'unidad' : 'unidades'}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {formatMonto(total)}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button color="inherit" onClick={() => window.confirm('¿Descartar este ingreso?') && setB(vacio())}>
                  Descartar
                </Button>
                <Button variant="contained" size="large" onClick={confirmar} loading={registrar.isPending}>
                  Registrar ingreso
                </Button>
              </Stack>
            </Stack>
            {registrar.error && <Alert severity="error">{mensajeDeError(registrar.error)}</Alert>}
          </Stack>
        </Paper>
      )}

      {eligiendo && (
        <ElegirVariantesDialog
          productoId={eligiendo}
          onClose={() => setEligiendo(null)}
          onAgregar={(p, cant) => {
            sumar(
              p,
              p.variantes.filter((v) => (cant[v.id] ?? 0) > 0).map((v) => ({ ...v, cantidad: cant[v.id]! })),
            );
            setEligiendo(null);
            setResultados(null);
            setTexto('');
            buscador.current?.focus();
          }}
        />
      )}
      <Snackbar open={!!agregado} message={agregado} autoHideDuration={1800} onClose={() => setAgregado(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Stack>
  );
}

/** Cantidades que llegaron de cada variante de un producto. */
function ElegirVariantesDialog(props: {
  productoId: number;
  onClose: () => void;
  onAgregar: (p: ProductoDetalle, cantidades: Record<number, number>) => void;
}) {
  const { data: p, error } = useQuery({
    queryKey: ['producto', props.productoId],
    queryFn: () => api<ProductoDetalle>(`/productos/${props.productoId}`),
  });
  const [cant, setCant] = useState<Record<number, string>>({});
  const activas = p?.variantes.filter((v) => v.activo) ?? [];
  const porColor = [...new Set(activas.map((v) => v.color.nombre))];
  const total = Object.values(cant).reduce((s, v) => s + Number(v || 0), 0);

  return (
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <DialogTitle>{p ? `${p.tipo.nombre} ${p.nombre}` : 'Cargando…'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
        {p && activas.length === 0 && (
          <Typography color="text.secondary">Este producto no tiene variantes activas. Agregale colores y talles desde Productos.</Typography>
        )}
        <Stack spacing={2} sx={{ pt: 1 }}>
          {porColor.map((color) => (
            <Box key={color}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                {color}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {activas
                  .filter((v) => v.color.nombre === color)
                  .map((v) => (
                    <TextField
                      key={v.id}
                      size="small"
                      label={v.talle.nombre}
                      placeholder="0"
                      value={cant[v.id] ?? ''}
                      onChange={(e) => setCant((c) => ({ ...c, [v.id]: enteros(e.target.value) }))}
                      helperText={`hay ${v.stock}`}
                      slotProps={{ htmlInput: { inputMode: 'numeric', style: { textAlign: 'center' }, 'aria-label': `${color} talle ${v.talle.nombre}` } }}
                      sx={{ width: 76 }}
                    />
                  ))}
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancelar</Button>
        <Button
          variant="contained"
          disabled={!p || total === 0}
          onClick={() => p && props.onAgregar(p, Object.fromEntries(Object.entries(cant).map(([k, v]) => [Number(k), Number(v || 0)])))}
        >
          Agregar {total > 0 ? `${total} ${total === 1 ? 'unidad' : 'unidades'}` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
