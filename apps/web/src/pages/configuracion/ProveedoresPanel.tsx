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
import AddIcon from '@mui/icons-material/Add';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { linkWhatsapp, proveedorSchema, type Proveedor, type ProveedorInput } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { aplicarErroresServidor } from '../../api/forms';

export function ProveedoresPanel() {
  const { data, isPending, error } = useQuery({
    queryKey: ['proveedores', 'todos'],
    queryFn: () => api<Proveedor[]>('/proveedores'),
  });
  const [editando, setEditando] = useState<Proveedor | 'nuevo' | null>(null);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h6">Proveedores</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            A quién le compran la mercadería. Se eligen en cada ingreso.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditando('nuevo')} sx={{ flexShrink: 0 }}>
          Agregar
        </Button>
      </Stack>

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {data?.length === 0 && <Typography color="text.secondary">Todavía no hay proveedores cargados.</Typography>}
      <List disablePadding>
        {data?.map((p) => (
          <ListItem
            key={p.id}
            divider
            secondaryAction={
              <Box>
                {p.whatsapp && (
                  <IconButton href={linkWhatsapp(p.whatsapp)} target="_blank" rel="noopener" aria-label={`WhatsApp de ${p.nombre}`} color="success">
                    <WhatsAppIcon />
                  </IconButton>
                )}
                <IconButton edge="end" aria-label={`Editar ${p.nombre}`} onClick={() => setEditando(p)}>
                  <EditIcon />
                </IconButton>
              </Box>
            }
            sx={{ pr: 12 }}
          >
            <ListItemText
              primary={
                <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {p.nombre}
                  {!p.activo && <Chip label="Inactivo" size="small" />}
                </Box>
              }
              secondary={[p.whatsapp, p.notas].filter(Boolean).join(' · ') || null}
            />
          </ListItem>
        ))}
      </List>

      {editando && <ProveedorDialog proveedor={editando === 'nuevo' ? undefined : editando} onClose={() => setEditando(null)} />}
    </Paper>
  );
}

function ProveedorDialog({ proveedor, onClose }: { proveedor?: Proveedor; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<ProveedorInput>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: {
      nombre: proveedor?.nombre ?? '',
      whatsapp: proveedor?.whatsapp ?? '',
      notas: proveedor?.notas ?? '',
      activo: proveedor?.activo ?? true,
    },
  });
  const errors = form.formState.errors;
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: (d: ProveedorInput) =>
      proveedor ? api(`/proveedores/${proveedor.id}`, { method: 'PUT', body: d }) : api('/proveedores', { body: d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
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
        <DialogTitle>{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Nombre" autoFocus {...form.register('nombre')} error={!!errors.nombre} helperText={errors.nombre?.message} />
            <TextField
              label="WhatsApp (opcional)"
              placeholder="342 555-1234"
              {...form.register('whatsapp')}
              error={!!errors.whatsapp}
              helperText={errors.whatsapp?.message ?? 'Con característica, sin el 0 ni el 15 si podés'}
              slotProps={{ htmlInput: { inputMode: 'tel' } }}
            />
            <TextField label="Notas (opcional)" multiline minRows={2} {...form.register('notas')} error={!!errors.notas} helperText={errors.notas?.message} />
            {proveedor && (
              <FormControlLabel control={<Switch defaultChecked={proveedor.activo} {...form.register('activo')} />} label="Activo" />
            )}
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
