import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  DIAS_REPORTE,
  formatFecha,
  formatMes,
  formatMonto,
  hoy,
  type ReporteMes,
  type ReporteMeses,
  type ReporteProductos,
} from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { moverMes } from '../../fechas';
import { Fila, Navegador } from '../../components/resumen';

const VISTAS = ['mes', 'meses', 'productos'] as const;

export function ReportesPage() {
  const [params, setParams] = useSearchParams();
  const vista = Math.max(0, VISTAS.indexOf(params.get('vista') as (typeof VISTAS)[number]));
  return (
    <Stack spacing={2} sx={{ maxWidth: 960 }}>
      <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
        Reportes
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={vista} variant="scrollable" onChange={(_, v: number) => setParams(v ? { vista: VISTAS[v]! } : {}, { replace: true })}>
          <Tab label="Ganancia del mes" />
          <Tab label="Mes a mes" />
          <Tab label="Productos" />
        </Tabs>
      </Box>
      {vista === 0 && <DelMes />}
      {vista === 1 && <MesAMes />}
      {vista === 2 && <Productos />}
    </Stack>
  );
}

// ---------------------------------------------------------------------------

function Barra({ valor, max, color = 'secondary.main' }: { valor: number; max: number; color?: string }) {
  return (
    <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', mt: 0.5 }}>
      <Box sx={{ height: '100%', width: `${Math.max(0, Math.min(1, valor / max)) * 100}%`, borderRadius: 3, bgcolor: color }} />
    </Box>
  );
}

function Seccion({ titulo, extra, children }: { titulo: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <Paper>
      <Stack direction="row" sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', justifyContent: 'space-between', gap: 2, alignItems: 'baseline' }}>
        <Typography sx={{ fontWeight: 600 }}>{titulo}</Typography>
        {extra}
      </Stack>
      {children}
    </Paper>
  );
}

const menos = (n: number) => (n ? `− ${formatMonto(n)}` : formatMonto(0));
const prendas = (n: number) => `${n} ${n === 1 ? 'prenda' : 'prendas'}`;
const ventas = (n: number) => `${n} ${n === 1 ? 'venta' : 'ventas'}`;

// ---------------------------------------------------------------------------
// Ganancia del mes
// ---------------------------------------------------------------------------

