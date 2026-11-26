import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import CloseIcon from '@mui/icons-material/Close';
import LocalOfferIcon from '@mui/icons-material/LocalOfferOutlined';
import {
  ajustarPromos,
  aplicarPorcentaje,
  aplicarPromos,
  CUOTAS_CREDITO,
  formatMonto,
  MEDIOS_PAGO,
  montoParaInput,
  parseMonto,
  porcentajeSchema,
  promosPosibles,
  redondear,
  textoPorcentaje,
  type ItemParaPromo,
  type MedioPago,
  type PlanPago,
  type PromoAplicada,
  type Promocion,
  type Vendedor,
  type VentaDetalle,
  type VentaInput,
} from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { MontoField } from '../../components/campos';
import { BuscadorPrendas, type Elegida } from '../../components/BuscadorPrendas';
import { ClienteSelector, type ClienteElegido } from '../../components/ClienteSelector';

type ItemVenta = {
  varianteId: number;
  nombre: string;
  color: string;
  talle: string;
  stock: number;
  precioLista: number;
  precio: string;
  cantidad: number;
  /** Para saber qué promos le corresponden. */
  productoId?: number;
  tipoId?: number;
};
/** `recargo`: % que escribe el vendedor cuando paga con crédito. */
type PagoBorrador = { medio: MedioPago | ''; cuotas: number; monto: string; recargo?: string };
type Borrador = { items: ItemVenta[]; pagos: PagoBorrador[]; nota: string; cliente?: ClienteElegido | null; promos?: PromoAplicada[] };

const CLAVE_BORRADOR = 'lmont.venta.borrador';
const CLAVE_VENDEDOR = 'lmont.venta.vendedor';
const pagoVacio = (): PagoBorrador => ({ medio: '', cuotas: 1, monto: '' });
const vacio = (): Borrador => ({ items: [], pagos: [pagoVacio()], nota: '', cliente: null, promos: [] });

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
/** Lee el recargo que escribió el vendedor ("10", "12,5", vacío = 0). */
function leerRecargo(texto = ''): { ok: true; value: number } | { ok: false; error: string } {
  const r = porcentajeSchema.safeParse(texto);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? 'Revisá el recargo' };
  if (r.data < 0) return { ok: false, error: 'El recargo no puede ser negativo' };
  return { ok: true, value: r.data };
}

function leerBorrador(): Borrador {
  const b = leer<Borrador | null>(CLAVE_BORRADOR, null);
  return b && Array.isArray(b.items) && Array.isArray(b.pagos) && b.pagos.length ? b : vacio();
}

