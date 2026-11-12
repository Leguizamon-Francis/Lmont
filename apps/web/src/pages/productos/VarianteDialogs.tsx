import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  nuevasVariantesSchema,
  varianteSchema,
  type NuevasVariantesInput,
  type ProductoDetalle,
  type Variante,
  type VarianteInput,
} from '@lmont/shared';
import { api } from '../../api/client';
import { aplicarErroresServidor } from '../../api/forms';
import { useLista, useTalles } from '../../api/catalogo';
import { SelectorChips } from '../../components/campos';
import { CantidadesGrid, cantidadesParaApi, claveCombinacion, type Cantidades } from '../../components/CantidadesGrid';

/** Código de barras, stock mínimo y activo de una variante. El stock se mueve con ingresos y ventas. */
export function EditarVarianteDialog({ productoId, variante, onClose }: { productoId: number; variante: Variante; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm<VarianteInput>({
    resolver: zodResolver(varianteSchema),
    defaultValues: { codigoBarras: variante.codigoBarras ?? '', stockMinimo: String(variante.stockMinimo), activo: variante.activo },
  });
  const errors = form.formState.errors;
  const [error, setError] = useState<string | null>(null);
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['producto', productoId] });
    qc.invalidateQueries({ queryKey: ['productos'] });
  };

  const guardar = useMutation({
    mutationFn: (d: VarianteInput) => api<Variante>(`/variantes/${variante.id}`, { method: 'PUT', body: d }),
    onSuccess: () => {
      refrescar();
      onClose();
    },
  });
  const generar = useMutation({
    mutationFn: () => api<Variante>(`/variantes/${variante.id}/codigo-interno`, { method: 'POST' }),
    onSuccess: (v) => {
      form.setValue('codigoBarras', v.codigoBarras ?? '');
      refrescar();
    },
    onError: (e) => setError(aplicarErroresServidor(e, form.setError)),
  });
  const onSubmit = form.handleSubmit(async (d) => {
    setError(null);
    try {
      await guardar.mutateAsync(d);
    } catch (e) {
      setError(aplicarErroresServidor(e, form.setError));
    }
  });
  const codigo = form.watch('codigoBarras');

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>
          {variante.color.nombre} · talle {variante.talle.nombre}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Código de barras"
              autoFocus={!variante.codigoBarras}
              placeholder="Escaneá la etiqueta o escribilo"
              {...form.register('codigoBarras')}
              // El lector manda Enter al terminar: no queremos que guarde sin revisar el resto.
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              error={!!errors.codigoBarras}
              helperText={errors.codigoBarras?.message}
              slotProps={{ htmlInput: { autoComplete: 'off', style: { fontFamily: 'monospace' } } }}
            />
            {!variante.codigoBarras && !codigo && (
              <Button onClick={() => generar.mutate()} loading={generar.isPending} sx={{ alignSelf: 'flex-start' }}>
                No tiene: generar código interno
              </Button>
            )}
            <TextField
              label="Stock mínimo"
              {...form.register('stockMinimo')}
              error={!!errors.stockMinimo}
              helperText={errors.stockMinimo?.message ?? 'Avisa cuando queden esta cantidad o menos. 0 = sin aviso.'}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            />
            <Typography variant="body2" color="text.secondary">
              Stock actual: <b>{variante.stock}</b>. Se modifica con los ingresos de mercadería y las ventas.
            </Typography>
            <FormControlLabel
              control={<Switch defaultChecked={variante.activo} {...form.register('activo')} />}
              label="Activa (se puede vender)"
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

/** Agrega combinaciones color × talle a un producto. Las que ya existen se ignoran. */
export function AgregarVariantesDialog({ producto, onClose }: { producto: ProductoDetalle; onClose: () => void }) {
  const qc = useQueryClient();
  const colores = useLista('colores', true);
  const talles = useTalles(true);
  const coloresActuales = [...new Set(producto.variantes.map((v) => v.color.id))];
  const tallesActuales = [...new Set(producto.variantes.map((v) => v.talle.id))];

  // Arranca con lo que ya tiene el producto: así, sumar un color nuevo lo crea en todos los talles existentes.
  const form = useForm<NuevasVariantesInput>({
    resolver: zodResolver(nuevasVariantesSchema),
    defaultValues: { colorIds: coloresActuales, talleIds: tallesActuales },
  });
  const [error, setError] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Cantidades>({});
  const existentes = new Set(producto.variantes.map((v) => claveCombinacion(v.color.id, v.talle.id)));
  const colorIds = (form.watch('colorIds') ?? []).map(Number);
  const talleIds = (form.watch('talleIds') ?? []).map(Number);
  const coloresElegidos = (colores.data ?? []).filter((c) => colorIds.includes(c.id));
  const tallesElegidos = (talles.data ?? []).filter((t) => talleIds.includes(t.id));
  const agregar = useMutation({
    mutationFn: (d: NuevasVariantesInput) => api<ProductoDetalle>(`/productos/${producto.id}/variantes`, { body: d }),
    onSuccess: (p) => {
      qc.setQueryData(['producto', producto.id], p);
      qc.invalidateQueries({ queryKey: ['productos'] });
      onClose();
    },
  });
  const onSubmit = form.handleSubmit(async (d) => {
    setError(null);
    try {
      await agregar.mutateAsync({ ...d, cantidades: cantidadesParaApi(cantidades, colorIds, talleIds, existentes) });
    } catch (e) {
      setError(aplicarErroresServidor(e, form.setError));
    }
  });
  const errors = form.formState.errors;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>Agregar colores o talles</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Se crean todas las combinaciones de los colores y talles marcados que todavía no existan.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <Controller
              control={form.control}
              name="colorIds"
              render={({ field }) => (
                <SelectorChips titulo="Colores" opciones={colores.data} value={field.value ?? []} onChange={field.onChange} error={errors.colorIds?.message} />
              )}
            />
            <Controller
              control={form.control}
              name="talleIds"
              render={({ field }) => (
                <SelectorChips titulo="Talles" opciones={talles.data} value={field.value ?? []} onChange={field.onChange} error={errors.talleIds?.message} />
              )}
            />
            <CantidadesGrid
              colores={coloresElegidos}
              talles={tallesElegidos}
              value={cantidades}
              onChange={setCantidades}
              existentes={existentes}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" loading={agregar.isPending}>
            Agregar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
