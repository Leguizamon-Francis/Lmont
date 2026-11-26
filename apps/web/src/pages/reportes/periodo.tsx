import { useSearchParams } from 'react-router';
import { MenuItem, Stack, TextField } from '@mui/material';
import { esFechaValida, formatFecha, hoy } from '@lmont/shared';
import { moverDia, moverMes } from '../../fechas';

export type Periodo = { desde: string; hasta: string };

const ultimoDiaDelMes = (mes: string) => moverDia(`${moverMes(mes, 1)}-01`, -1);

/** Atajos de período, calculados con la fecha de hoy. */
function atajos(): { id: string; texto: string; p: Periodo }[] {
  const h = hoy();
  const mes = h.slice(0, 7);
  const pasado = moverMes(mes, -1);
  const anio = h.slice(0, 4);
  return [
    { id: 'mes', texto: 'Este mes', p: { desde: `${mes}-01`, hasta: h } },
    { id: 'mes-pasado', texto: 'Mes pasado', p: { desde: `${pasado}-01`, hasta: ultimoDiaDelMes(pasado) } },
    { id: '7', texto: 'Últimos 7 días', p: { desde: moverDia(h, -6), hasta: h } },
    { id: '30', texto: 'Últimos 30 días', p: { desde: moverDia(h, -29), hasta: h } },
    { id: '90', texto: 'Últimos 90 días', p: { desde: moverDia(h, -89), hasta: h } },
    { id: 'anio', texto: 'Este año', p: { desde: `${anio}-01-01`, hasta: h } },
    { id: 'anio-pasado', texto: 'Año pasado', p: { desde: `${Number(anio) - 1}-01-01`, hasta: `${Number(anio) - 1}-12-31` } },
  ];
}

const valida = (s: string | null) => !!s && esFechaValida(s);

/** Período elegido (en la dirección, para que se pueda compartir el link). Por defecto, este mes. */
export function usePeriodo(): [Periodo, (p: Periodo) => void] {
  const [params, setParams] = useSearchParams();
  const desde = params.get('desde');
  const hasta = params.get('hasta');
  const periodo = valida(desde) && valida(hasta) && desde! <= hasta! ? { desde: desde!, hasta: hasta! } : atajos()[0]!.p;
  const cambiar = (p: Periodo) => {
    const s = new URLSearchParams(params);
    s.set('desde', p.desde);
    s.set('hasta', p.hasta);
    setParams(s, { replace: true });
  };
  return [periodo, cambiar];
}

/** "del 01/11/2026 al 26/11/2026" */
export const textoPeriodo = (p: Periodo) => (p.desde === p.hasta ? `el ${formatFecha(p.desde)}` : `del ${formatFecha(p.desde)} al ${formatFecha(p.hasta)}`);

export function SelectorPeriodo({ periodo, onChange }: { periodo: Periodo; onChange: (p: Periodo) => void }) {
  const lista = atajos();
  const elegido = lista.find((a) => a.p.desde === periodo.desde && a.p.hasta === periodo.hasta)?.id ?? 'otro';
  const h = hoy();
  return (
    <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5, alignItems: 'center' }}>
      <TextField
        select
        size="small"
        label="Período"
        value={elegido}
        onChange={(e) => {
          const a = lista.find((x) => x.id === e.target.value);
          if (a) onChange(a.p);
        }}
        sx={{ width: 190 }}
      >
        {lista.map((a) => (
          <MenuItem key={a.id} value={a.id}>
            {a.texto}
          </MenuItem>
        ))}
        <MenuItem value="otro">Elegir fechas</MenuItem>
      </TextField>
      <TextField
        type="date"
        size="small"
        label="Desde"
        value={periodo.desde}
        onChange={(e) => e.target.value && onChange({ desde: e.target.value, hasta: e.target.value > periodo.hasta ? e.target.value : periodo.hasta })}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: h } }}
        sx={{ width: 165 }}
      />
      <TextField
        type="date"
        size="small"
        label="Hasta"
        value={periodo.hasta}
        onChange={(e) => e.target.value && onChange({ desde: e.target.value < periodo.desde ? e.target.value : periodo.desde, hasta: e.target.value })}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: h } }}
        sx={{ width: 165 }}
      />
    </Stack>
  );
}
