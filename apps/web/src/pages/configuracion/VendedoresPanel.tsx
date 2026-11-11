import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/EditOutlined';
import { vendedorSchema, type Vendedor, type VendedorInput } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { aplicarErroresServidor } from '../../api/forms';

export function VendedoresPanel() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ['vendedores'],
    queryFn: () => api<Vendedor[]>('/vendedores'),
  });
  const [editando, setEditando] = useState<Vendedor | null>(null);

  const form = useForm<VendedorInput>({ resolver: zodResolver(vendedorSchema), defaultValues: { nombre: '' } });
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const crear = useMutation({
    mutationFn: (d: VendedorInput) => api<Vendedor>('/vendedores', { body: d }),
    onSuccess: () => {
      form.reset({ nombre: '' });
      qc.invalidateQueries({ queryKey: ['vendedores'] });
    },
  });

  const onSubmit = form.handleSubmit(async (d) => {
    setErrorAlta(null);
    try {
      await crear.mutateAsync(d);
    } catch (e) {
      setErrorAlta(aplicarErroresServidor(e, form.setError));
    }
  });

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6">Vendedores</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Las personas que atienden. Se eligen en cada venta para saber quién vendió.
      </Typography>

      <Stack component="form" onSubmit={onSubmit} noValidate direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          label="Nombre del vendedor"
          size="small"
          {...form.register('nombre')}
          error={!!form.formState.errors.nombre}
          helperText={form.formState.errors.nombre?.message}
        />
        <Button type="submit" variant="contained" loading={crear.isPending} sx={{ flexShrink: 0, height: 40 }}>
          Agregar
        </Button>
      </Stack>
      {errorAlta && !form.formState.errors.nombre && <Alert severity="error" sx={{ mb: 2 }}>{errorAlta}</Alert>}

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {data?.length === 0 && <Typography color="text.secondary">Todavía no hay vendedores cargados.</Typography>}
      <List disablePadding>
        {data?.map((v) => (
          <ListItem
            key={v.id}
            divider
            secondaryAction={
              <IconButton edge="end" aria-label={`Editar ${v.nombre}`} onClick={() => setEditando(v)}>
                <EditIcon />
              </IconButton>
            }
          >
            <ListItemText
              primary={
                <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {v.nombre}
                  {!v.activo && <Chip label="Inactivo" size="small" />}
                </Box>
              }
            />
          </ListItem>
        ))}
      </List>

      {editando && <EditarVendedor vendedor={editando} onClose={() => setEditando(null)} />}
    </Paper>
  );
}

function EditarVendedor({ vendedor, onClose }: { vendedor: Vendedor; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<VendedorInput>({
    resolver: zodResolver(vendedorSchema),
    defaultValues: { nombre: vendedor.nombre, activo: vendedor.activo },
  });
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: (d: VendedorInput) => api<Vendedor>(`/vendedores/${vendedor.id}`, { method: 'PUT', body: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendedores'] });
      onClose();
    },
  });
  const onSubmit = form.handleSubmit(async (d) => {
    setError(null);
    try {
      await guardar.mutateAsync(d);
    } catch (e) {
      setError(aplicarErroresServidor(e, form.setError));
    }
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>Editar vendedor</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Nombre"
              {...form.register('nombre')}
              error={!!form.formState.errors.nombre}
              helperText={form.formState.errors.nombre?.message}
            />
            <FormControlLabel
              control={<Switch defaultChecked={vendedor.activo} {...form.register('activo')} />}
              label="Activo (aparece para elegir en las ventas)"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" loading={guardar.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
