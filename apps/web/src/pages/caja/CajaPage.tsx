import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import {
  formatFecha,
  formatMes,
  formatMonto,
  hoy,
  MEDIOS_PAGO,
  type CajaDia,
  type CajaMes,
  type MovimientoCaja,
  type TipoCaja,
  type TotalesCaja,
} from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { moverDia, moverMes } from '../../fechas';
import { MovimientoCajaDialog } from './MovimientoCajaDialog';

export function CajaPage() {
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'mes' ? 1 : 0;
  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
        Caja
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={vista} onChange={(_, v: number) => setParams(v ? { vista: 'mes' } : {}, { replace: true })}>
          <Tab label="Del día" />
          <Tab label="Del mes" />
        </Tabs>
      </Box>
      {vista ? <CajaDelMes /> : <CajaDelDia />}
    </Stack>
  );
}

// ---------------------------------------------------------------------------

function Navegador(props: { anterior: () => void; siguiente?: () => void; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <IconButton aria-label="Anterior" onClick={props.anterior}>
        <ChevronLeftIcon />
      </IconButton>
      {props.children}
      <IconButton aria-label="Siguiente" disabled={!props.siguiente} onClick={props.siguiente}>
        <ChevronRightIcon />
      </IconButton>
    </Stack>
  );
}

function Fila({ texto, valor, fuerte, color }: { texto: ReactNode; valor: string; fuerte?: boolean; color?: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, alignItems: 'baseline' }}>
      <Typography color={fuerte ? undefined : 'text.secondary'} sx={{ fontWeight: fuerte ? 600 : undefined }}>
        {texto}
      </Typography>
      <Typography sx={{ fontWeight: fuerte ? 700 : 600, whiteSpace: 'nowrap' }} color={color}>
        {valor}
      </Typography>
    </Stack>
  );
}

/** Resumen: ventas + otros ingresos − gastos = saldo, y el efectivo. */
function Resumen({ t, titulo, cantidadVentas }: { t: TotalesCaja; titulo: string; cantidadVentas?: number }) {
  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography color="text.secondary">{titulo}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }} color={t.saldo < 0 ? 'error' : undefined}>
        {formatMonto(t.saldo)}
      </Typography>
      <Stack spacing={0.75}>
        <Fila texto={cantidadVentas === undefined ? 'Ventas' : `Ventas (${cantidadVentas})`} valor={formatMonto(t.ventas)} />
        <Fila texto="Otros ingresos" valor={formatMonto(t.otrosIngresos)} />
        <Fila texto="Gastos" valor={t.gastos ? `− ${formatMonto(t.gastos)}` : formatMonto(0)} color={t.gastos ? 'error' : undefined} />
        <Divider sx={{ my: 0.5 }} />
        <Fila texto="Movimiento en efectivo" valor={formatMonto(t.efectivo)} fuerte />
        <Typography variant="caption" color="text.secondary">
          Ventas en efectivo + ingresos en efectivo − gastos pagados en efectivo. No incluye lo que ya había en la caja antes.
        </Typography>
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------