/** Pantalla de venta: escanear o buscar prendas, elegir cómo paga y cobrar. */
export function NuevaVenta() {
  const qc = useQueryClient();
  const [b, setB] = useState<Borrador>(leerBorrador);
  useEffect(() => guardar(CLAVE_BORRADOR, b.items.length || b.cliente ? b : null), [b]);
  const [vendedorId, setVendedorId] = useState<string>(() => leer(CLAVE_VENDEDOR, ''));
  useEffect(() => guardar(CLAVE_VENDEDOR, vendedorId || null), [vendedorId]);

  const planes = useQuery({ queryKey: ['planes-pago', 'activos'], queryFn: () => api<PlanPago[]>('/planes-pago?activos=1') });
  const vendedores = useQuery({ queryKey: ['vendedores', 'activos'], queryFn: () => api<Vendedor[]>('/vendedores?activos=1') });
  const promosVigentes = useQuery({ queryKey: ['promociones', 'vigentes'], queryFn: () => api<Promocion[]>('/promociones?vigentes=1') });
  // Si el vendedor recordado ya no está activo, se vuelve a elegir.
  useEffect(() => {
    if (vendedores.data && vendedorId && !vendedores.data.some((v) => String(v.id) === vendedorId)) setVendedorId('');
  }, [vendedores.data, vendedorId]);

  const [agregado, setAgregado] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState<VentaDetalle | null>(null);
  const [pagaCon, setPagaCon] = useState('');
  const buscador = useRef<HTMLInputElement>(null);

  // Unidades de cada prenda ya en la venta. Es una referencia (no el estado) para que dos lecturas
  // seguidas del escáner vean la cantidad real aunque la pantalla todavía no se haya redibujado.
  const enLaVenta = useRef(new Map<number, number>());
  enLaVenta.current = new Map(b.items.map((it) => [it.varianteId, it.cantidad]));

  /** Suma una unidad de la prenda, sin pasarse del stock. Devuelve el aviso si no se pudo. */
  function agregar(v: Elegida): string | null {
    const nombre = `${v.producto.tipo.nombre} ${v.producto.nombre}`;
    const desc = `${nombre} ${v.color.nombre} ${v.talle.nombre}`;
    if (!v.activo || !v.producto.activo) return `${desc} está desactivado y no se puede vender.`;
    const actual = enLaVenta.current.get(v.id) ?? 0;
    if (actual + 1 > v.stock) {
      return v.stock === 0 ? `No hay stock de ${desc}.` : `No hay más stock de ${desc}: quedan ${v.stock} y ya están todas en la venta.`;
    }
    enLaVenta.current.set(v.id, actual + 1);
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
        productoId: v.producto.id,
        tipoId: v.producto.tipo.id,
      };
      return { ...x, items: [...x.items, nuevo] };
    });
    setAgregado(`+1 ${desc}`);
    return null;
  }

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

  // Promociones: se descartan solas las que ya no entran (por ejemplo, si se sacó una prenda).
  const itemsPromo: ItemParaPromo[] = b.items.flatMap((it) => {
    const p = parseMonto(it.precio);
    return it.productoId && it.tipoId && p.ok
      ? [{ varianteId: it.varianteId, productoId: it.productoId, tipoId: it.tipoId, cantidad: it.cantidad, precioUnitario: p.value }]
      : [];
  });
  const listaPromos = promosVigentes.data ?? [];
  const promosAplicadas = ajustarPromos(itemsPromo, b.promos ?? [], listaPromos);
  const conPromos = aplicarPromos(itemsPromo, promosAplicadas, listaPromos);
  const descuentoPromos = conPromos.ok ? conPromos.descuentoTotal : 0;
  const posibles = promosPosibles(itemsPromo, promosAplicadas, listaPromos);
  const productos = subtotal;
  subtotal = redondear(productos - descuentoPromos);
  const aplicarPromo = (promocionId: number, delta: 1 | -1) =>
    setB((x) => {
      const actuales = promosAplicadas;
      const ya = actuales.find((a) => a.promocionId === promocionId);
      const promos = ya
        ? actuales.map((a) => (a === ya ? { ...a, veces: a.veces + delta } : a)).filter((a) => a.veces > 0)
        : delta > 0
          ? [...actuales, { promocionId, veces: 1 }]
          : actuales;
      return { ...x, promos };
    });

  const medios = [...new Set(planes.data?.map((p) => p.medio) ?? [])];
  /** % configurado para ese plan: con crédito es solo el valor inicial del recargo, el vendedor lo puede cambiar. */
  const porcentajePlan = (medio: MedioPago, cuotas: number) => planes.data?.find((x) => x.medio === medio && x.cuotas === cuotas)?.porcentaje ?? 0;
  const recargoInicial = (cuotas: number) => {
    const pct = porcentajePlan('CREDITO', cuotas);
    return pct > 0 ? String(pct).replace('.', ',') : '';
  };
  const ultimo = b.pagos.length - 1;
  const montosPrevios = b.pagos.slice(0, ultimo).map((p) => parseMonto(p.monto));
  const resto = redondear(subtotal - montosPrevios.reduce((s, m) => s + (m.ok ? m.value : 0), 0));
  const pagos = b.pagos.map((p, i) => {
    const m = i === ultimo ? resto : montosPrevios[i]!.ok ? montosPrevios[i]!.value : 0;
    const recargo = p.medio === 'CREDITO' ? leerRecargo(p.recargo) : null;
    const porcentaje = recargo ? (recargo.ok ? recargo.value : 0) : p.medio ? porcentajePlan(p.medio, p.cuotas) : 0;
    return { ...p, montoBase: m, recargoError: recargo && !recargo.ok ? recargo.error : null, porcentaje, ...aplicarPorcentaje(m, porcentaje) };
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
      const recargoError = pagos[i]!.recargoError;
      if (recargoError) errs[`recargo-${i}`] = recargoError;
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
      clienteId: b.cliente?.id ?? null,
      promos: promosAplicadas,
      nota: b.nota,
      items: b.items.map((it) => ({ varianteId: it.varianteId, cantidad: it.cantidad, precioUnitario: (parseMonto(it.precio) as { value: number }).value })),
      pagos: pagos.map((p) =>
        p.medio === 'CREDITO'
          ? { medio: p.medio, cuotas: p.cuotas, monto: p.montoBase, porcentaje: p.porcentaje }
          : { medio: p.medio as MedioPago, cuotas: 1, monto: p.montoBase },
      ),
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

      <BuscadorPrendas
        inputRef={buscador}
        autoFocus
        onElegir={agregar}
        reservadas={(id) => b.items.find((it) => it.varianteId === id)?.cantidad ?? 0}
      />

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
                  <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
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
                      sx={{ width: 150, flexShrink: 0 }}
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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              {!!vendedores.data?.length && (
                <TextField
                  select
                  label="Vendió"
                  value={vendedorId}
                  onChange={(e) => setVendedorId(e.target.value)}
                  error={!!errores.vendedor}
                  helperText={errores.vendedor}
                  sx={{ width: { sm: 220 } }}
                >
                  {vendedores.data.map((v) => (
                    <MenuItem key={v.id} value={String(v.id)}>
                      {v.nombre}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <Box sx={{ flex: 1 }}>
                <ClienteSelector value={b.cliente ?? null} onChange={(c) => setB((x) => ({ ...x, cliente: c }))} error={errores.clienteId} />
              </Box>
            </Stack>

            {(promosAplicadas.length > 0 || posibles.length > 0) && (
              <Stack spacing={1}>
                {conPromos.ok &&
                  conPromos.aplicaciones.map((a) => (
                    <Stack
                      key={a.promocionId}
                      direction="row"
                      sx={{ alignItems: 'center', gap: 1, border: 1, borderColor: 'success.main', borderRadius: 2, px: 1.5, py: 0.5 }}
                    >
                      <LocalOfferIcon color="success" fontSize="small" />
                      <Typography sx={{ flex: 1 }}>
                        {a.nombre}
                        {a.veces > 1 ? ` × ${a.veces}` : ''}
                      </Typography>
                      <Typography color="success.main" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        − {formatMonto(a.descuento)}
                      </Typography>
                      <IconButton size="small" aria-label={`Sacar ${a.nombre}`} onClick={() => aplicarPromo(a.promocionId, -1)}>
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                {posibles.map(({ promo, ahorro }) => (
                  <Alert
                    key={promo.id}
                    severity="info"
                    icon={<LocalOfferIcon />}
                    action={
                      <Button color="inherit" size="small" onClick={() => aplicarPromo(promo.id, 1)}>
                        Aplicar
                      </Button>
                    }
                  >
                    {promosAplicadas.some((a) => a.promocionId === promo.id) ? 'Entra otra vez: ' : 'Entra en la promo '}
                    <b>{promo.nombre}</b> (ahorra {formatMonto(ahorro)})
                  </Alert>
                ))}
              </Stack>
            )}

            <Stack direction="row" sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
              <Typography color="text.secondary">
                {unidades} {unidades === 1 ? 'prenda' : 'prendas'}
                {descuentoPromos > 0 && ` · ${formatMonto(productos)} − promos ${formatMonto(descuentoPromos)}`}
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
                  onChange={(_, m: MedioPago | null) => m && cambiarPago(i, { medio: m, cuotas: 1, recargo: m === 'CREDITO' ? recargoInicial(1) : undefined })}
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
                  {p.medio === 'CREDITO' && (
                    <>
                      <TextField
                        select
                        size="small"
                        label="Cuotas"
                        value={p.cuotas}
                        // Si el vendedor no escribió un recargo, se propone el del plan de esas cuotas (si hay uno configurado).
                        onChange={(e) => {
                          const cuotas = Number(e.target.value);
                          const tocado = (p.recargo ?? '') !== recargoInicial(p.cuotas);
                          cambiarPago(i, tocado ? { cuotas } : { cuotas, recargo: recargoInicial(cuotas) });
                        }}
                        sx={{ minWidth: 140 }}
                      >
                        {CUOTAS_CREDITO.map((n) => (
                          <MenuItem key={n} value={n}>
                            {n === 1 ? '1 pago' : `${n} cuotas`}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        size="small"
                        label="Recargo %"
                        placeholder="0"
                        value={p.recargo ?? ''}
                        onChange={(e) => cambiarPago(i, { recargo: e.target.value })}
                        error={!!errores[`recargo-${i}`]}
                        helperText={errores[`recargo-${i}`] ?? 'Vacío = sin recargo'}
                        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                        sx={{ maxWidth: { sm: 140 } }}
                      />
                    </>
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
                    {p.medio === 'CREDITO' && p.cuotas > 1 && ` (${p.cuotas} cuotas de ${formatMonto(redondear(p.cobrado / p.cuotas))})`}
                  </Typography>
                )}
                {p.medio === 'CREDITO' && !p.porcentaje && p.cuotas > 1 && p.montoBase > 0 && (
                  <Typography variant="body2" sx={{ mt: 1 }} color="text.secondary">
                    Sin recargo: {p.cuotas} cuotas de {formatMonto(redondear(p.cobrado / p.cuotas))}
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

      <Snackbar open={!!agregado} message={agregado} autoHideDuration={1500} onClose={() => setAgregado(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Stack>
  );
}
