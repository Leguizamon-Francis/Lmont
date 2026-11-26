import type { ReactNode } from 'react';
import { IconButton, Stack, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

/** Flechas para ir al día o mes anterior / siguiente, con el selector en el medio. */
export function Navegador(props: { anterior: () => void; siguiente?: () => void; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <IconButton aria-label="Anterior" onClick={props.anterior}>
        <ChevronLeftIcon />
      </IconButton>
      {props.children}
      <IconButton aria-label="Siguiente" disabled={!props.siguiente} onClick={props.siguiente}>
        <ChevronRightIcon />
      </IconButton>
    </Stack>
  );
}

/** Renglón "texto ........ valor" de un resumen. */
export function Fila({ texto, valor, fuerte, color }: { texto: ReactNode; valor: string; fuerte?: boolean; color?: string }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2, alignItems: 'baseline' }}>
      <Typography color={fuerte ? undefined : 'text.secondary'} sx={{ fontWeight: fuerte ? 600 : undefined }}>
        {texto}
      </Typography>
      <Typography sx={{ fontWeight: fuerte ? 700 : 600, whiteSpace: 'nowrap' }} color={color}>
        {valor}
      </Typography>
    </Stack>
  );
}
