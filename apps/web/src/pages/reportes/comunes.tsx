import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import { formatMonto } from '@lmont/shared';
import { descargarExcel, type Hoja } from '../../excel';

export const menos = (n: number) => (n ? `− ${formatMonto(n)}` : formatMonto(0));
export const prendas = (n: number) => `${n} ${n === 1 ? 'prenda' : 'prendas'}`;
export const ventas = (n: number) => `${n} ${n === 1 ? 'venta' : 'ventas'}`;
export const vendidas = (n: number) => `${n} ${n === 1 ? 'vendida' : 'vendidas'}`;
export const pct = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;
export const decimal = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/** "$ 1,2 M", "$ 350 mil": para ejes y tarjetas chicas. */
export function montoCompacto(n: number) {
  const a = Math.abs(n);
  const signo = n < 0 ? '−' : '';
  if (a >= 1_000_000) return `${signo}$ ${(a / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (a >= 10_000) return `${signo}$ ${Math.round(a / 1000).toLocaleString('es-AR')} mil`;
  return `${signo}${formatMonto(a)}`;
}

/** Barra fina para listas (lo que representa cada renglón sobre el máximo), en el azul de los gráficos. */
export function Barra({ valor, max }: { valor: number; max: number }) {
  return (
    <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', mt: 0.5 }}>
      <Box
        sx={[
          { height: '100%', width: `${Math.max(0, Math.min(1, valor / (max || 1))) * 100}%`, borderRadius: 3, bgcolor: '#257de0' },
          (t) => t.applyStyles('dark', { bgcolor: '#338ced' }),
        ]}
      />
    </Box>
  );
}

export function Seccion({ titulo, extra, children }: { titulo: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Stack direction="row" sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', justifyContent: 'space-between', gap: 2, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 600 }}>{titulo}</Typography>
        {extra}
      </Stack>
      {children}
    </Paper>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <Typography color="text.secondary" sx={{ p: 2 }}>
      {children}
    </Typography>
  );
}

export function Ayuda({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.5 }}>
      {children}
    </Typography>
  );
}

/**
 * Variación contra otro período: "↑ 15 %" en verde o "↓ 8 %" en rojo, con flecha (no solo color).
 * `menosEsMejor` para gastos o devoluciones.
 */
export function Delta({ actual, anterior, contra, menosEsMejor = false }: { actual: number; anterior: number; contra: string; menosEsMejor?: boolean }) {
  if (!anterior && !actual) return null;
  if (!anterior) {
    return (
      <Typography variant="body2" color="text.secondary">
        Sin datos {contra}
      </Typography>
    );
  }
  const cambio = ((actual - anterior) / Math.abs(anterior)) * 100;
  const sube = cambio > 0;
  const igual = Math.abs(cambio) < 0.5;
  const bueno = igual ? null : sube !== menosEsMejor;
  const Flecha = sube ? ArrowUpwardIcon : ArrowDownwardIcon;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      {!igual && <Flecha sx={{ fontSize: 16 }} color={bueno ? 'success' : 'error'} />}
      <Typography variant="body2" sx={{ fontWeight: 600 }} color={bueno === null ? 'text.secondary' : bueno ? 'success.main' : 'error.main'}>
        {igual ? 'Igual' : pct(Math.abs(Math.round(cambio * 10) / 10))}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {contra}
      </Typography>
    </Stack>
  );
}

/** Tarjeta con un número y, opcionalmente, su comparación. */
export function Tarjeta({ titulo, valor, color, children }: { titulo: string; valor: string; color?: string; children?: ReactNode }) {
  return (
    <Paper sx={{ p: 2, flex: '1 1 160px', minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {titulo}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, my: 0.25 }} color={color}>
        {valor}
      </Typography>
      {children}
    </Paper>
  );
}

export function Tarjetas({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{children}</Box>;
}

export type ColumnaTabla<T> = {
  titulo: string;
  valor: (fila: T) => ReactNode;
  derecha?: boolean;
  /** Se oculta en pantallas chicas. */
  secundaria?: boolean;
};

/** Tabla compacta con desplazamiento horizontal en el celular. */
export function Tabla<T>({ columnas, filas, clave, onClick }: { columnas: ColumnaTabla<T>[]; filas: T[]; clave: (f: T, i: number) => string | number; onClick?: (f: T) => void }) {
  const oculta = { display: { xs: 'none', sm: 'table-cell' } };
  return (
    <TableContainer>
      <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap' }, '& td': { fontVariantNumeric: 'tabular-nums' } }}>
        <TableHead>
          <TableRow>
            {columnas.map((c) => (
              <TableCell key={c.titulo} align={c.derecha ? 'right' : 'left'} sx={{ color: 'text.secondary', ...(c.secundaria ? oculta : {}) }}>
                {c.titulo}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {filas.map((f, i) => (
            <TableRow key={clave(f, i)} hover={!!onClick} onClick={onClick && (() => onClick(f))} sx={{ cursor: onClick ? 'pointer' : undefined, '&:last-child td': { border: 0 } }}>
              {columnas.map((c) => (
                <TableCell key={c.titulo} align={c.derecha ? 'right' : 'left'} sx={c.secundaria ? oculta : undefined}>
                  {c.valor(f)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Botón "Exportar a Excel": arma las hojas recién cuando se toca. */
export function BotonExcel({ archivo, hojas, disabled }: { archivo: string; hojas: () => Hoja[]; disabled?: boolean }) {
  return (
    <Button variant="outlined" startIcon={<DownloadIcon />} disabled={disabled} onClick={() => descargarExcel(archivo, hojas())} sx={{ whiteSpace: 'nowrap' }}>
      Exportar a Excel
    </Button>
  );
}
