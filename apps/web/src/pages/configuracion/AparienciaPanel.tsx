import { FormControlLabel, Paper, Radio, RadioGroup, Stack, Typography, useColorScheme } from '@mui/material';
import { useTipoReloj, type TipoReloj } from '../../components/Reloj';

type Modo = 'light' | 'dark' | 'system';

const MODOS: { valor: Modo; texto: string }[] = [
  { valor: 'light', texto: 'Claro' },
  { valor: 'dark', texto: 'Oscuro' },
  { valor: 'system', texto: 'Igual que el dispositivo' },
];

const RELOJES: { valor: TipoReloj; texto: string }[] = [
  { valor: 'digital', texto: 'Digital (con números)' },
  { valor: 'analogico', texto: 'Analógico (con agujas)' },
];

export function AparienciaPanel() {
  const { mode, setMode } = useColorScheme();
  const [reloj, setReloj] = useTipoReloj();
  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">Se guarda en este dispositivo: cada celular o computadora puede tener el suyo.</Typography>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Modo de pantalla
        </Typography>
        <RadioGroup value={mode ?? 'system'} onChange={(e) => setMode(e.target.value as Modo)}>
          {MODOS.map((o) => (
            <FormControlLabel key={o.valor} value={o.valor} control={<Radio />} label={o.texto} sx={{ minHeight: 44 }} />
          ))}
        </RadioGroup>
      </Paper>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Reloj del inicio
        </Typography>
        <RadioGroup value={reloj} onChange={(e) => setReloj(e.target.value as TipoReloj)}>
          {RELOJES.map((o) => (
            <FormControlLabel key={o.valor} value={o.valor} control={<Radio />} label={o.texto} sx={{ minHeight: 44 }} />
          ))}
        </RadioGroup>
      </Paper>
    </Stack>
  );
}
