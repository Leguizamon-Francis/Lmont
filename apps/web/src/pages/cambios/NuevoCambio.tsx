import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import {
  aplicarPorcentaje,
  calcularCambio,
  errorPagosCambio,
  formatFecha,
  formatMonto,
  hoy,
  MEDIOS_PAGO,
  montoParaInput,
  parseMonto,
  textoPorcentaje,
  type CambioInput,
  type MedioPago,
  type PlanPago,
  type Vendedor,
  type VentaDetalle,
} from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { MontoField } from '../../components/campos';
import { BuscadorPrendas, type Elegida } from '../../components/BuscadorPrendas';

type Llevado = { varianteId: number; productoId: number; nombre: string; color: string; talle: string; stock: number; precioLista: number; precio: string; cantidad: number };

const CLAVE_VENDEDOR = 'lmont.venta.vendedor';
const leerVendedor = () => {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_VENDEDOR) ?? '""') as string;
  } catch {
    return '';
  }
};

/** Cambio o devolución sobre una venta: qué vuelve, qué se lleva y la diferencia. */
export function NuevoCambio() {
  const ventaId = Number(useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const venta = useQuery({ queryKey: ['ventas', 'detalle', ventaId], queryFn: () => api<VentaDetalle>(`/ventas/${ventaId}`) });
  const planes = useQuery({ queryKey: ['planes-pago', 'activos'], queryFn: () => api<PlanPago[]>('/planes-pago?activos=1') });
  const vendedores = useQuery({ queryKey: ['vendedores', 'activos'], queryFn: () => api<Vendedor[]>('/vendedores?activos=1') });

  /** ventaItemId -> unidades que vuelven */
  const [vuelven, setVuelven] = useState<Record<number, number>>({});
  const [llevados, setLlevados] = useState<Llevado[]>([]);
  const [medio, setMedio] = useState<MedioPago | ''>('');
  const [cuotas, setCuotas] = useState(1);
  const [vendedorId, setVendedorId] = useState(leerVendedor);
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});

  const v = venta.data;
  // Si se vendió una sola prenda, ya queda marcada.
  useEffect(() => {
    if (v && v.items.length === 1 && v.items[0]!.cantidad - v.items[0]!.devueltas === 1) setVuelven({ [v.items[0]!.id]: 1 });
  }, [v]);
  useEffect(() => {
    if (vendedores.data && vendedorId && !vendedores.data.some((x) => String(x.id) === vendedorId)) setVendedorId('');
  }, [vendedores.data, vendedorId]);

  const registrar = useMutation({
    mutationFn: (d: CambioInput) => api<VentaDetalle>('/cambios', { body: d }),
    onSuccess: () => {
      for (const k of ['ventas', 'productos', 'producto', 'stock', 'caja', 'cambios', 'clientes']) qc.invalidateQueries({ queryKey: [k] });
      navigate(`/ventas/${ventaId}`, { state: { cambioRegistrado: true } });
    },
  });

  if (venta.isPending) return <Typography color="text.secondary">Cargando…</Typography>;
  if (venta.error || !v) return <Alert severity="error">{mensajeDeError(venta.error)}</Alert>;

  const volver = (
    <Box>
      <Button component={RouterLink} to={`/ventas/${v.id}`} startIcon={<ArrowBackIcon />} sx={{ ml: -1 }}>
        Venta N° {v.id}
      </Button>
    </Box>
  );
  if (v.anulada) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 800 }}>
        {volver}
        <Alert severity="warning">Esta venta está anulada: no se pueden hacer cambios ni devoluciones.</Alert>
      </Stack>
    );
  }

  // --- Cálculos (el servidor vuelve a calcular y validar todo) ---
  const devueltos = v.items.filter((it) => (vuelven[it.id] ?? 0) > 0).map((it) => ({ ...it, vuelve: vuelven[it.id]! }));
  const llevadosOk = llevados.map((l) => ({ ...l, p: parseMonto(l.precio) }));
  const { totalDevuelto, totalLlevado, diferencia } = calcularCambio(
    devueltos.map((d) => ({ cantidad: d.vuelve, precioUnitario: d.precioEfectivo })),
    llevadosOk.map((l) => ({ cantidad: l.cantidad, precioUnitario: l.p.ok ? l.p.value : 0 })),
  );
  const plan = planes.data?.find((p) => p.medio === medio && p.cuotas === (medio === 'CREDITO' ? cuotas : 1));
  const cobro = diferencia > 0 ? aplicarPorcentaje(diferencia, plan?.porcentaje ?? 0) : null;
  const medios = diferencia > 0 ? [...new Set(planes.data?.map((p) => p.medio) ?? [])] : (Object.keys(MEDIOS_PAGO) as MedioPago[]);
  const planesCredito = planes.data?.filter((p) => p.medio === 'CREDITO') ?? [];

  /** Precio sugerido: si cambia por otro talle o color del mismo producto, el que pagó; si no, el de lista. */
  const precioSugerido = (e: Elegida) => devueltos.find((d) => d.variante.producto.id === e.producto.id)?.precioEfectivo ?? e.producto.precioVenta;

  function agregar(e: Elegida): string | null {
    const desc = `${e.producto.tipo.nombre} ${e.producto.nombre} ${e.color.nombre} ${e.talle.nombre}`;
    if (!e.activo || !e.producto.activo) return `${desc} está desactivado.`;
    // Si cambia por la misma prenda (por una falla), la que vuelve también cuenta.
    const vuelveIgual = devueltos.filter((d) => d.variante.id === e.id).reduce((s, d) => s + d.vuelve, 0);
    const disponibles = e.stock + vuelveIgual;
    const actual = llevados.find((l) => l.varianteId === e.id)?.cantidad ?? 0;
    if (actual + 1 > disponibles) return disponibles === 0 ? `No hay stock de ${desc}.` : `No hay más stock de ${desc}.`;
    setLlevados((xs) => {
      const i = xs.findIndex((l) => l.varianteId === e.id);
      if (i >= 0) return xs.map((l, j) => (j === i ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [
        ...xs,
        {
          varianteId: e.id,
          productoId: e.producto.id,
          nombre: `${e.producto.tipo.nombre} ${e.producto.nombre}`,
          color: e.color.nombre,
          talle: e.talle.nombre,
          stock: disponibles,
          precioLista: e.producto.precioVenta,
          precio: montoParaInput(precioSugerido(e)),
          cantidad: 1,
        },
      ];
    });
    return null;
  }
  const cambiarLlevado = (id: number, f: (l: Llevado) => Llevado | null) => setLlevados((xs) => xs.flatMap((l) => (l.varianteId === id ? (f(l) ?? []) : [l])));

  const confirmar = () => {
    const errs: Record<string, string> = {};
    if (!devueltos.length) errs.devueltos = 'Marcá qué prendas trae el cliente';
    for (const l of llevadosOk) if (!l.p.ok) errs[`precio-${l.varianteId}`] = l.p.error;
    if (vendedores.data?.length && !vendedorId) errs.vendedor = 'Elegí quién atendió';
    const pagos = diferencia > 0 && medio ? [{ monto: diferencia }] : [];
    const e = errorPagosCambio(diferencia, pagos, diferencia < 0 ? medio || null : null);
    if (e && !Object.keys(errs).length) errs.pagos = diferencia !== 0 && !medio ? (diferencia > 0 ? 'Elegí cómo paga la diferencia' : 'Elegí cómo le devolvés la plata') : e;
    setErrores(errs);
    if (Object.keys(errs).length) return;
    try {
      localStorage.setItem(CLAVE_VENDEDOR, JSON.stringify(vendedorId));
    } catch {
      // sin almacenamiento
    }
    registrar.mutate({
      ventaId: v.id,
      vendedorId: vendedorId ? Number(vendedorId) : null,
      nota,
      devueltos: devueltos.map((d) => ({ ventaItemId: d.id, cantidad: d.vuelve })),
      llevados: llevadosOk.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad, precioUnitario: (l.p as { value: number }).value })),
      pagos: diferencia > 0 ? [{ medio: medio as MedioPago, cuotas: medio === 'CREDITO' ? cuotas : 1, monto: diferencia }] : [],
      medioReintegro: diferencia < 0 ? (medio as MedioPago) : null,
    });
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 800 }}>
      {volver}
      <Box>
        <Typography variant="h4">Cambio o devolución</Typography>
        <Typography color="text.secondary">
          Venta N° {v.id} del {formatFecha(hoy(new Date(v.creadoEn)))}
          {v.cliente ? ` · ${v.cliente.nombre}` : ''}
        </Typography>
      </Box>

      {/* 1. Lo que vuelve */}
      <Paper>
        <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}>
          <Typography sx={{ fontWeight: 600 }}>1. ¿Qué trae el cliente?</Typography>
          {errores.devueltos && (
            <Typography variant="body2" color="error">
              {errores.devueltos}
            </Typography>
          )}
        </Box>
        {v.items.map((it, i) => {
          const quedan = it.cantidad - it.devueltas;
          const n = vuelven[it.id] ?? 0;
          return (
            <Box key={it.id}>
              {i > 0 && <Divider />}
              <Stack direction="row" spacing={1.5} sx={{ p: 2, alignItems: 'center', opacity: quedan ? 1 : 0.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {it.variante.producto.tipo.nombre} {it.variante.producto.nombre}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {it.variante.color.nombre} · {it.variante.talle.nombre} · pagó {formatMonto(it.precioEfectivo)} c/u
                    {it.devueltas > 0 && ` · ya ${it.devueltas === 1 ? 'volvió 1' : `volvieron ${it.devueltas}`} de ${it.cantidad}`}
                    {quedan === 0 && ' · ya se devolvió todo'}
                  </Typography>
                </Box>
                {quedan > 0 && (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <IconButton aria-label="Una menos" disabled={n <= 0} onClick={() => setVuelven((x) => ({ ...x, [it.id]: n - 1 }))}>
                      <RemoveIcon />
                    </IconButton>
                    <Typography sx={{ minWidth: 48, textAlign: 'center', fontWeight: 600 }}>
                      {n} de {quedan}
                    </Typography>
                    <IconButton aria-label="Una más" disabled={n >= quedan} onClick={() => setVuelven((x) => ({ ...x, [it.id]: n + 1 }))}>
                      <AddIcon />
                    </IconButton>
                  </Stack>
                )}
              </Stack>
            </Box>
          );
        })}
      </Paper>

      {/* 2. Lo que se lleva */}
      <Box>
        <Typography sx={{ fontWeight: 600, mb: 1 }}>2. ¿Qué se lleva a cambio?</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Escaneá o buscá las prendas nuevas. Si no se lleva nada, es una devolución.
        </Typography>
        <BuscadorPrendas onElegir={agregar} reservadas={(id) => llevados.find((l) => l.varianteId === id)?.cantidad ?? 0} />
      </Box>
      {llevados.length > 0 && (
        <Paper>
          {llevadosOk.map((l, i) => (
            <Box key={l.varianteId}>
              {i > 0 && <Divider />}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2, alignItems: { sm: 'center' } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }}>{l.nombre}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {l.color} · {l.talle}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <IconButton aria-label="Una menos" disabled={l.cantidad <= 1} onClick={() => cambiarLlevado(l.varianteId, (x) => ({ ...x, cantidad: x.cantidad - 1 }))}>
                    <RemoveIcon />
                  </IconButton>
                  <Typography sx={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{l.cantidad}</Typography>
                  <IconButton aria-label="Una más" disabled={l.cantidad >= l.stock} onClick={() => cambiarLlevado(l.varianteId, (x) => ({ ...x, cantidad: x.cantidad + 1 }))}>
                    <AddIcon />
                  </IconButton>
                  <MontoField
                    size="small"
                    label="Precio c/u"
                    value={l.precio}
                    onChange={(e) => cambiarLlevado(l.varianteId, (x) => ({ ...x, precio: e.target.value }))}
                    error={!!errores[`precio-${l.varianteId}`]}
                    helperText={errores[`precio-${l.varianteId}`] ?? (l.p.ok && l.p.value !== l.precioLista ? `Lista ${formatMonto(l.precioLista)}` : undefined)}
                    sx={{ width: 150, flexShrink: 0 }}
                  />
                  <IconButton aria-label={`Quitar ${l.nombre} ${l.color} ${l.talle}`} onClick={() => cambiarLlevado(l.varianteId, () => null)}>
                    <DeleteIcon />
                  </IconButton>
                </Stack>
              </Stack>
            </Box>
          ))}
        </Paper>
      )}

      {/* 3. Diferencia y confirmación */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Typography sx={{ fontWeight: 600 }}>3. Diferencia</Typography>
          <Fila texto="Vuelve" valor={formatMonto(totalDevuelto)} />
          <Fila texto="Se lleva" valor={formatMonto(totalLlevado)} />
          <Divider />
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
            <Typography variant="h6">{diferencia > 0 ? 'El cliente paga' : diferencia < 0 ? 'Le devolvés' : 'Diferencia'}</Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }} color={diferencia < 0 ? 'error' : undefined}>
              {formatMonto(cobro ? cobro.cobrado : Math.abs(diferencia))}
            </Typography>
          </Stack>
          {diferencia === 0 && devueltos.length > 0 && <Typography color="text.secondary">No hay plata de por medio.</Typography>}

          {diferencia !== 0 && (
            <Box>
              <ToggleButtonGroup
                exclusive
                value={medio || null}
                onChange={(_, m: MedioPago | null) => {
                  if (!m) return;
                  setMedio(m);
                  setCuotas(m === 'CREDITO' ? (planesCredito[0]?.cuotas ?? 1) : 1);
                }}
                sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { flex: '1 1 120px', minHeight: 48 } }}
                aria-label={diferencia > 0 ? 'Cómo paga' : 'Cómo le devolvés'}
              >
                {medios.map((m) => (
                  <ToggleButton key={m} value={m} color="primary">
                    {MEDIOS_PAGO[m]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {diferencia > 0 && medio === 'CREDITO' && planesCredito.length > 1 && (
                <TextField select size="small" label="Cuotas" value={cuotas} onChange={(e) => setCuotas(Number(e.target.value))} sx={{ mt: 1.5, minWidth: 200 }}>
                  {planesCredito.map((pl) => (
                    <MenuItem key={pl.id} value={pl.cuotas}>
                      {pl.cuotas} {pl.cuotas === 1 ? 'cuota' : 'cuotas'}
                      {pl.porcentaje ? ` (${textoPorcentaje(pl.porcentaje)})` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {cobro && !!plan?.porcentaje && (
                <Typography variant="body2" sx={{ mt: 1 }} color={plan.porcentaje < 0 ? 'success.main' : 'warning.main'}>
                  Diferencia {formatMonto(diferencia)} con {textoPorcentaje(plan.porcentaje)}: {cobro.ajuste > 0 ? '+' : ''}
                  {formatMonto(cobro.ajuste)}
                </Typography>
              )}
            </Box>
          )}
          {errores.pagos && (
            <Typography variant="body2" color="error">
              {errores.pagos}
            </Typography>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {!!vendedores.data?.length && (
              <TextField
                select
                label="Atendió"
                value={vendedorId}
                onChange={(e) => setVendedorId(e.target.value)}
                error={!!errores.vendedor}
                helperText={errores.vendedor}
                sx={{ width: { sm: 220 } }}
              >
                {vendedores.data.map((x) => (
                  <MenuItem key={x.id} value={String(x.id)}>
                    {x.nombre}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField label="Nota (opcional)" placeholder="Ej: le quedaba chico" value={nota} onChange={(e) => setNota(e.target.value)} sx={{ flex: 1 }} />
          </Stack>

          {registrar.error && <Alert severity="error">{mensajeDeError(registrar.error)}</Alert>}
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button color="inherit" component={RouterLink} to={`/ventas/${v.id}`}>
              Cancelar
            </Button>
            <Button variant="contained" size="large" onClick={confirmar} loading={registrar.isPending} sx={{ minWidth: 160 }}>
              {llevados.length ? 'Registrar cambio' : 'Registrar devolución'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}

function Fila({ texto, valor }: { texto: string; valor: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
      <Typography color="text.secondary">{texto}</Typography>
      <Typography>{valor}</Typography>
    </Stack>
  );
}
