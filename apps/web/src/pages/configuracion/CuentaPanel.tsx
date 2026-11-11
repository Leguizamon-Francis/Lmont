import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { cambiarPasswordSchema, type CambiarPasswordInput } from '@lmont/shared';
import { api } from '../../api/client';
import { aplicarErroresServidor } from '../../api/forms';

export function CuentaPanel() {
  const form = useForm<CambiarPasswordInput>({
    resolver: zodResolver(cambiarPasswordSchema),
    defaultValues: { actual: '', nueva: '', repetir: '' },
  });
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (d) => {
    setMensaje(null);
    try {
      await api('/auth/password', { body: d });
      form.reset();
      setMensaje({ tipo: 'success', texto: 'Contraseña actualizada.' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: aplicarErroresServidor(e, form.setError) });
    }
  });

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Cambiar contraseña
      </Typography>
      <Stack component="form" onSubmit={onSubmit} noValidate spacing={2} sx={{ maxWidth: 400 }}>
        {mensaje && <Alert severity={mensaje.tipo}>{mensaje.texto}</Alert>}
        <TextField label="Contraseña actual" type="password" autoComplete="current-password" {...form.register('actual')} error={!!errors.actual} helperText={errors.actual?.message} />
        <TextField label="Contraseña nueva" type="password" autoComplete="new-password" {...form.register('nueva')} error={!!errors.nueva} helperText={errors.nueva?.message ?? 'Mínimo 8 caracteres'} />
        <TextField label="Repetir contraseña nueva" type="password" autoComplete="new-password" {...form.register('repetir')} error={!!errors.repetir} helperText={errors.repetir?.message} />
        <Button type="submit" variant="contained" loading={isSubmitting} sx={{ alignSelf: 'flex-start' }}>
          Guardar
        </Button>
      </Stack>
    </Paper>
  );
}
