import { Link as RouterLink } from 'react-router';
import { Button, Stack, Typography } from '@mui/material';

export function NoEncontradaPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h5">Esta página no existe</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Volver al inicio
      </Button>
    </Stack>
  );
}
