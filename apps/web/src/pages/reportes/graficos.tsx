import type { ReactNode } from 'react';
import { Box, Stack, Tooltip, Typography, type SxProps, type Theme } from '@mui/material';

/**
 * Gráficos de los reportes, en HTML (sin librerías).
 * Una sola serie por gráfico, en un azul validado para daltonismo y contraste en modo claro
 * (#257de0 sobre blanco) y oscuro (#338ced sobre el fondo de las tarjetas).
 */
const colores: SxProps<Theme> = [
  { '--grafico': '#257de0', '--grafico-fondo': 'var(--mui-palette-background-paper)' },
  (t) => t.applyStyles('dark', { '--grafico': '#338ced' }),
];

/** Tope "redondo" para el eje: 1, 2, 2,5 o 5 × 10^n. */
function topeRedondo(n: number) {
  if (n <= 0) return 1;
  const pot = 10 ** Math.floor(Math.log10(n));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pot >= n) ?? 10) * pot;
}

export type PuntoColumna = {
  /** Etiqueta corta del eje ("12", "nov"). */
  etiqueta: string;
  valor: number;
  /** Lo que se ve al pasar el mouse o tocar la columna. */
  detalle: ReactNode;
};

/**
 * Columnas de una sola serie (ventas por día o por mes). Las negativas bajan de la base.
 * Cada columna muestra su detalle al pasar el mouse o tocarla; el detalle completo está en la tabla de abajo.
 */
export function GraficoColumnas({ puntos, formatoEje, alto = 180, titulo }: { puntos: PuntoColumna[]; formatoEje: (n: number) => string; alto?: number; titulo: string }) {
  const max = topeRedondo(Math.max(0, ...puntos.map((p) => p.valor)));
  const minimo = Math.min(0, ...puntos.map((p) => p.valor));
  const min = minimo < 0 ? -topeRedondo(-minimo) : 0;
  const rango = max - min || 1;
  const y = (v: number) => ((max - v) / rango) * alto;
  const ticks = min < 0 ? [max, 0, min] : [max, max / 2, 0];
  // Como mucho ~10 etiquetas en el eje de abajo.
  const cada = Math.max(1, Math.ceil(puntos.length / 10));

  return (
    <Box sx={[...(colores as object[]), { px: 2, pt: 2, pb: 1 }] as SxProps<Theme>} role="img" aria-label={titulo}>
      <Box sx={{ display: 'flex' }}>
        {/* Eje vertical */}
        <Box sx={{ position: 'relative', width: 64, height: alto, flexShrink: 0 }}>
          {ticks.map((t) => (
            <Typography
              key={t}
              variant="caption"
              color="text.secondary"
              sx={{ position: 'absolute', right: 8, top: y(t), transform: 'translateY(-50%)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatoEje(t)}
            </Typography>
          ))}
        </Box>
        {/* Área del gráfico */}
        <Box sx={{ position: 'relative', flex: 1, height: alto, minWidth: 0 }}>
          {ticks.map((t) => (
            <Box
              key={t}
              sx={{ position: 'absolute', left: 0, right: 0, top: y(t), borderTop: '1px solid', borderColor: t === 0 ? 'text.disabled' : 'divider' }}
            />
          ))}
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {puntos.map((p, i) => {
              const arriba = p.valor >= 0;
              const h = Math.abs(y(p.valor) - y(0));
              return (
                <Tooltip key={i} title={p.detalle} placement="top" arrow disableInteractive enterTouchDelay={0}>
                  <Box
                    tabIndex={0}
                    aria-label={typeof p.detalle === 'string' ? p.detalle : p.etiqueta}
                    sx={{
                      position: 'relative',
                      flex: 1,
                      minWidth: 0,
                      height: '100%',
                      cursor: 'default',
                      outline: 'none',
                      '&:hover > div, &:focus-visible > div': { filter: 'brightness(1.15)' },
                      '&:focus-visible': { bgcolor: 'action.hover' },
                    }}
                  >
                    {p.valor !== 0 && (
                      <Box
                        sx={{
                          position: 'absolute',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          // Columnas finas: como mucho 24 px, con aire entre una y otra.
                          width: 'min(24px, calc(100% - 2px))',
                          top: arriba ? y(p.valor) : y(0),
                          height: Math.max(1, h),
                          bgcolor: 'var(--grafico)',
                          borderRadius: arriba ? '4px 4px 0 0' : '0 0 4px 4px',
                        }}
                      />
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      </Box>
      {/* Eje horizontal */}
      <Box sx={{ display: 'flex', ml: '64px', mt: 0.5 }}>
        {puntos.map((p, i) => (
          <Typography
            key={i}
            variant="caption"
            color="text.secondary"
            sx={{ flex: 1, minWidth: 0, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible', visibility: i % cada === 0 ? 'visible' : 'hidden' }}
          >
            {p.etiqueta}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export type CeldaMapa = { fila: number; columna: number; valor: number; detalle: string };

/**
 * Mapa de calor (por ejemplo, días de la semana × horas). Un solo color, de claro (poco) a
 * intenso (mucho), mezclado con el fondo para que funcione en modo claro y oscuro.
 */
export function MapaCalor({
  filas,
  columnas,
  celdas,
  titulo,
}: {
  filas: string[];
  columnas: { valor: number; etiqueta: string }[];
  celdas: CeldaMapa[];
  titulo: string;
}) {
  const max = Math.max(1, ...celdas.map((c) => c.valor));
  const porClave = new Map(celdas.map((c) => [`${c.fila}-${c.columna}`, c]));
  const mezcla = (v: number) => (v <= 0 ? 4 : 18 + Math.round((v / max) * 82));
  const muestra = [0, 0.25, 0.5, 0.75, 1];

  return (
    <Box sx={[...(colores as object[]), { px: 2, py: 2 }] as SxProps<Theme>} role="img" aria-label={titulo}>
      <Box sx={{ overflowX: 'auto', pb: 1 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: `68px repeat(${columnas.length}, minmax(20px, 1fr))`, gap: '2px', minWidth: 68 + columnas.length * 22 }}>
          <Box />
          {columnas.map((c) => (
            <Typography key={c.valor} variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
              {c.etiqueta}
            </Typography>
          ))}
          {filas.map((f, fi) => (
            <Box key={f} sx={{ display: 'contents' }}>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', pr: 1 }}>
                {f}
              </Typography>
              {columnas.map((c) => {
                const celda = porClave.get(`${fi}-${c.valor}`);
                const v = celda?.valor ?? 0;
                return (
                  <Tooltip key={c.valor} title={celda?.detalle ?? `${f} ${c.etiqueta} h: sin ventas`} arrow disableInteractive enterTouchDelay={0}>
                    <Box
                      tabIndex={0}
                      aria-label={celda?.detalle ?? `${f} ${c.etiqueta} h: sin ventas`}
                      sx={{
                        height: 26,
                        borderRadius: '4px',
                        bgcolor: `color-mix(in oklab, var(--grafico) ${mezcla(v)}%, var(--grafico-fondo))`,
                        outline: 'none',
                        '&:hover, &:focus-visible': { boxShadow: (t) => `inset 0 0 0 2px ${t.vars?.palette.text.primary ?? '#000'}` },
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Menos
        </Typography>
        {muestra.map((m) => (
          <Box key={m} sx={{ width: 16, height: 12, borderRadius: '3px', bgcolor: `color-mix(in oklab, var(--grafico) ${mezcla(m * max)}%, var(--grafico-fondo))` }} />
        ))}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          Más
        </Typography>
      </Stack>
    </Box>
  );
}