function CajaDelDia() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fecha = params.get('fecha') ?? hoy();
  const esHoy = fecha >= hoy();
  const ir = (f: string) => setParams({ fecha: f }, { replace: true });
  const [cargando, setCargando] = useState<{ tipo: TipoCaja; movimiento?: MovimientoCaja } | null>(null);

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ['caja', 'dia', fecha],
    queryFn: () => api<CajaDia>(`/caja/dia?fecha=${fecha}`),
    placeholderData: keepPreviousData,
  });

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Navegador anterior={() => ir(moverDia(fecha, -1))} siguiente={esHoy ? undefined : () => ir(moverDia(fecha, 1))}>
          <TextField
            type="date"
            size="small"
            label="Día"
            value={fecha}
            onChange={(e) => e.target.value && ir(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: hoy() } }}
            sx={{ maxWidth: 190 }}
          />
        </Navegador>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCargando({ tipo: 'INGRESO' })}>
            Ingreso
          </Button>
          <Button variant="contained" startIcon={<RemoveIcon />} onClick={() => setCargando({ tipo: 'GASTO' })}>
            Gasto
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}

      {data && (
        <Stack spacing={2} sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Resumen t={data.totales} titulo={esHoy ? 'Saldo de hoy' : `Saldo del ${formatFecha(fecha)}`} cantidadVentas={data.ventas.cantidad} />
            </Box>
            <Paper sx={{ p: 2.5, flex: 1, alignSelf: 'flex-start', width: '100%' }}>
              <Typography sx={{ fontWeight: 600, mb: 1 }}>Ventas por medio de pago</Typography>
              {data.ventas.porMedio.length === 0 ? (
                <Typography color="text.secondary">No hubo ventas.</Typography>
              ) : (
                <Stack spacing={0.75}>
                  {data.ventas.porMedio.map((m) => (
                    <Fila key={m.medio} texto={MEDIOS_PAGO[m.medio]} valor={formatMonto(m.total)} />
                  ))}
                </Stack>
              )}
              <Button size="small" sx={{ ml: -1, mt: 1 }} onClick={() => navigate(`/ventas?tab=dia&fecha=${fecha}`)}>
                Ver las ventas
              </Button>
            </Paper>
          </Stack>

          <Paper>
            <Typography sx={{ px: 2, py: 1.5, fontWeight: 600, bgcolor: 'action.hover' }}>Ingresos y gastos</Typography>
            {data.movimientos.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                No se cargaron ingresos ni gastos este día. Las ventas ya están sumadas arriba.
              </Typography>
            ) : (
              <List disablePadding>
                {data.movimientos.map((m) => (
                  <ListItemButton
                    key={m.clave}
                    divider
                    onClick={() => (m.origen === 'MERCADERIA' ? navigate(`/stock/ingresos/${m.id}`) : setCargando({ tipo: m.tipo, movimiento: m }))}
                  >
                    <ListItemText
                      primary={
                        <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                          {m.concepto}
                          {m.origen === 'MERCADERIA' && <Chip label="Automático" size="small" variant="outlined" />}
                        </Box>
                      }
                      secondary={[m.detalle, MEDIOS_PAGO[m.medio], m.vendedor?.nombre].filter(Boolean).join(' · ')}
                    />
                    <Typography sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap' }} color={m.tipo === 'GASTO' ? 'error' : 'success.main'}>
                      {m.tipo === 'GASTO' ? '− ' : '+ '}
                      {formatMonto(m.monto)}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
          <Typography variant="body2" color="text.secondary">
            La mercadería que se marca como “pagada con la caja” al ingresarla aparece sola como gasto.
          </Typography>
        </Stack>
      )}

      {cargando && <MovimientoCajaDialog {...cargando} fecha={fecha} onClose={() => setCargando(null)} />}
    </Stack>
  );
}

// ---------------------------------------------------------------------------

function CajaDelMes() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const actual = hoy().slice(0, 7);
  const mes = params.get('mes') ?? actual;
  const ir = (m: string) => setParams({ vista: 'mes', mes: m }, { replace: true });

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: ['caja', 'mes', mes],
    queryFn: () => api<CajaMes>(`/caja/mes?mes=${mes}`),
    placeholderData: keepPreviousData,
  });
  const maxGasto = Math.max(1, ...(data?.gastosPorConcepto.map((g) => g.total) ?? []));

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

      {data && (
        <Stack spacing={2} sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Resumen t={data.totales} titulo={`Saldo de ${formatMes(mes)}`} />
            </Box>
            <Stack spacing={2} sx={{ flex: 1 }}>
              <Paper sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Ventas por medio de pago</Typography>
                {data.ventasPorMedio.length === 0 ? (
                  <Typography color="text.secondary">No hubo ventas.</Typography>
                ) : (
                  <Stack spacing={0.75}>
                    {data.ventasPorMedio.map((m) => (
                      <Fila key={m.medio} texto={MEDIOS_PAGO[m.medio]} valor={formatMonto(m.total)} />
                    ))}
                  </Stack>
                )}
              </Paper>
              <Paper sx={{ p: 2.5 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Gastos por concepto</Typography>
                {data.gastosPorConcepto.length === 0 ? (
                  <Typography color="text.secondary">No hubo gastos.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {data.gastosPorConcepto.map((g) => (
                      <Box key={g.concepto}>
                        <Fila texto={g.concepto} valor={formatMonto(g.total)} />
                        <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', mt: 0.5 }}>
                          <Box sx={{ height: '100%', width: `${(g.total / maxGasto) * 100}%`, borderRadius: 3, bgcolor: 'secondary.main' }} />
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Stack>
          </Stack>

          <Paper>
            <Typography sx={{ px: 2, py: 1.5, fontWeight: 600, bgcolor: 'action.hover' }}>Día por día</Typography>
            {data.dias.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                No hubo movimientos este mes.
              </Typography>
            ) : (
              <List disablePadding>
                {data.dias.map((d) => (
                  <ListItemButton key={d.fecha} divider onClick={() => navigate(`/caja?fecha=${d.fecha}`)}>
                    <ListItemText
                      primary={formatFecha(d.fecha)}
                      secondary={`Ventas ${formatMonto(d.ventas)}${d.otrosIngresos ? ` · ingresos ${formatMonto(d.otrosIngresos)}` : ''}${d.gastos ? ` · gastos ${formatMonto(d.gastos)}` : ''}`}
                    />
                    <Typography sx={{ fontWeight: 600, ml: 2, whiteSpace: 'nowrap' }} color={d.saldo < 0 ? 'error' : undefined}>
                      {formatMonto(d.saldo)}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </Paper>
          <Typography variant="body2" color="text.secondary">
            El saldo de caja es lo que entró menos lo que salió. No es la ganancia: para eso también hay que restar el costo de lo vendido
            (va a estar en Reportes).
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
