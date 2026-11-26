import { Stack, Typography } from '@mui/material';
import { formatMes, formatMonto, hoy, type ReporteMeses } from '@lmont/shared';
import { moverDia, moverMes } from '../../fechas';
import { BotonExcel, Delta, montoCompacto, prendas, Seccion, Tabla, Tarjeta, Tarjetas, ventas } from './comunes';
import { GraficoColumnas } from './graficos';
import { Contenido, useReporte } from './ReportesPage';
import type { Periodo } from './periodo';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Los últimos 12 meses, cada uno comparado con el mismo mes del año anterior. */
export function MesAMesTab({ onElegirMes }: { onElegirMes: (p: Periodo) => void }) {
  const actual = hoy().slice(0, 7);
  const q = useReporte<ReporteMeses>('meses', null);
  const antes = useReporte<ReporteMeses>('meses', null, `&hasta=${moverMes(actual, -12)}`);

  return (
    <Contenido q={q}>
      {(data) => {
        const anioAntes = new Map((antes.data?.meses ?? []).map((m) => [moverMes(m.mes, 12), m]));
        const total = (ms: ReporteMeses['meses']) =>
          ms.reduce((t, m) => ({ ingresos: t.ingresos + m.ingresos, ganancia: t.ganancia + m.ganancia, unidades: t.unidades + m.unidades }), {
            ingresos: 0,
            ganancia: 0,
            unidades: 0,
          });
        const t = total(data.meses);
        const tAntes = total(antes.data?.meses ?? []);
        const filas = [...data.meses].reverse();
        const hojas = () => [
          {
            nombre: 'Mes a mes',
            columnas: [
              { titulo: 'Mes' },
              { titulo: 'Ventas', tipo: 'numero' as const },
              { titulo: 'Prendas', tipo: 'numero' as const },
              { titulo: 'Ingresos', tipo: 'moneda' as const },
              { titulo: 'Costo', tipo: 'moneda' as const },
              { titulo: 'Ganancia bruta', tipo: 'moneda' as const },
              { titulo: 'Gastos', tipo: 'moneda' as const },
              { titulo: 'Ganancia', tipo: 'moneda' as const },
              { titulo: 'Ticket promedio', tipo: 'moneda' as const },
              { titulo: 'Ingresos un año antes', tipo: 'moneda' as const },
            ],
            filas: data.meses.map((m) => [
              capital(formatMes(m.mes)),
              m.cantidadVentas,
              m.unidades,
              m.ingresos,
              m.costo,
              m.gananciaBruta,
              m.gastos,
              m.ganancia,
              m.ticketPromedio,
              anioAntes.get(m.mes)?.ingresos ?? null,
            ]),
          },
        ];

        return (
          <>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Typography color="text.secondary">Últimos 12 meses</Typography>
              <BotonExcel archivo={`Mes a mes hasta ${actual}`} hojas={hojas} />
            </Stack>
            <Tarjetas>
              <Tarjeta titulo="Ingresos de los últimos 12 meses" valor={formatMonto(t.ingresos)}>
                <Delta actual={t.ingresos} anterior={tAntes.ingresos} contra="vs. los 12 anteriores" />
              </Tarjeta>
              <Tarjeta titulo="Ganancia de los últimos 12 meses" valor={formatMonto(t.ganancia)} color={t.ganancia < 0 ? 'error' : undefined}>
                <Delta actual={t.ganancia} anterior={tAntes.ganancia} contra="vs. los 12 anteriores" />
              </Tarjeta>
              <Tarjeta titulo="Prendas vendidas" valor={String(t.unidades)}>
                <Delta actual={t.unidades} anterior={tAntes.unidades} contra="vs. los 12 anteriores" />
              </Tarjeta>
            </Tarjetas>

            <Seccion titulo="Ingresos por mes">
              <GraficoColumnas
                titulo="Ingresos por mes, últimos 12 meses"
                formatoEje={montoCompacto}
                puntos={data.meses.map((m) => ({
                  etiqueta: formatMes(m.mes).slice(0, 3),
                  valor: m.ingresos,
                  detalle: `${capital(formatMes(m.mes))}: ${formatMonto(m.ingresos)} · ganancia ${formatMonto(m.ganancia)}`,
                }))}
              />
            </Seccion>

            <Seccion titulo="Mes por mes">
              <Tabla
                clave={(m) => m.mes}
                filas={filas}
                onClick={(m) => onElegirMes({ desde: `${m.mes}-01`, hasta: m.mes === actual ? hoy() : moverDia(`${moverMes(m.mes, 1)}-01`, -1) })}
                columnas={[
                  { titulo: 'Mes', valor: (m) => capital(formatMes(m.mes)) },
                  { titulo: 'Ventas', derecha: true, secundaria: true, valor: (m) => (m.cantidadVentas ? `${ventas(m.cantidadVentas)} · ${prendas(m.unidades)}` : '—') },
                  { titulo: 'Ingresos', derecha: true, valor: (m) => formatMonto(m.ingresos) },
                  {
                    titulo: 'vs. un año antes',
                    derecha: true,
                    secundaria: true,
                    valor: (m) => {
                      const a = anioAntes.get(m.mes);
                      return a ? <Delta actual={m.ingresos} anterior={a.ingresos} contra="" /> : '—';
                    },
                  },
                  { titulo: 'Ganancia', derecha: true, valor: (m) => <Typography component="span" variant="body2" color={m.ganancia < 0 ? 'error' : undefined}>{formatMonto(m.ganancia)}</Typography> },
                ]}
              />
            </Seccion>
            <Typography variant="body2" color="text.secondary">
              Tocá un mes para ver su resumen.
            </Typography>
          </>
        );
      }}
    </Contenido>
  );
}
