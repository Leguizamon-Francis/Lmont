import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import { clienteSchema, type Cliente, type ClienteInput } from '@lmont/shared';
import { api } from '../../api/client';
import { aplicarErroresServidor } from '../../api/forms';
import { useTalles } from '../../api/catalogo';
import { SelectorChips } from '../../components/campos';

/** Alta o edición de un cliente. `nombreInicial` sirve para crearlo desde lo que se escribió en el buscador. */
export function ClienteDialog(props: { cliente?: Cliente; nombreInicial?: string; onClose: () => void; onGuardado?: (c: Cliente) => void }) {
  const { cliente } = props;
  const qc = useQueryClient();
  const talles = useTalles(true);
  // Un talle desactivado que el cliente ya tenía se sigue mostrando para poder sacarlo.
  const opciones = [...(talles.data ?? []), ...(cliente?.talles.filter((t) => !talles.data?.some((x) => x.id === t.id)) ?? [])];

  const form = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nombre: cliente?.nombre ?? props.nombreInicial ?? '',
      whatsapp: cliente?.whatsapp ?? '',
      talleIds: cliente?.talles.map((t) => t.id) ?? [],
      notas: cliente?.notas ?? '',
      activo: cliente?.activo ?? true,
    },
  });
  const errors = form.formState.errors;
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: (d: ClienteInput) =>
      cliente ? api<Cliente>(`/clientes/${cliente.id}`, { method: 'PUT', body: d }) : api<Cliente>('/clientes', { body: d }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      props.onGuardado?.(c);
      props.onClose();
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
    <Dialog open onClose={props.onClose} fullWidth maxWidth="sm">
      <form
        onSubmit={(e) => {
          // Puede abrirse desde dentro de otro formulario (la venta): que no lo dispare.
          e.stopPropagation();
          void onSubmit(e);
        }}
        noValidate
      >
        <DialogTitle>{cliente ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Nombre" autoFocus {...form.register('nombre')} error={!!errors.nombre} helperText={errors.nombre?.message} />
            <TextField
              label="WhatsApp (opcional)"
              placeholder="342 555-1234"
              {...form.register('whatsapp')}
              error={!!errors.whatsapp}
              helperText={errors.whatsapp?.message ?? 'Con característica, sin el 0 ni el 15'}
              slotProps={{ htmlInput: { inputMode: 'tel' } }}
            />
            <Controller
              control={form.control}
              name="talleIds"
              render={({ field }) => (
                <SelectorChips
                  titulo="Talles que usa (opcional)"
                  opciones={opciones}
                  value={field.value ?? []}
                  onChange={field.onChange}
                  error={errors.talleIds?.message}
                />
              )}
            />
            <TextField
              label="Notas (opcional)"
              placeholder="Ej: prefiere colores lisos, avisarle cuando entren chinos"
              multiline
              minRows={2}
              {...form.register('notas')}
              error={!!errors.notas}
              helperText={errors.notas?.message}
            />
            {cliente && <FormControlLabel control={<Switch defaultChecked={cliente.activo} {...form.register('activo')} />} label="Activo" />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={props.onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" loading={guardar.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
