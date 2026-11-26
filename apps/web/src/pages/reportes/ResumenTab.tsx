import { useNavigate } from 'react-router';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';
import { DIAS_SEMANA, formatFecha, formatMes, formatMonto, type ReporteResumen, type ResultadoPeriodo } from '@lmont/shared';
import { Fila } from '../../components/resumen';
import { Ayuda, Barra, BotonExcel, decimal, Delta, menos, montoCompacto, prendas, Seccion, Tabla, Tarjeta, Tarjetas, Vacio, ventas } from './comunes';
import { GraficoColumnas } from './graficos';
import type { TipoColumna } from '../../excel';
import { Contenido, useReporte } from './ReportesPage';
import { textoPeriodo, type Periodo } from './periodo';

const mesCorto = (mes: string) => formatMes(mes).slice(0, 3);
const diaSemana = (fecha: string) => DIAS_SEMANA[(new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7]!;

/** Renglones de la comparación (y de la hoja de Excel). */
const COMPARAR: { texto: string; valor: (r: ResultadoPeriodo) => number; formato: (n: number) => string; excel: TipoColumna }[] = [
  { texto: 'Ventas', valor: (r) => r.cantidadVentas, formato: String, excel: 'numero' },
  { texto: 'Prendas vendidas', valor: (r) => r.unidades, formato: String, excel: 'numero' },
  { texto: 'Ingresos por ventas', valor: (r) => r.ingresos, formato: formatMonto, excel: 'moneda' },
  { texto: 'Costo de lo vendido', valor: (r) => r.costo, formato: formatMonto, excel: 'moneda' },
  { texto: 'Ganancia bruta', valor: (r) => r.gananciaBruta, formato: formatMonto, excel: 'moneda' },
  { texto: 'Gastos del local', valor: (r) => r.gastos, formato: formatMonto, excel: 'moneda' },
  { texto: 'Ganancia', valor: (r) => r.ganancia, formato: formatMonto, excel: 'moneda' },
  { texto: 'Ticket promedio', valor: (r) => r.ticketPromedio, formato: formatMonto, excel: 'moneda' },
  { texto: 'Prendas por venta', valor: (r) => r.prendasPorVenta, formato: decimal, excel: 'decimal' },
  { texto: 'Recargos de tarjeta (no son ganancia)', valor: (r) => r.recargos, formato: formatMonto, excel: 'moneda' },
];

export function ResumenTab({ periodo }: { periodo: Periodo }) {
  const q = useReporte<ReporteResumen>('resumen', periodo);
  return <Contenido q={q}>{(data) => <Resumen data={data} />}</Contenido>;
}

function Resumen({ data }: { data: ReporteResumen }) {
  const navigate = useNavigate();
  const r = data.resultado;
  const ant = data.anterior.resultado;
  const anio = data.anioAnterior.resultado;
  const porMes = data.agrupacion === 'mes';
  const maxGasto = Math.max(1, ...data.gastosPorConcepto.map((g) => g.total));
  const conVentas = data.serie.filter((p) => p.cantidadVentas || p.ingresos);
  const nombrePunto = (f: string) => (porMes ? formatMes(f) : `${diaSemana(f)} ${formatFecha(f)}`);

  const hojas = () => [
    {
      nombre: 'Resumen',
      columnas: [
        { titulo: 'Concepto' },
        { titulo: `Período (${textoPeriodo(data)})` },
        { titulo: `Anterior (${textoPeriodo(data.anterior)})` },
        { titulo: `Año pasado (${textoPeriodo(data.anioAnterior)})` },
      ],
      filas: COMPARAR.map((c) => [c.texto, ...[r, ant, anio].map((x) => ({ valor: c.valor(x), tipo: c.excel }))]),
    },
    {
      nombre: porMes ? 'Por mes' : 'Por día',
      columnas: [{ titulo: porMes ? 'Mes' : 'Fecha' }, { titulo: 'Ventas', tipo: 'numero' as const }, { titulo: 'Prendas', tipo: 'numero' as const }, { titulo: 'Ingresos', tipo: 'moneda' as const }, { titulo: 'Ganancia bruta', tipo: 'moneda' as const }],
      filas: data.serie.map((p) => [porMes ? formatMes(p.fecha) : formatFecha(p.fecha), p.cantidadVentas, p.unidades, p.ingresos, p.gananciaBruta]),
    },
    {
      nombre: 'Gastos',
      columnas: [{ titulo: 'Concepto' }, { titulo: 'Total', tipo: 'moneda' as const }],
      filas: data.gastosPorConcepto.map((g) => [g.concepto, g.total]),
    },
    {
      nombre: 'Promociones',
      columnas: [{ titulo: 'Promoción' }, { titulo: 'Veces', tipo: 'numero' as const }, { titulo: 'Cobrado', tipo: 'moneda' as const }, { titulo: 'Descontado', tipo: 'moneda' as const }],
      filas: data.promociones.map((p) => [p.nombre, p.veces, p.precio, p.descuento]),
    },
  ];

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography color="text.secondary">Resultado {textoPeriodo(data)}</Typography>
        <BotonExcel archivo={`Resumen ${data.desde} a ${data.hasta}`} hojas={hojas} />
      </Stack>

      <Tarjetas>
        <Tarjeta titulo="Ingresos por ventas" valor={formatMonto(r.ingresos)}>
          <Delta actual={r.ingresos} anterior={ant.ingresos} contra="vs. período anterior" />
          <Delta actual={r.ingresos} anterior={anio.ingresos} contra="vs. año pasado" />
        </Tarjeta>
        <Tarjeta titulo="Ganancia" valor={formatMonto(r.ganancia)} color={r.ganancia < 0 ? 'error' : undefined}>
          <Delta actual={r.ganancia} anterior={ant.ganancia} contra="vs. período anterior" />
          <Delta actual={r.ganancia} anterior={anio.ganancia} contra="vs. año pasado" />
        </Tarjeta>
        <Tarjeta titulo="Prendas vendidas" valor={String(r.unidades)}>
          <Delta actual={r.unidades} anterior={ant.unidades} contra="vs. período anterior" />
          <Delta actual={r.unidades} anterior={anio.unidades} contra="vs. año pasado" />
        </Tarjeta>
        <Tarjeta titulo="Ticket promedio" valor={formatMonto(r.ticketPromedio)}>
          <Typography variant="body2" color="text.secondary">
            {decimal(r.prendasPorVenta)} {r.prendasPorVenta === 1 ? 'prenda' : 'prendas'} por venta
          </Typography>
          <Delta actual={r.ticketPromedio} anterior={ant.ticketPromedio} contra="vs. período anterior" />
        </Tarjeta>
      </Tarjetas>

      <Seccion titulo={porMes ? 'Ingresos por mes' : 'Ingresos por día'}>
        {conVentas.length === 0 ? (
          <Vacio>No hubo ventas en este período.</Vacio>
        ) : (
          <GraficoColumnas
            titulo={porMes ? 'Ingresos por mes' : 'Ingresos por día'}
            formatoEje={montoCompacto}
            puntos={data.serie.map((p) => ({
              etiqueta: porMes ? mesCorto(p.fecha) : String(Number(p.fecha.slice(8))),
              valor: p.ingresos,
              detalle: `${nombrePunto(p.fecha)}: ${formatMonto(p.ingresos)} · ${ventas(p.cantidadVentas)} · ${prendas(p.unidades)}`,
            }))}
          />
        )}
      </Seccion>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper sx={{ p: 2.5, flex: 1, alignSelf: 'flex-start', width: '100%' }}>
          <Typography sx={{ fontWeight: 600, mb: 1.5 }}>De dónde sale la ganancia</Typography>
          <Stack spacing={0.75}>
            <Fila texto={`Ventas (${ventas(r.cantidadVentas)}, ${prendas(r.unidades)})`} valor={formatMonto(r.ventasProductos)} />
            {r.descuentosMedios !== 0 && <Fila texto="Descuentos de medios de pago" valor={menos(-r.descuentosMedios)} color="error" />}
            <Fila texto="Costo de lo vendido" valor={menos(r.costo)} color={r.costo ? 'error' : undefined} />
            <Divider sx={{ my: 0.5 }} />
            <Fila texto="Ganancia bruta" valor={formatMonto(r.gananciaBruta)} fuerte />
            <Fila texto="Gastos del local" valor={menos(r.gastos)} color={r.gastos ? 'error' : undefined} />
            <Divider sx={{ my: 0.5 }} />
            <Fila texto="Ganancia" valor={formatMonto(r.ganancia)} fuerte color={r.ganancia < 0 ? 'error' : undefined} />
            <Typography variant="caption" color="text.secondary">
              Ventas menos devoluciones, menos lo que costó esa mercadería, menos los gastos cargados en la caja. Las compras de mercadería no
              se restan como gasto: su costo se cuenta cuando la prenda se vende.
              {data.gastosNoCuentan > 0 && ` No se restaron ${formatMonto(data.gastosNoCuentan)} de conceptos que no cuentan para la ganancia (como retiros).`}
              {r.recargos > 0 && ` No se sumaron ${formatMonto(r.recargos)} de recargos de tarjeta de crédito: son el costo de la tarjeta, no ganancia.`}
            </Typography>
          </Stack>
        </Paper>

        <Stack spacing={2} sx={{ flex: 1, width: '100%' }}>
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

      <Seccion titulo="Comparación con otros períodos">
        <Ayuda>
          Período anterior: {textoPeriodo(data.anterior)} (la misma cantidad de días, justo antes). Año pasado: {textoPeriodo(data.anioAnterior)}.
        </Ayuda>
        <Tabla
          clave={(c) => c.texto}
          filas={COMPARAR}
          columnas={[
            { titulo: '', valor: (c) => c.texto },
            { titulo: 'Este período', derecha: true, valor: (c) => <b>{c.formato(c.valor(r))}</b> },
            { titulo: 'Anterior', derecha: true, valor: (c) => c.formato(c.valor(ant)) },
            { titulo: 'Año pasado', derecha: true, secundaria: true, valor: (c) => c.formato(c.valor(anio)) },
          ]}
        />
      </Seccion>

      <Seccion titulo={porMes ? 'Mes por mes' : 'Día por día'}>
        {conVentas.length === 0 ? (
          <Vacio>No hubo ventas en este período.</Vacio>
        ) : (
          <Tabla
            clave={(p) => p.fecha}
            filas={[...conVentas].reverse()}
            onClick={porMes ? undefined : (p) => navigate(`/ventas?tab=dia&fecha=${p.fecha}`)}
            columnas={[
              { titulo: porMes ? 'Mes' : 'Día', valor: (p) => nombrePunto(p.fecha) },
              { titulo: 'Ventas', derecha: true, valor: (p) => p.cantidadVentas },
              { titulo: 'Prendas', derecha: true, secundaria: true, valor: (p) => p.unidades },
              { titulo: 'Ingresos', derecha: true, valor: (p) => formatMonto(p.ingresos) },
              { titulo: 'Ganancia bruta', derecha: true, secundaria: true, valor: (p) => formatMonto(p.gananciaBruta) },
            ]}
          />
        )}
      </Seccion>
    </>
  );
}