function DelMes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const actual = hoy().slice(0, 7);
  const mes = params.get('mes') ?? actual;
  const ir = (m: string) => setParams({ mes: m }, { replace: true });

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ['reportes', 'mes', mes],
    queryFn: () => api<ReporteMes>(`/reportes/mes?mes=${mes}`),
    placeholderData: keepPreviousData,
  });
  const r = data?.resultado;
  const maxGasto = Math.max(1, ...(data?.gastosPorConcepto.map((g) => g.total) ?? []));
  const maxDia = Math.max(1, ...(data?.dias.map((d) => d.ingresos) ?? []));

  return (
    <Stack spacing={2}>
      <Navegador anterior={() => ir(moverMes(mes, -1))} siguiente={mes >= actual ? undefined : () => ir(moverMes(mes, 1))}>
        <TextField
          type="month"
          size="small"
          label="Mes"
          value={mes}
          onChange={(e) => e.target.value && ir(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: actual } }}
          sx={{ maxWidth: 190 }}
        />
      </Navegador>

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}

      {data && r && (
        <Stack spacing={2} sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Paper sx={{ p: 2.5, flex: 1, alignSelf: 'flex-start', width: '100%' }}>
              <Typography color="text.secondary">Ganancia de {formatMes(mes)}</Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }} color={r.ganancia < 0 ? 'error' : undefined}>
                {formatMonto(r.ganancia)}
              </Typography>
              <Stack spacing={0.75}>
                <Fila texto={`Ventas (${ventas(r.cantidadVentas)}, ${prendas(r.unidades)})`} valor={formatMonto(r.ventasProductos)} />
                {r.descuentosMedios !== 0 && (
                  <Fila texto="Descuentos de medios de pago" valor={menos(-r.descuentosMedios)} color="error" />
                )}
                <Fila texto="Costo de lo vendido" valor={menos(r.costo)} color={r.costo ? 'error' : undefined} />
                <Divider sx={{ my: 0.5 }} />
                <Fila texto="Ganancia bruta" valor={formatMonto(r.gananciaBruta)} fuerte />
                <Fila texto="Gastos del local" valor={menos(r.gastos)} color={r.gastos ? 'error' : undefined} />
                <Divider sx={{ my: 0.5 }} />
                <Fila texto="Ganancia" valor={formatMonto(r.ganancia)} fuerte color={r.ganancia < 0 ? 'error' : undefined} />
                <Typography variant="caption" color="text.secondary">
                  Ventas menos devoluciones, menos lo que costó esa mercadería, menos los gastos cargados en la caja. Las compras de mercadería
                  no se restan como gasto: su costo se cuenta cuando la prenda se vende.
                  {data.gastosNoCuentan > 0 && ` No se restaron ${formatMonto(data.gastosNoCuentan)} de conceptos que no cuentan para la ganancia (como retiros).`}
                  {r.recargos > 0 &&
                    ` No se sumaron ${formatMonto(r.recargos)} de recargos de tarjeta de crédito: son el costo de la tarjeta, no ganancia.`}
                </Typography>
              </Stack>
            </Paper>

            <Stack spacing={2} sx={{ flex: 1 }}>
              <Paper sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Gastos por concepto</Typography>
                {data.gastosPorConcepto.length === 0 ? (
                  <Typography color="text.secondary">No hubo gastos.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {data.gastosPorConcepto.map((g) => (
                      <Box key={g.concepto}>
                        <Fila texto={g.concepto} valor={formatMonto(g.total)} />
                        <Barra valor={g.total} max={maxGasto} />
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>
              <Paper sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Promociones vendidas</Typography>
                {data.promociones.length === 0 ? (
                  <Typography color="text.secondary">No se vendieron promociones.</Typography>
                ) : (
                  <Stack spacing={1.25}>
                    {data.promociones.map((p) => (
                      <Box key={p.promocionId}>
                        <Fila texto={`${p.nombre} × ${p.veces}`} valor={formatMonto(p.precio)} />
                        <Typography variant="caption" color="text.secondary">
                          Se descontaron {formatMonto(p.descuento)}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Stack>
          </Stack>

          <Seccion titulo="Ventas día por día">
            {data.dias.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                No hubo ventas este mes.
              </Typography>
            ) : (
              <List disablePadding>
                {data.dias.map((d) => (
                  <ListItemButton key={d.fecha} divider onClick={() => navigate(`/ventas?tab=dia&fecha=${d.fecha}`)} sx={{ display: 'block' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                      <ListItemText
                        sx={{ my: 0 }}
                        primary={formatFecha(d.fecha)}
                        secondary={`${ventas(d.cantidadVentas)} · ${prendas(d.unidades)} · ganancia bruta ${formatMonto(d.gananciaBruta)}`}
                      />
                      <Typography sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMonto(d.ingresos)}</Typography>
                    </Stack>
                    <Barra valor={d.ingresos} max={maxDia} color="primary.main" />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Seccion>
        </Stack>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Mes a mes (últimos 12)
// ---------------------------------------------------------------------------

function MesAMes() {
  const [, setParams] = useSearchParams();
  const { data, isPending, error } = useQuery({
    queryKey: ['reportes', 'meses'],
    queryFn: () => api<ReporteMeses>('/reportes/meses'),
  });
  const meses = [...(data?.meses ?? [])].reverse();
  const max = Math.max(1, ...meses.map((m) => m.ingresos));
  const total = meses.reduce(
    (t, m) => ({ ingresos: t.ingresos + m.ingresos, ganancia: t.ganancia + m.ganancia, unidades: t.unidades + m.unidades }),
    { ingresos: 0, ganancia: 0, unidades: 0 },
  );

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {data && (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Paper sx={{ p: 2.5, flex: 1 }}>
              <Typography color="text.secondary">Ventas de los últimos 12 meses</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {formatMonto(total.ingresos)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {prendas(total.unidades)}
              </Typography>
            </Paper>
            <Paper sx={{ p: 2.5, flex: 1 }}>
              <Typography color="text.secondary">Ganancia de los últimos 12 meses</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }} color={total.ganancia < 0 ? 'error' : undefined}>
                {formatMonto(total.ganancia)}
              </Typography>
            </Paper>
          </Stack>
          <Seccion titulo="Mes por mes">
            <List disablePadding>
              {meses.map((m) => (
                <ListItemButton key={m.mes} divider onClick={() => setParams({ mes: m.mes })} sx={{ display: 'block' }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                    <ListItemText
                      sx={{ my: 0, '& .MuiListItemText-primary::first-letter': { textTransform: 'uppercase' } }}
                      primary={formatMes(m.mes)}
                      secondary={
                        m.cantidadVentas
                          ? `${ventas(m.cantidadVentas)} · ${prendas(m.unidades)} · costo ${formatMonto(m.costo)} · gastos ${formatMonto(m.gastos)}`
                          : 'Sin ventas'
                      }
                    />
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMonto(m.ingresos)}</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }} color={m.ganancia < 0 ? 'error' : 'success.main'}>
                        Ganancia {formatMonto(m.ganancia)}
                      </Typography>
                    </Box>
                  </Stack>
                  <Barra valor={m.ingresos} max={max} color="primary.main" />
                </ListItemButton>
              ))}
            </List>
          </Seccion>
          <Typography variant="body2" color="text.secondary">
            Tocá un mes para ver el detalle. El monto grande es lo que entró por ventas (menos devoluciones).
          </Typography>
        </>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Productos: lo más vendido y lo que no se vende
// ---------------------------------------------------------------------------

function Productos() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pedido = Number(params.get('dias'));
  const dias = (DIAS_REPORTE as readonly number[]).includes(pedido) ? pedido : 60;

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ['reportes', 'productos', dias],
    queryFn: () => api<ReporteProductos>(`/reportes/productos?dias=${dias}`),
    placeholderData: keepPreviousData,
  });
  const maxVendido = Math.max(1, ...(data?.masVendidos.map((p) => p.unidades) ?? []));
  const parada = data?.sinVentas.reduce((s, p) => s + p.valorStock, 0) ?? 0;

  return (
    <Stack spacing={2}>
      <TextField
        select
        size="small"
        label="Período"
        value={dias}
        onChange={(e) => setParams({ vista: 'productos', dias: e.target.value }, { replace: true })}
        sx={{ maxWidth: 240 }}
      >
        {DIAS_REPORTE.map((d) => (
          <MenuItem key={d} value={d}>
            {d === 365 ? 'Último año' : `Últimos ${d} días`}
          </MenuItem>
        ))}
      </TextField>

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}

      {data && (
        <Stack spacing={2} sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Seccion titulo="Lo más vendido" extra={<Typography variant="body2" color="text.secondary">desde el {formatFecha(data.desde)}</Typography>}>
            {data.masVendidos.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                No se vendió nada en este período.
              </Typography>
            ) : (
              <List disablePadding>
                {data.masVendidos.map((p, i) => (
                  <ListItemButton key={p.productoId} divider onClick={() => navigate(`/productos/${p.productoId}`)} sx={{ display: 'block' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                      <ListItemText
                        sx={{ my: 0 }}
                        primary={
                          <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Box component="span" sx={{ color: 'text.secondary', minWidth: 22 }}>
                              {i + 1}.
                            </Box>
                            {p.tipo} {p.producto}
                            {p.stock === 0 && <Chip label="Sin stock" size="small" color="error" variant="outlined" />}
                          </Box>
                        }
                        secondary={
                          <>
                            {p.variantes
                              .slice(0, 4)
                              .map((v) => `${v.color} ${v.talle} × ${v.unidades} (quedan ${v.stock})`)
                              .join(' · ')}
                            {p.variantes.length > 4 && ` · y ${p.variantes.length - 4} más`}
                            <br />
                            Quedan {p.stock} en total · ganancia {formatMonto(p.ganancia)}
                          </>
                        }
                      />
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{prendas(p.unidades)}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {formatMonto(p.importe)}
                        </Typography>
                      </Box>
                    </Stack>
                    <Barra valor={p.unidades} max={maxVendido} color="primary.main" />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Seccion>

          <Seccion
            titulo="Lo que no se vende"
            extra={
              data.sinVentas.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {formatMonto(parada)} parados
                </Typography>
              )
            }
          >
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
              Productos con stock que no se vendieron ni una vez desde el {formatFecha(data.desde)}. El monto es lo que costó la mercadería que
              queda (al precio de compra actual).
            </Typography>
            {data.sinVentas.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                Todo lo que tiene stock se vendió al menos una vez.
              </Typography>
            ) : (
              <List disablePadding>
                {data.sinVentas.map((p) => (
                  <ListItemButton key={p.productoId} divider onClick={() => navigate(`/productos/${p.productoId}`)}>
                    <ListItemText
                      primary={`${p.tipo} ${p.producto}`}
                      secondary={`${p.stock} en stock · ${p.ultimaVenta ? `última venta el ${formatFecha(p.ultimaVenta)}` : 'nunca se vendió'}`}
                    />
                    <Typography sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap' }}>{formatMonto(p.valorStock)}</Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </Seccion>
        </Stack>
      )}
    </Stack>
  );
}
