import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { loginSchema, type LoginInput } from '@lmont/shared';
import { useLogin, useSesion } from '../auth/useSesion';
import { aplicarErroresServidor } from '../api/forms';

export function LoginPage() {
  const { data: usuario } = useSesion();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { usuario: '', password: '' } });
  const desde = (location.state as { desde?: string } | null)?.desde ?? '/';

  if (usuario) return <Navigate to={desde} replace />;

  const onSubmit = form.handleSubmit(async (data) => {
    setError(null);
    try {
      await login.mutateAsync(data);
      navigate(desde, { replace: true });
    } catch (e) {
      setError(aplicarErroresServidor(e, form.setError));
    }
  });

  const { errors } = form.formState;

  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 2, bgcolor: 'primary.main' }}>
      <Paper component="form" onSubmit={onSubmit} noValidate sx={{ p: { xs: 3, sm: 4 }, width: '100%', maxWidth: 380 }}>
        <Stack spacing={2.5}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
              L&apos;Mont
            </Typography>
            <Typography color="text.secondary">Sistema de gestión</Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Usuario"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            {...form.register('usuario')}
            error={!!errors.usuario}
            helperText={errors.usuario?.message}
          />
          <TextField
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            {...form.register('password')}
            error={!!errors.password}
            helperText={errors.password?.message}
          />
          <Button type="submit" variant="contained" size="large" loading={login.isPending}>
            Ingresar
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
