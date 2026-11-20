import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import {
  aplicarPorcentaje,
  formatMonto,
  MEDIOS_PAGO,
  montoParaInput,
  parseMonto,
  redondear,
  textoPorcentaje,
  type ListaProductos,
  type MedioPago,
  type PlanPago,
  type ProductoDetalle,
  type Vendedor,
  type VarianteEncontrada,
  type VentaDetalle,
  type VentaInput,
} from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';
import { pareceCodigo } from '../../api/catalogo';
import { MontoField } from '../../components/campos';

type ItemVenta = {
  varianteId: number;
  nombre: string;
  color: string;
  talle: string;
  stock: number;
  precioLista: number;
  precio: string;
  cantidad: number;
};
type PagoBorrador = { medio: MedioPago | ''; cuotas: number; monto: string };
type Borrador = { items: ItemVenta[]; pagos: PagoBorrador[]; nota: string };

const CLAVE_BORRADOR = 'lmont.venta.borrador';
const CLAVE_VENDEDOR = 'lmont.venta.vendedor';
const pagoVacio = (): PagoBorrador => ({ medio: '', cuotas: 1, monto: '' });
const vacio = (): Borrador => ({ items: [], pagos: [pagoVacio()], nota: '' });

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}
function guardar(clave: string, valor: unknown) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento: el borrador no se recuerda, pero la venta sigue funcionando.
  }
}
function leerBorrador(): Borrador {
  const b = leer<Borrador | null>(CLAVE_BORRADOR, null);
  return b && Array.isArray(b.items) && Array.isArray(b.pagos) && b.pagos.length ? b : vacio();
}

/** Producto con el que se agrega una prenda (viene del lector o del buscador). */
type Elegida = Pick<VarianteEncontrada, 'id' | 'color' | 'talle' | 'stock' | 'activo'> & {
  producto: Pick<VarianteEncontrada['producto'], 'nombre' | 'tipo' | 'precioVenta' | 'activo'>;
};

