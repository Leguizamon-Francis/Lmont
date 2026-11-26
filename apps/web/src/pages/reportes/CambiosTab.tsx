import { useNavigate } from 'react-router';
import { Box, Stack, Typography } from '@mui/material';
import { formatMonto, MOTIVOS_CAMBIO, type ReporteCambios } from '@lmont/shared';
import { Fila } from '../../components/resumen';
import { Ayuda, Barra, BotonExcel, pct, prendas, Seccion, Tabla, Tarjeta, Tarjetas, Vacio } from './comunes';
import { Contenido, useReporte } from './ReportesPage';
import { textoPeriodo, type Periodo } from './periodo';

const nombreMotivo = (m: ReporteCambios['porMotivo'][number]['motivo']) => (m ? MOTIVOS_CAMBIO[m] : 'Sin motivo (cargados antes de pedirlo)');

export function CambiosTab({ periodo }: { periodo: Periodo }) {
  const q = useReporte<ReporteCambios>('cambios', periodo);
  return <Contenido q={q}>{(data) => <Cambios data={data} />}</Contenido>;
}

function Cambios({ data }: { data: ReporteCambios }) {
  const navigate = useNavigate();
  const total = data.cambios + data.devoluciones;
  const maxMotivo = Math.max(1, ...data.porMotivo.map((m) => m.cantidad));

  const hojas = () => [
    {
      nombre: 'Por motivo',
      columnas: [{ titulo: 'Motivo' }, { titulo: 'Cantidad', tipo: 'numero' as const }],
      filas: data.porMotivo.map((m) => [nombreMotivo(m.motivo), m.cantidad]),
    },
    {
      nombre: 'Por producto',
      columnas: [
        { titulo: 'Tipo' },
        { titulo: 'Producto' },
        { titulo: 'Vendidas', tipo: 'numero' as const },
        { titulo: 'Devueltas', tipo: 'numero' as const },
        { titulo: 'Tasa', tipo: 'porcentaje' as const },
      ],
      filas: data.porProducto.map((p) => [p.tipo, p.nombre, p.vendidas, p.devueltas, p.tasa]),
    },
    {
      nombre: 'Por talle',
      columnas: [{ titulo: 'Talle' }, { titulo: 'Vendidas', tipo: 'numero' as const }, { titulo: 'Devueltas', tipo: 'numero' as const }, { titulo: 'Tasa', tipo: 'porcentaje' as const }],
      filas: data.porTalle.map((t) => [t.nombre, t.vendidas, t.devueltas, t.tasa]),
    },
    {
      nombre: 'Cambios de talle',
      columnas: [{ titulo: 'Producto' }, { titulo: 'De' }, { titulo: 'A' }, { titulo: 'Veces', tipo: 'numero' as const }],
      filas: data.cambiosDeTalle.map((c) => [c.producto, c.de, c.a, c.veces]),
    },
  ];

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography color="text.secondary">Cambios y devoluciones {textoPeriodo(data)}</Typography>
        <BotonExcel archivo={`Cambios ${data.desde} a ${data.hasta}`} hojas={hojas} />
      </Stack>

      <Tarjetas>
        <Tarjeta titulo="Cambios" valor={String(data.cambios)}>
          <Typography variant="body2" color="text.secondary">
            Se llevó otra prenda
          </Typography>
        </Tarjeta>
        <Tarjeta titulo="Devoluciones" valor={String(data.devoluciones)}>
          <Typography variant="body2" color="text.secondary">
            Se le devolvió {formatMonto(data.devuelto)}
          </Typography>
        </Tarjeta>
        <Tarjeta titulo="Prendas que volvieron" valor={pct(data.tasa)}>
          <Typography variant="body2" color="text.secondary">
            {data.unidadesDevueltas} de {prendas(data.unidadesVendidas)} vendidas
          </Typography>
        </Tarjeta>
      </Tarjetas>

      {total === 0 ? (
        <Seccion titulo="Cambios y devoluciones">
          <Vacio>No hubo cambios ni devoluciones en este período.</Vacio>
        </Seccion>
      ) : (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Seccion titulo="Por motivo">
                <Stack spacing={1.25} sx={{ p: 2 }}>
                  {data.porMotivo.map((m) => (
                    <Box key={m.motivo ?? 'sin'}>
                      <Fila texto={nombreMotivo(m.motivo)} valor={String(m.cantidad)} />
                      <Barra valor={m.cantidad} max={maxMotivo} />
                    </Box>
                  ))}
                </Stack>
              </Seccion>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Seccion titulo="Cambios de talle">
                {data.cambiosDeTalle.length === 0 ? (
                  <Vacio>Nadie cambió una prenda por la misma en otro talle.</Vacio>
                ) : (
                  <>
                    <Ayuda>Si un modelo se cambia seguido a un talle más grande, probablemente calza chico (o al revés).</Ayuda>
                    <Stack spacing={0.75} sx={{ p: 2 }}>
                      {data.cambiosDeTalle.slice(0, 10).map((c) => (
                        <Fila key={`${c.productoId}-${c.de}-${c.a}`} texto={`${c.producto}: de ${c.de} a ${c.a}`} valor={`${c.veces} ${c.veces === 1 ? 'vez' : 'veces'}`} />
                      ))}
                      {data.cambiosDeTalle.length > 10 && (
                        <Typography variant="body2" color="text.secondary">
                          Y {data.cambiosDeTalle.length - 10} más (están todos en el Excel).
                        </Typography>
                      )}
                    </Stack>
                  </>
                )}
              </Seccion>
            </Box>
          </Stack>

          <Seccion titulo="Productos que más vuelven">
            <Ayuda>“Volvieron” sobre lo vendido en el mismo período: un porcentaje alto puede indicar un problema de calce, calidad o descripción.</Ayuda>
            <Tabla
              clave={(p) => p.productoId}
              filas={data.porProducto}
              onClick={(p) => navigate(`/productos/${p.productoId}`)}
              columnas={[
                { titulo: 'Producto', valor: (p) => `${p.tipo} ${p.nombre}` },
                { titulo: 'Vendidas', derecha: true, valor: (p) => p.vendidas },
                { titulo: 'Volvieron', derecha: true, valor: (p) => p.devueltas },
                { titulo: '%', derecha: true, valor: (p) => (p.vendidas ? pct(p.tasa) : '—') },
              ]}
            />
          </Seccion>

          <Seccion titulo="Por talle">
            <Tabla
              clave={(t) => t.nombre}
              filas={data.porTalle}
              columnas={[
                { titulo: 'Talle', valor: (t) => t.nombre },
                { titulo: 'Vendidas', derecha: true, valor: (t) => t.vendidas },
                { titulo: 'Volvieron', derecha: true, valor: (t) => t.devueltas },
                { titulo: '%', derecha: true, valor: (t) => (t.vendidas ? pct(t.tasa) : '—') },
              ]}
            />
          </Seccion>
        </>
      )}
    </>
  );
}
