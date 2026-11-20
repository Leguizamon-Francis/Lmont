import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  ajusteSchema,
  MOTIVOS_AJUSTE,
  NOMBRE_MOVIMIENTO,
  nuevasVariantesSchema,
  varianteSchema,
  ZONA_HORARIA,
  type AjusteInput,
  type Movimiento,
  type NuevasVariantesInput,
  type ProductoDetalle,
  type Variante,
  type VarianteInput,
} from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
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
  const [ajustando, setAjustando] = useState(false);

  if (ajustando) {
    return (
      <AjusteDialog
        variante={variante}
        onClose={() => setAjustando(false)}
        onAjustado={() => {
          refrescar();
          qc.invalidateQueries({ queryKey: ['movimientos', variante.id] });
          qc.invalidateQueries({ queryKey: ['stock'] });
          onClose();
        }}
      />
    );
  }

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
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Stock actual: <b>{variante.stock}</b>
              </Typography>
              <Button size="small" onClick={() => setAjustando(true)}>
                Ajustar stock
              </Button>
            </Stack>
            <Movimientos varianteId={variante.id} />
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

/** Corrección manual: se carga cuántas hay realmente y el motivo. */
function AjusteDialog({ variante, onClose, onAjustado }: { variante: Variante; onClose: () => void; onAjustado: () => void }) {
  const form = useForm<AjusteInput>({
    resolver: zodResolver(ajusteSchema),
    defaultValues: { stockReal: String(variante.stock), motivo: 'RECUENTO', nota: '' },
  });
  const errors = form.formState.errors;
  const [error, setError] = useState<string | null>(null);
  const ajustar = useMutation({
    mutationFn: (d: AjusteInput) => api<Variante>(`/variantes/${variante.id}/ajuste`, { body: d }),
    onSuccess: onAjustado,
  });
  const onSubmit = form.handleSubmit(async (d) => {
    setError(null);
    try {
      await ajustar.mutateAsync(d);
    } catch (e) {
      setError(aplicarErroresServidor(e, form.setError));
    }
  });
  const real = Number(form.watch('stockReal'));
  const diferencia = Number.isInteger(real) && real >= 0 ? real - variante.stock : null;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>
          Ajustar stock · {variante.color.nombre} {variante.talle.nombre}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              El sistema dice que hay <b>{variante.stock}</b>. Cargá cuántas hay realmente; la diferencia queda registrada con
              el motivo. Para mercadería nueva usá "Ingresar mercadería".
            </Typography>
            <TextField
              label="Cuántas hay realmente"
              autoFocus
              {...form.register('stockReal')}
              error={!!errors.stockReal}
              helperText={
                errors.stockReal?.message ??
                (diferencia ? `${diferencia > 0 ? 'Suma' : 'Descuenta'} ${Math.abs(diferencia)} ${Math.abs(diferencia) === 1 ? 'unidad' : 'unidades'}` : ' ')
              }
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            />
            <Controller
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <TextField select label="Motivo" {...field} error={!!errors.motivo} helperText={errors.motivo?.message}>
                  {Object.entries(MOTIVOS_AJUSTE).map(([k, t]) => (
                    <MenuItem key={k} value={k}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <TextField label="Nota" {...form.register('nota')} error={!!errors.nota} helperText={errors.nota?.message ?? 'Opcional, salvo que el motivo sea "Otro"'} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Volver</Button>
          <Button type="submit" variant="contained" loading={ajustar.isPending}>
            Ajustar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const fmtFechaHora = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: ZONA_HORARIA });

/** Últimos movimientos de stock de la variante. */
function Movimientos({ varianteId }: { varianteId: number }) {
  const [abierto, setAbierto] = useState(false);
  const { data, error } = useQuery({
    queryKey: ['movimientos', varianteId],
    queryFn: () => api<Movimiento[]>(`/variantes/${varianteId}/movimientos`),
    enabled: abierto,
  });
  if (!abierto) {
    return (
      <Button size="small" onClick={() => setAbierto(true)} sx={{ alignSelf: 'flex-start' }}>
        Ver movimientos de stock
      </Button>
    );
  }
  return (
    <Box>
      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {data?.length === 0 && <Typography variant="body2" color="text.secondary">Todavía no tiene movimientos.</Typography>}
      {data?.map((m) => (
        <Stack key={m.id} direction="row" spacing={1} sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2">
              {m.ingresoId ? (
                <RouterLink to={`/stock/ingresos/${m.ingresoId}`}>{NOMBRE_MOVIMIENTO[m.tipo]}</RouterLink>
              ) : m.ventaId ? (
                <RouterLink to={`/ventas/${m.ventaId}`}>{NOMBRE_MOVIMIENTO[m.tipo]}</RouterLink>
              ) : (
                NOMBRE_MOVIMIENTO[m.tipo]
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {fmtFechaHora.format(new Date(m.creadoEn))}
              {m.detalle ? ` · ${m.detalle}` : ''}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} color={m.cantidad > 0 ? 'success.main' : 'error.main'}>
              {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              quedó {m.stockResultante}
            </Typography>
          </Box>
        </Stack>
      ))}
    </Box>
  );
}