/** Pantalla de venta: escanear o buscar prendas, elegir cómo paga y cobrar. */
export function NuevaVenta() {
  const qc = useQueryClient();
  const [b, setB] = useState<Borrador>(leerBorrador);
  useEffect(() => guardar(CLAVE_BORRADOR, b.items.length ? b : null), [b]);
  const [vendedorId, setVendedorId] = useState<string>(() => leer(CLAVE_VENDEDOR, ''));
  useEffect(() => guardar(CLAVE_VENDEDOR, vendedorId || null), [vendedorId]);

  const planes = useQuery({ queryKey: ['planes-pago', 'activos'], queryFn: () => api<PlanPago[]>('/planes-pago?activos=1') });
  const vendedores = useQuery({ queryKey: ['vendedores', 'activos'], queryFn: () => api<Vendedor[]>('/vendedores?activos=1') });
  // Si el vendedor recordado ya no está activo, se vuelve a elegir.
  useEffect(() => {
    if (vendedores.data && vendedorId && !vendedores.data.some((v) => String(v.id) === vendedorId)) setVendedorId('');
  }, [vendedores.data, vendedorId]);

  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ListaProductos['productos'] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agregado, setAgregado] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<number | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState<VentaDetalle | null>(null);
  const [pagaCon, setPagaCon] = useState('');
  const buscador = useRef<HTMLInputElement>(null);

  /** Suma una unidad de la prenda, sin pasarse del stock. */
  function agregar(v: Elegida) {
    const nombre = `${v.producto.tipo.nombre} ${v.producto.nombre}`;
    const desc = `${nombre} ${v.color.nombre} ${v.talle.nombre}`;
    if (!v.activo || !v.producto.activo) return setAviso(`${desc} está desactivado y no se puede vender.`);
    const actual = b.items.find((it) => it.varianteId === v.id)?.cantidad ?? 0;
    if (actual + 1 > v.stock) {
      return setAviso(v.stock === 0 ? `No hay stock de ${desc}.` : `No hay más stock de ${desc}: quedan ${v.stock} y ya están todas en la venta.`);
    }
    setAviso(null);
    setHecho(null);
    setB((x) => {
      const i = x.items.findIndex((it) => it.varianteId === v.id);
      if (i >= 0) return { ...x, items: x.items.map((it, j) => (j === i ? { ...it, cantidad: it.cantidad + 1, stock: v.stock } : it)) };
      const nuevo: ItemVenta = {
        varianteId: v.id,
        nombre,
        color: v.color.nombre,
        talle: v.talle.nombre,
        stock: v.stock,
        precioLista: v.producto.precioVenta,
        precio: montoParaInput(v.producto.precioVenta),
        cantidad: 1,
      };
      return { ...x, items: [...x.items, nuevo] };
    });
    setAgregado(`+1 ${desc}`);
  }

  const buscar = async (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    setAviso(null);
    if (!t) return;
    if (pareceCodigo(t)) {
      try {
        const v = await api<VarianteEncontrada>(`/variantes/codigo/${encodeURIComponent(t)}`);
        agregar(v);
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

  const cambiarItem = (varianteId: number, f: (it: ItemVenta) => ItemVenta | null) =>
    setB((x) => ({ ...x, items: x.items.flatMap((it) => (it.varianteId === varianteId ? (f(it) ?? []) : [it])) }));
  const cambiarPago = (i: number, cambios: Partial<PagoBorrador>) =>
    setB((x) => ({ ...x, pagos: x.pagos.map((p, j) => (j === i ? { ...p, ...cambios } : p)) }));

  // --- Cálculos (el servidor vuelve a calcular y validar todo) ---
  let subtotal = 0;
  let unidades = 0;
  for (const it of b.items) {
    const p = parseMonto(it.precio);
    unidades += it.cantidad;
    if (p.ok) subtotal += it.cantidad * p.value;
  }
  subtotal = redondear(subtotal);

  const medios = [...new Set(planes.data?.map((p) => p.medio) ?? [])];
  const planesCredito = planes.data?.filter((p) => p.medio === 'CREDITO') ?? [];
  const ultimo = b.pagos.length - 1;
  const montosPrevios = b.pagos.slice(0, ultimo).map((p) => parseMonto(p.monto));
  const resto = redondear(subtotal - montosPrevios.reduce((s, m) => s + (m.ok ? m.value : 0), 0));
  const pagos = b.pagos.map((p, i) => {
    const m = i === ultimo ? resto : montosPrevios[i]!.ok ? montosPrevios[i]!.value : 0;
    const plan = planes.data?.find((x) => x.medio === p.medio && x.cuotas === p.cuotas);
    const porcentaje = plan?.porcentaje ?? 0;
    return { ...p, montoBase: m, porcentaje, ...aplicarPorcentaje(m, porcentaje) };
  });
  const total = redondear(pagos.reduce((s, p) => s + p.cobrado, 0));
  const efectivo = pagos.filter((p) => p.medio === 'EFECTIVO').reduce((s, p) => s + p.cobrado, 0);
  const pagaConMonto = parseMonto(pagaCon);
  const vuelto = pagaConMonto.ok && efectivo > 0 ? redondear(pagaConMonto.value - efectivo) : null;

  const registrar = useMutation({
    mutationFn: (d: VentaInput) => api<VentaDetalle>('/ventas', { body: d }),
    onSuccess: (r) => {
      setHecho(r);
      setB(vacio());
      setErrores({});
      setPagaCon('');
      for (const k of ['ventas', 'productos', 'producto', 'stock', 'caja']) qc.invalidateQueries({ queryKey: [k] });
      window.scrollTo({ top: 0 });
      buscador.current?.focus();
    },
  });

  const cobrar = () => {
    const errs: Record<string, string> = {};
    for (const it of b.items) {
      const p = parseMonto(it.precio);
      if (!p.ok) errs[`precio-${it.varianteId}`] = p.error;
    }
    if (vendedores.data?.length && !vendedorId) errs.vendedor = 'Elegí quién vendió';
    b.pagos.forEach((p, i) => {
      if (!p.medio) errs[`medio-${i}`] = 'Elegí el medio de pago';
      if (i < ultimo) {
        const m = montosPrevios[i]!;
        if (!m.ok) errs[`monto-${i}`] = m.error;
        else if (m.value <= 0) errs[`monto-${i}`] = 'Tiene que ser mayor a 0';
      }
    });
    if (b.pagos.length > 1 && resto <= 0) errs[`monto-${ultimo}`] = 'Los montos de arriba ya cubren todo: sacá este medio o corregí los montos';
    setErrores(errs);
    if (Object.keys(errs).length) return;
    registrar.mutate({
      vendedorId: vendedorId ? Number(vendedorId) : null,
      nota: b.nota,
      items: b.items.map((it) => ({ varianteId: it.varianteId, cantidad: it.cantidad, precioUnitario: (parseMonto(it.precio) as { value: number }).value })),
      pagos: pagos.map((p) => ({ medio: p.medio as MedioPago, cuotas: p.medio === 'CREDITO' ? p.cuotas : 1, monto: p.montoBase })),
    });
  };

  return (
    <Stack spacing={2}>
      {hecho && (
        <Alert severity="success" onClose={() => setHecho(null)}>
          Venta registrada por <b>{formatMonto(hecho.total)}</b> ({hecho.unidades} {hecho.unidades === 1 ? 'prenda' : 'prendas'}).{' '}
          <RouterLink to={`/ventas/${hecho.id}`}>Ver detalle</RouterLink>
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
      </Paper>

      {b.items.length === 0 ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">
            Escaneá las prendas que se lleva el cliente (cada lectura suma 1) o buscalas por nombre.
          </Typography>
        </Paper>
      ) : (
        <Paper>
          {b.items.map((it, i) => {
            const p = parseMonto(it.precio);
            return (
              <Box key={it.varianteId}>
                {i > 0 && <Divider />}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2, alignItems: { sm: 'center' } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{it.nombre}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {it.color} · {it.talle} · quedan {it.stock - it.cantidad}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <IconButton aria-label="Una menos" disabled={it.cantidad <= 1} onClick={() => cambiarItem(it.varianteId, (x) => ({ ...x, cantidad: x.cantidad - 1 }))}>
                      <RemoveIcon />
                    </IconButton>
                    <Typography sx={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{it.cantidad}</Typography>
                    <IconButton
                      aria-label="Una más"
                      disabled={it.cantidad >= it.stock}
                      onClick={() => cambiarItem(it.varianteId, (x) => ({ ...x, cantidad: x.cantidad + 1 }))}
                    >
                      <AddIcon />
                    </IconButton>
                    <MontoField
                      size="small"
                      label="Precio c/u"
                      value={it.precio}
                      onChange={(e) => cambiarItem(it.varianteId, (x) => ({ ...x, precio: e.target.value }))}
                      error={!!errores[`precio-${it.varianteId}`]}
                      helperText={
                        errores[`precio-${it.varianteId}`] ??
                        (p.ok && p.value !== it.precioLista ? `Lista ${formatMonto(it.precioLista)}` : undefined)
                      }
                      sx={{ width: 150 }}
                    />
                    <Typography sx={{ fontWeight: 600, minWidth: 90, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {p.ok ? formatMonto(p.value * it.cantidad) : '—'}
                    </Typography>
                    <IconButton aria-label={`Quitar ${it.nombre} ${it.color} ${it.talle}`} onClick={() => cambiarItem(it.varianteId, () => null)}>
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Paper>
      )}

      {b.items.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            {!!vendedores.data?.length && (
              <TextField
                select
                label="Vendió"
                value={vendedorId}
                onChange={(e) => setVendedorId(e.target.value)}
                error={!!errores.vendedor}
                helperText={errores.vendedor}
                sx={{ maxWidth: { sm: 280 } }}
              >
                {vendedores.data.map((v) => (
                  <MenuItem key={v.id} value={String(v.id)}>
                    {v.nombre}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography color="text.secondary">
                {unidades} {unidades === 1 ? 'prenda' : 'prendas'}
              </Typography>
              <Typography color="text.secondary">Subtotal {formatMonto(subtotal)}</Typography>
            </Stack>

            {pagos.map((p, i) => (
              <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Stack direction="row" sx={{ alignItems: 'center', mb: 1, gap: 1 }}>
                  <Typography variant="subtitle2" sx={{ flex: 1 }}>
                    {b.pagos.length > 1 ? `Pago ${i + 1}` : 'Cómo paga'}
                  </Typography>
                  {b.pagos.length > 1 && (
                    <IconButton size="small" aria-label={`Sacar el pago ${i + 1}`} onClick={() => setB((x) => ({ ...x, pagos: x.pagos.filter((_, j) => j !== i) }))}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
                <ToggleButtonGroup
                  exclusive
                  value={p.medio || null}
                  onChange={(_, m: MedioPago | null) => m && cambiarPago(i, { medio: m, cuotas: m === 'CREDITO' ? (planesCredito[0]?.cuotas ?? 1) : 1 })}
                  sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { flex: '1 1 120px', minHeight: 48 } }}
                  aria-label="Medio de pago"
                >
                  {medios.map((m) => (
                    <ToggleButton key={m} value={m} color="primary">
                      {MEDIOS_PAGO[m]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                {errores[`medio-${i}`] && (
                  <Typography variant="caption" color="error">
                    {errores[`medio-${i}`]}
                  </Typography>
                )}

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1.5, alignItems: { sm: 'flex-start' } }}>
                  {p.medio === 'CREDITO' && planesCredito.length > 1 && (
                    <TextField select size="small" label="Cuotas" value={p.cuotas} onChange={(e) => cambiarPago(i, { cuotas: Number(e.target.value) })} sx={{ minWidth: 200 }}>
                      {planesCredito.map((pl) => (
                        <MenuItem key={pl.id} value={pl.cuotas}>
                          {pl.cuotas} {pl.cuotas === 1 ? 'cuota' : 'cuotas'}
                          {pl.porcentaje ? ` (${textoPorcentaje(pl.porcentaje)})` : ''}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                  {b.pagos.length > 1 &&
                    (i < ultimo ? (
                      <MontoField
                        size="small"
                        label="Monto"
                        value={p.monto}
                        onChange={(e) => cambiarPago(i, { monto: e.target.value })}
                        error={!!errores[`monto-${i}`]}
                        helperText={errores[`monto-${i}`]}
                        sx={{ maxWidth: { sm: 180 } }}
                      />
                    ) : (
                      <Box sx={{ pt: { sm: 1 } }}>
                        <Typography variant="body2">Resto: {formatMonto(Math.max(0, resto))}</Typography>
                        {errores[`monto-${i}`] && (
                          <Typography variant="caption" color="error">
                            {errores[`monto-${i}`]}
                          </Typography>
                        )}
                      </Box>
                    ))}
                </Stack>
                {!!p.porcentaje && p.montoBase > 0 && (
                  <Typography variant="body2" sx={{ mt: 1 }} color={p.porcentaje < 0 ? 'success.main' : 'warning.main'}>
                    {textoPorcentaje(p.porcentaje)}: {p.ajuste > 0 ? '+' : ''}
                    {formatMonto(p.ajuste)} → se cobra {formatMonto(p.cobrado)}
                  </Typography>
                )}
              </Box>
            ))}

            {b.pagos.length < 4 && (
              <Button
                startIcon={<AddIcon />}
                onClick={() =>
                  setB((x) => ({
                    ...x,
                    // El que era el último pasa a tener un monto propio: arranca con lo que cubría.
                    pagos: [...x.pagos.slice(0, -1), { ...x.pagos[x.pagos.length - 1]!, monto: montoParaInput(Math.max(0, resto)) }, pagoVacio()],
                  }))
                }
                sx={{ alignSelf: 'flex-start' }}
              >
                Combinar con otro medio de pago
              </Button>
            )}

            {efectivo > 0 && (
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <MontoField size="small" label="Paga con (efectivo)" value={pagaCon} onChange={(e) => setPagaCon(e.target.value)} sx={{ maxWidth: 200 }} />
                {vuelto !== null && (
                  <Typography sx={{ fontWeight: 600 }} color={vuelto < 0 ? 'error' : undefined}>
                    {vuelto < 0 ? `Faltan ${formatMonto(-vuelto)}` : `Vuelto ${formatMonto(vuelto)}`}
                  </Typography>
                )}
              </Stack>
            )}

            <TextField label="Nota (opcional)" value={b.nota} onChange={(e) => setB((x) => ({ ...x, nota: e.target.value }))} />

            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography color="text.secondary">Total a cobrar</Typography>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {formatMonto(total)}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button color="inherit" onClick={() => window.confirm('¿Descartar esta venta?') && setB(vacio())}>
                  Descartar
                </Button>
                <Button variant="contained" size="large" onClick={cobrar} loading={registrar.isPending} sx={{ minWidth: 140 }}>
                  Cobrar
                </Button>
              </Stack>
            </Stack>
            {registrar.error && <Alert severity="error">{mensajeDeError(registrar.error)}</Alert>}
          </Stack>
        </Paper>
      )}

      {eligiendo && (
        <ElegirVarianteDialog
          productoId={eligiendo}
          enVenta={b.items}
          onClose={() => setEligiendo(null)}
          onElegir={(v) => {
            agregar(v);
            setEligiendo(null);
            setResultados(null);
            setTexto('');
            buscador.current?.focus();
          }}
        />
      )}
      <Snackbar open={!!agregado} message={agregado} autoHideDuration={1500} onClose={() => setAgregado(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Stack>
  );
}

/** Elegir color y talle de un producto buscado por nombre. */
function ElegirVarianteDialog(props: { productoId: number; enVenta: ItemVenta[]; onClose: () => void; onElegir: (v: Elegida) => void }) {
  const { data: p, error } = useQuery({
    queryKey: ['producto', props.productoId],
    queryFn: () => api<ProductoDetalle>(`/productos/${props.productoId}`),
  });
  const activas = p?.variantes.filter((v) => v.activo) ?? [];
  const colores = [...new Set(activas.map((v) => v.color.nombre))];
  const disponibles = (v: (typeof activas)[number]) => v.stock - (props.enVenta.find((it) => it.varianteId === v.id)?.cantidad ?? 0);

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
                    const quedan = disponibles(v);
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
