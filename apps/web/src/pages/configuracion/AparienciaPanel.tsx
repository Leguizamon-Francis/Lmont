import { FormControlLabel, Paper, Radio, RadioGroup, Typography, useColorScheme } from '@mui/material';

type Modo = 'light' | 'dark' | 'system';

const OPCIONES: { valor: Modo; texto: string }[] = [
  { valor: 'light', texto: 'Claro' },
  { valor: 'dark', texto: 'Oscuro' },
  { valor: 'system', texto: 'Igual que el dispositivo' },
];

export function AparienciaPanel() {
  const { mode, setMode } = useColorScheme();
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6">Modo de pantalla</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Se guarda en este dispositivo: cada celular o computadora puede tener el suyo.
      </Typography>
      <RadioGroup value={mode ?? 'system'} onChange={(e) => setMode(e.target.value as Modo)}>
        {OPCIONES.map((o) => (
          <FormControlLabel key={o.valor} value={o.valor} control={<Radio />} label={o.texto} sx={{ minHeight: 44 }} />
        ))}
      </RadioGroup>
    </Paper>
  );
}
