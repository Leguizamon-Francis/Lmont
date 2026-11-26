import { Box, Stack, Typography } from '@mui/material';
import { DIAS_SEMANA, formatMonto, MEDIOS_PAGO, type ReporteVentas } from '@lmont/shared';
import { Fila } from '../../components/resumen';
import { Ayuda, Barra, BotonExcel, decimal, Delta, pct, Seccion, Tabla, Tarjeta, Tarjetas, Vacio, ventas } from './comunes';
import { MapaCalor } from './graficos';
import { Contenido, useReporte } from './ReportesPage';
import { textoPeriodo, type Periodo } from './periodo';

const nombreMedio = (m: ReporteVentas['porMedio'][number]) => (m.medio === 'CREDITO' ? `Crédito en ${m.cuotas} ${m.cuotas === 1 ? 'pago' : 'cuotas'}` : MEDIOS_PAGO[m.medio]);

export function VentasTab({ periodo }: { periodo: Periodo }) {
  const q = useReporte<ReporteVentas>('ventas', periodo);
  return <Contenido q={q}>{(data) => <Ventas data={data} />}</Contenido>;
}

function Ventas({ data }: { data: ReporteVentas }) {
  const t = data.ticket;
  const totalMedios = data.porMedio.reduce((s, m) => s + m.cobrado, 0);
  const maxVendedor = Math.max(1, ...data.porVendedor.map((v) => v.importe));

  // Días y horas: solo el rango de horas en que hubo ventas (al menos de 9 a 20).
  const horas = data.calor.map((c) => c.hora);
  const desde = Math.min(9, ...horas);
  const hasta = Math.max(20, ...horas);
  const columnas = Array.from({ length: hasta - desde + 1 }, (_, i) => ({ valor: desde + i, etiqueta: String(desde + i) }));
  const porDia = DIAS_SEMANA.map((d, i) => {
    const celdas = data.calor.filter((c) => c.dia === i);
    return { dia: d, ventas: celdas.reduce((s, c) => s + c.ventas, 0), importe: celdas.reduce((s, c) => s + c.importe, 0) };
  });
  const maxDia = Math.max(1, ...porDia.map((d) => d.importe));
  const mejores = [...data.calor].sort((a, b) => b.ventas - a.ventas || b.importe - a.importe).slice(0, 5);
  const maxDistribucion = Math.max(1, ...t.distribucion.map((d) => d.ventas));

  const hojas = () => [
    {
      nombre: 'Por vendedor',
      columnas: [
        { titulo: 'Vendedor' },
        { titulo: 'Ventas', tipo: 'numero' as const },
        { titulo: 'Prendas', tipo: 'numero' as const },
        { titulo: 'Importe', tipo: 'moneda' as const },
        { titulo: 'Importe período anterior', tipo: 'moneda' as const },
        { titulo: 'Ticket promedio', tipo: 'moneda' as const },
        { titulo: 'Ganancia', tipo: 'moneda' as const },
        { titulo: 'Prendas devueltas', tipo: 'numero' as const },
      ],
      filas: data.porVendedor.map((v) => [v.nombre, v.ventas, v.unidades, v.importe, v.importeAnterior, v.ticketPromedio, v.ganancia, v.devueltas]),
    },
    {
      nombre: 'Medios de pago',
      columnas: [{ titulo: 'Medio' }, { titulo: 'Pagos', tipo: 'numero' as const }, { titulo: 'Cobrado', tipo: 'moneda' as const }, { titulo: 'Recargo o descuento', tipo: 'moneda' as const }],
      filas: data.porMedio.map((m) => [nombreMedio(m), m.pagos, m.cobrado, m.ajuste]),
    },
    {
      nombre: 'Días y horarios',
      columnas: [{ titulo: 'Día' }, { titulo: 'Hora', tipo: 'numero' as const }, { titulo: 'Ventas', tipo: 'numero' as const }, { titulo: 'Importe', tipo: 'moneda' as const }],
      filas: data.calor.map((c) => [DIAS_SEMANA[c.dia], c.hora, c.ventas, c.importe]),
    },
    {
      nombre: 'Prendas por venta',
      columnas: [{ titulo: 'Prendas' }, { titulo: 'Ventas', tipo: 'numero' as const }],
      filas: t.distribucion.map((d) => [d.prendas, d.ventas]),
    },
  ];

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography color="text.secondary">Ventas {textoPeriodo(data)}</Typography>
        <BotonExcel archivo={`Ventas ${data.desde} a ${data.hasta}`} hojas={hojas} />
      </Stack>

      <Tarjetas>
        <Tarjeta titulo="Ventas" valor={String(t.ventas)}>
          <Delta actual={t.ventas} anterior={t.anterior.ventas} contra="vs. período anterior" />
        </Tarjeta>
        <Tarjeta titulo="Ticket promedio" valor={formatMonto(t.promedio)}>
          <Delta actual={t.promedio} anterior={t.anterior.promedio} contra="vs. período anterior" />
        </Tarjeta>
        <Tarjeta titulo="Prendas por venta" valor={decimal(t.prendasPorVenta)}>
          <Delta actual={t.prendasPorVenta} anterior={t.anterior.prendasPorVenta} contra="vs. período anterior" />
        </Tarjeta>
      </Tarjetas>

      <Seccion titulo="Por vendedor">
        {data.porVendedor.length === 0 ? (
          <Vacio>No hubo ventas en este período.</Vacio>
        ) : (
          <>
            <Ayuda>
              Importe: lo vendido, sin descontar devoluciones. La ganancia descuenta lo que se devolvió de sus ventas y los descuentos por medio de pago, como en el Resumen. Las ventas sin vendedor elegido aparecen como “Sin vendedor”.
            </Ayuda>
            <Tabla
              clave={(v) => v.vendedorId ?? 0}
              filas={data.porVendedor}
              columnas={[
                {
                  titulo: 'Vendedor',
                  valor: (v) => (
                    <Box sx={{ minWidth: 120 }}>
                      {v.nombre}
                      <Barra valor={v.importe} max={maxVendedor} />
                    </Box>
                  ),
                },
                { titulo: 'Ventas', derecha: true, valor: (v) => v.ventas },
                { titulo: 'Prendas', derecha: true, secundaria: true, valor: (v) => v.unidades },
                { titulo: 'Importe', derecha: true, valor: (v) => <b>{formatMonto(v.importe)}</b> },
                { titulo: 'vs. anterior', derecha: true, secundaria: true, valor: (v) => <Delta actual={v.importe} anterior={v.importeAnterior} contra="" /> },
                { titulo: 'Ticket', derecha: true, secundaria: true, valor: (v) => formatMonto(v.ticketPromedio) },
                { titulo: 'Ganancia', derecha: true, valor: (v) => formatMonto(v.ganancia) },
                { titulo: 'Devueltas', derecha: true, secundaria: true, valor: (v) => v.devueltas || '—' },
              ]}
            />
          </>
        )}
      </Seccion>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Box sx={{ flex: 1 }}>
          <Seccion titulo="Medios de pago">
            {data.porMedio.length === 0 ? (
              <Vacio>No hubo cobros.</Vacio>
            ) : (
              <Stack spacing={1.25} sx={{ p: 2 }}>
                {data.porMedio.map((m) => (
                  <Box key={`${m.medio}-${m.cuotas}`}>
                    <Fila texto={`${nombreMedio(m)} · ${m.pagos} ${m.pagos === 1 ? 'pago' : 'pagos'}`} valor={formatMonto(m.cobrado)} />
                    <Barra valor={m.cobrado} max={totalMedios} />
                    <Typography variant="caption" color="text.secondary">
                      {pct(Math.round((m.cobrado / (totalMedios || 1)) * 1000) / 10)} del total
                      {m.ajuste > 0 && ` · recargo ${formatMonto(m.ajuste)}`}
                      {m.ajuste < 0 && ` · descuento ${formatMonto(-m.ajuste)}`}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Seccion>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Seccion titulo="Prendas por venta">
            <Stack spacing={1.25} sx={{ p: 2 }}>
              {t.distribucion.map((d) => (
                <Box key={d.prendas}>
                  <Fila texto={`${d.prendas} ${d.prendas === '1' ? 'prenda' : 'prendas'}`} valor={ventas(d.ventas)} />
                  <Barra valor={d.ventas} max={maxDistribucion} />
                </Box>
              ))}
              <Typography variant="caption" color="text.secondary">
                Si casi todas las ventas son de una prenda, una promo “llevá 2” puede subir el ticket.
              </Typography>
            </Stack>
          </Seccion>
        </Box>
      </Stack>

      <Seccion titulo="Días y horarios">
        {data.calor.length === 0 ? (
          <Vacio>No hubo ventas en este período.</Vacio>
        ) : (
          <>
            <Ayuda>Cantidad de ventas según el día de la semana y la hora. Más intenso = más ventas. Pasá el mouse o tocá un cuadro para ver el detalle.</Ayuda>
            <MapaCalor
              titulo="Ventas por día de la semana y hora"
              filas={[...DIAS_SEMANA]}
              columnas={columnas}
              celdas={data.calor.map((c) => ({
                fila: c.dia,
                columna: c.hora,
                valor: c.ventas,
                detalle: `${DIAS_SEMANA[c.dia]} de ${c.hora} a ${c.hora + 1} h: ${ventas(c.ventas)} · ${formatMonto(c.importe)}`,
              }))}
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ px: 2, pb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Por día de la semana</Typography>
                <Stack spacing={1}>
                  {porDia.map((d) => (
                    <Box key={d.dia}>
                      <Fila texto={`${d.dia} · ${ventas(d.ventas)}`} valor={formatMonto(d.importe)} />
                      <Barra valor={d.importe} max={maxDia} />
                    </Box>
                  ))}
                </Stack>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>Mejores horarios</Typography>
                <Stack spacing={0.75}>
                  {mejores.map((c) => (
                    <Fila key={`${c.dia}-${c.hora}`} texto={`${DIAS_SEMANA[c.dia]} de ${c.hora} a ${c.hora + 1} h`} valor={`${ventas(c.ventas)} · ${formatMonto(c.importe)}`} />
                  ))}
                </Stack>
              </Box>
            </Stack>
          </>
        )}
      </Seccion>
    </>
  );
}
