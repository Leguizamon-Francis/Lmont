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
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  montoParaInput,
  nuevoProductoSchema,
  productoSchema,
  type ItemLista,
  type NuevoProductoInput,
  type ProductoDetalle,
} from '@lmont/shared';
import AddIcon from '@mui/icons-material/Add';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';
import { aplicarErroresServidor } from '../../api/forms';
import { useLista, useTalles } from '../../api/catalogo';
import { MontoField, SelectorChips } from '../../components/campos';
import { CantidadesGrid, cantidadesParaApi, type Cantidades } from '../../components/CantidadesGrid';

/** Alta (sin `producto`) o edición de un producto. Al crear se eligen colores y talles. */
export function ProductoFormDialog(props: { producto?: ProductoDetalle; onClose: () => void; onGuardado: (p: ProductoDetalle) => void }) {
  const { producto, onClose } = props;
  const nuevo = !producto;
  const theme = useTheme();
  const pantallaChica = useMediaQuery(theme.breakpoints.down('sm'));
  const qc = useQueryClient();
  const tipos = useLista('tipos', true);
  const colores = useLista('colores', true);
  const talles = useTalles(true);

  const form = useForm<NuevoProductoInput>({
    resolver: zodResolver(nuevo ? nuevoProductoSchema : productoSchema),
    defaultValues: producto
      ? {
          tipoId: producto.tipoId,
          nombre: producto.nombre,
          precioCompra: montoParaInput(producto.precioCompra),
          precioVenta: montoParaInput(producto.precioVenta),
          observaciones: producto.observaciones ?? '',
          activo: producto.activo,
        }
      : { tipoId: '', nombre: '', precioCompra: '', precioVenta: '', observaciones: '', colorIds: [], talleIds: [] },
  });
  const errors = form.formState.errors;
  const [error, setError] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Cantidades>({});
  const [agregandoTipo, setAgregandoTipo] = useState(false);
  // Colores y talles elegidos, en el orden de las listas.
  const colorIds = (form.watch('colorIds') ?? []).map(Number);
  const talleIds = (form.watch('talleIds') ?? []).map(Number);
  const coloresElegidos = (colores.data ?? []).filter((c) => colorIds.includes(c.id));
  const tallesElegidos = (talles.data ?? []).filter((t) => talleIds.includes(t.id));

  const guardar = useMutation({
    mutationFn: (d: NuevoProductoInput) =>
      nuevo
        ? api<ProductoDetalle>('/productos', { body: d })
        : api<ProductoDetalle>(`/productos/${producto.id}`, { method: 'PUT', body: d }),
    onSuccess: (p) => {
      qc.setQueryData(['producto', p.id], p);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['precios', p.id] });
      props.onGuardado(p);
    },
  });
  const onSubmit = form.handleSubmit(async (d) => {
    setError(null);
    try {
      await guardar.mutateAsync(nuevo ? { ...d, cantidades: cantidadesParaApi(cantidades, colorIds, talleIds) } : d);
    } catch (e) {
      setError(aplicarErroresServidor(e, form.setError));
    }
  });

  // El tipo actual puede estar desactivado: lo mostramos igual para no perderlo.
  const opcionesTipo = tipos.data ?? [];
  const tipoInactivo = producto && !opcionesTipo.some((t) => t.id === producto.tipoId) ? producto.tipo : null;

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={pantallaChica}>
      <form onSubmit={onSubmit} noValidate>
        <DialogTitle>{nuevo ? 'Nuevo producto' : 'Editar producto'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Controller
                control={form.control}
                name="tipoId"
                render={({ field }) => (
                  <TextField
                    select
                    label="Tipo de prenda"
                    {...field}
                    value={field.value ?? ''}
                    onChange={(e) => (e.target.value === NUEVO_TIPO ? setAgregandoTipo(true) : field.onChange(e))}
                    error={!!errors.tipoId}
                    helperText={errors.tipoId?.message}
                  >
                    {tipoInactivo && <MenuItem value={tipoInactivo.id}>{tipoInactivo.nombre} (inactivo)</MenuItem>}
                    {opcionesTipo.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.nombre}
                      </MenuItem>
                    ))}
                    {opcionesTipo.length > 0 && <Divider />}
                    <MenuItem value={NUEVO_TIPO} sx={{ color: 'primary.main', fontWeight: 600, gap: 1 }}>
                      <AddIcon fontSize="small" /> Agregar un tipo nuevo…
                    </MenuItem>
                  </TextField>
                )}
              />
              <TextField
                label="Modelo"
                placeholder="Ej.: Chino, Piqué, Waffle"
                {...form.register('nombre')}
                error={!!errors.nombre}
                helperText={errors.nombre?.message}
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <MontoField
                label="Precio de compra"
                {...form.register('precioCompra')}
                error={!!errors.precioCompra}
                helperText={errors.precioCompra?.message}
              />
              <MontoField
                label="Precio de venta"
                {...form.register('precioVenta')}
                error={!!errors.precioVenta}
                helperText={errors.precioVenta?.message}
              />
            </Stack>
            {!nuevo && (
              <Typography variant="body2" color="text.secondary">
                Si cambiás un precio, el anterior queda guardado en el historial. Las ventas ya hechas no cambian.
              </Typography>
            )}
            <TextField
              label="Observaciones"
              multiline
              minRows={2}
              {...form.register('observaciones')}
              error={!!errors.observaciones}
              helperText={errors.observaciones?.message}
            />

            {nuevo ? (
              <>
                <Typography color="text.secondary" variant="body2">
                  Elegí los colores y talles que tiene este modelo y cuántas unidades hay de cada uno. Después podés agregar
                  más colores o talles.
                </Typography>
                <Controller
                  control={form.control}
                  name="colorIds"
                  render={({ field }) => (
                    <SelectorChips
                      titulo="Colores"
                      opciones={colores.data}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      error={errors.colorIds?.message}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="talleIds"
                  render={({ field }) => (
                    <SelectorChips
                      titulo="Talles"
                      opciones={talles.data}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      error={errors.talleIds?.message}
                    />
                  )}
                />
                <CantidadesGrid colores={coloresElegidos} talles={tallesElegidos} value={cantidades} onChange={setCantidades} />
              </>
            ) : (
              <FormControlLabel
                control={<Switch defaultChecked={producto.activo} {...form.register('activo')} />}
                label="Activo (se puede vender)"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" loading={guardar.isPending}>
            {nuevo ? 'Crear producto' : 'Guardar'}
          </Button>
        </DialogActions>
      </form>
      {agregandoTipo && (
        <NuevoTipoDialog
          onClose={() => setAgregandoTipo(false)}
          onCreado={(t) => {
            form.setValue('tipoId', t.id, { shouldValidate: true });
            setAgregandoTipo(false);
          }}
        />
      )}
    </Dialog>
  );
}

const NUEVO_TIPO = '__nuevo__';

/** Crea un tipo de prenda sin salir del formulario del producto. */
function NuevoTipoDialog({ onClose, onCreado }: { onClose: () => void; onCreado: (t: ItemLista) => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState('');
  const crear = useMutation({
    mutationFn: () => api<ItemLista>('/tipos', { body: { nombre } }),
    onSuccess: (t) => {
      // Que aparezca enseguida en la lista, antes de que se vuelva a pedir.
      qc.setQueryData<ItemLista[]>(['tipos', 'activos'], (xs) => (xs ? [...xs, t].sort((a, b) => a.nombre.localeCompare(b.nombre)) : xs));
      qc.invalidateQueries({ queryKey: ['tipos'] });
      onCreado(t);
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation(); // que no se envíe también el formulario del producto
          crear.mutate();
        }}
      >
        <DialogTitle>Nuevo tipo de prenda</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              label="Nombre"
              placeholder="Ej.: Camperas"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              error={!!crear.error}
              helperText={crear.error ? ((crear.error instanceof ApiRequestError && crear.error.campos?.nombre) || mensajeDeError(crear.error)) : 'Queda guardado en la lista para los próximos productos.'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" loading={crear.isPending}>
            Agregar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
