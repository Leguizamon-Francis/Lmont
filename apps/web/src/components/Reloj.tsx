import { useEffect, useState, useSyncExternalStore } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { ZONA_HORARIA } from '@lmont/shared';

export type TipoReloj = 'digital' | 'analogico';

// --- Preferencia (se guarda en este dispositivo, como el modo oscuro) ---

const CLAVE = 'lmont.reloj';
const avisos = new Set<() => void>();

function leerTipo(): TipoReloj {
  try {
    return localStorage.getItem(CLAVE) === 'analogico' ? 'analogico' : 'digital';
  } catch {
    return 'digital';
  }
}

function suscribir(aviso: () => void) {
  avisos.add(aviso);
  window.addEventListener('storage', aviso);
  return () => {
    avisos.delete(aviso);
    window.removeEventListener('storage', aviso);
  };
}

export function useTipoReloj(): [TipoReloj, (t: TipoReloj) => void] {
  const tipo = useSyncExternalStore(suscribir, leerTipo, () => 'digital' as const);
  const cambiar = (t: TipoReloj) => {
    try {
      localStorage.setItem(CLAVE, t);
    } catch {
      // sin almacenamiento: queda el de siempre
    }
    avisos.forEach((a) => a());
  };
  return [tipo, cambiar];
}

// --- Hora de Argentina ---

const fmtFecha = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_HORARIA, weekday: 'long', day: 'numeric', month: 'long' });
const fmtHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtPartes = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_HORARIA, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });

function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

const fechaLarga = (d: Date) => {
  const f = fmtFecha.format(d);
  return f.charAt(0).toUpperCase() + f.slice(1);
};

/** Reloj del inicio: digital o analógico, según lo elegido en Configuración > Apariencia. */
export function Reloj() {
  const [tipo] = useTipoReloj();
  const ahora = useAhora();
  return tipo === 'analogico' ? <Analogico ahora={ahora} /> : <Digital ahora={ahora} />;
}

function Digital({ ahora }: { ahora: Date }) {
  return (
    <Box>
      <Typography sx={{ fontSize: { xs: 44, sm: 52 }, fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{fmtHora.format(ahora)}</Typography>
      <Typography color="text.secondary">{fechaLarga(ahora)}</Typography>
    </Box>
  );
}

function Analogico({ ahora }: { ahora: Date }) {
  const p = Object.fromEntries(fmtPartes.formatToParts(ahora).map((x) => [x.type, Number(x.value)]));
  const seg = p.second ?? 0;
  const min = (p.minute ?? 0) + seg / 60;
  const hora = ((p.hour ?? 0) % 12) + min / 60;
  const aguja = (grados: number, largo: number, ancho: number, color: string) => (
    <line x1="50" y1="50" x2="50" y2={50 - largo} stroke={color} strokeWidth={ancho} strokeLinecap="round" transform={`rotate(${grados} 50 50)`} />
  );
  return (
    <Stack direction="row" spacing={2.5} sx={{ alignItems: 'center' }}>
      <Box
        component="svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Son las ${fmtHora.format(ahora)}`}
        sx={[
          { width: 112, height: 112, flexShrink: 0, color: 'text.primary', '--segundero': '#a26b3c', '--esfera': 'var(--mui-palette-background-paper)' },
          (t) => t.applyStyles('dark', { '--segundero': '#d29a68' }),
        ]}
      >
        <circle cx="50" cy="50" r="47" fill="var(--esfera)" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="50"
            y1={i % 3 === 0 ? 9 : 10}
            x2="50"
            y2={i % 3 === 0 ? 17 : 14}
            stroke="currentColor"
            strokeOpacity={i % 3 === 0 ? 0.9 : 0.45}
            strokeWidth={i % 3 === 0 ? 3 : 1.5}
            strokeLinecap="round"
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
        {aguja(hora * 30, 24, 4.5, 'currentColor')}
        {aguja(min * 6, 34, 3, 'currentColor')}
        {aguja(seg * 6, 37, 1.2, 'var(--segundero)')}
        <circle cx="50" cy="50" r="3" fill="var(--segundero)" />
      </Box>
      <Box>
        <Typography sx={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtHora.format(ahora)}</Typography>
        <Typography color="text.secondary">{fechaLarga(ahora)}</Typography>
      </Box>
    </Stack>
  );
}
