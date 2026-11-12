import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import ArrowUpIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownIcon from '@mui/icons-material/ArrowDownward';
import { talleSchema, tipoPrendaSchema, type ItemLista, type ItemListaInput, type Talle } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { aplicarErroresServidor } from '../../api/forms';
import { useLista, type TipoLista } from '../../api/catalogo';

type Textos = { titulo: string; ayuda: string; campo: string; singular: string; vacio: string };

const TEXTOS: Record<TipoLista, Textos> = {
  tipos: {
    titulo: 'Tipos de prenda',
    ayuda: 'Pantalones, remeras, chombas… Cada producto pertenece a un tipo.',
    campo: 'Nuevo tipo de prenda',
    singular: 'tipo de prenda',
    vacio: 'Todavía no hay tipos de prenda.',
  },
  talles: {
    titulo: 'Talles',
    ayuda: 'Se eligen de esta lista al cargar productos. Con las flechas cambiás el orden en que se muestran.',
    campo: 'Nuevo talle',
    singular: 'talle',
    vacio: 'Todavía no hay talles.',
  },
  colores: {
    titulo: 'Colores',
    ayuda: 'Se eligen de esta lista al cargar productos.',
    campo: 'Nuevo color',
    singular: 'color',
    vacio: 'Todavía no hay colores.',
  },
};

/** Panel para administrar tipos de prenda, talles o colores. */
export function ListaPanel({ tipo }: { tipo: TipoLista }) {
  const t = TEXTOS[tipo];
  const schema = tipo === 'talles' ? talleSchema : tipoPrendaSchema;
  const qc = useQueryClient();
  const { data, isPending, error } = useLista<ItemLista & Partial<Talle>>(tipo);
  const [editando, setEditando] = useState<ItemLista | null>(null);
  const invalidar = () => qc.invalidateQueries({ queryKey: [tipo] });

  const form = useForm<ItemListaInput>({ resolver: zodResolver(schema), defaultValues: { nombre: '' } });
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const crear = useMutation({
    mutationFn: (d: ItemListaInput) => api(`/${tipo}`, { body: d }),
    onSuccess: () => {
      form.reset({ nombre: '' });
      invalidar();
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

  const ordenar = useMutation({
    mutationFn: (ids: number[]) => api<Talle[]>('/talles/orden', { method: 'PUT', body: { ids } }),
    onSuccess: invalidar,
  });
  const mover = (i: number, delta: number) => {
    if (!data) return;
    const ids = data.map((x) => x.id);
    const j = i + delta;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    ordenar.mutate(ids);
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6">{t.titulo}</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t.ayuda}
      </Typography>

      <Stack component="form" onSubmit={onSubmit} noValidate direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          label={t.campo}
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
      {ordenar.error && <Alert severity="error" sx={{ mb: 2 }}>{mensajeDeError(ordenar.error)}</Alert>}

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {data?.length === 0 && <Typography color="text.secondary">{t.vacio}</Typography>}
      <List disablePadding>
        {data?.map((item, i) => (
          <ListItem
            key={item.id}
            divider
            secondaryAction={
              <Box sx={{ display: 'flex' }}>
                {tipo === 'talles' && (
                  <>
                    <IconButton aria-label={`Subir ${item.nombre}`} disabled={i === 0 || ordenar.isPending} onClick={() => mover(i, -1)}>
                      <ArrowUpIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label={`Bajar ${item.nombre}`}
                      disabled={i === data.length - 1 || ordenar.isPending}
                      onClick={() => mover(i, 1)}
                    >
                      <ArrowDownIcon fontSize="small" />
                    </IconButton>
                  </>
                )}
                <IconButton edge="end" aria-label={`Editar ${item.nombre}`} onClick={() => setEditando(item)}>
                  <EditIcon />
                </IconButton>
              </Box>
            }
            sx={{ pr: tipo === 'talles' ? 18 : undefined }}
          >
            <ListItemText
              primary={
                <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {item.nombre}
                  {!item.activo && <Chip label="Inactivo" size="small" />}
                </Box>
              }
            />
          </ListItem>
        ))}
      </List>

      {editando && (
        <EditarItem tipo={tipo} singular={t.singular} item={editando} onClose={() => setEditando(null)} onGuardado={invalidar} />
      )}
    </Paper>
  );
}

function EditarItem(props: { tipo: TipoLista; singular: string; item: ItemLista; onClose: () => void; onGuardado: () => void }) {
  const { tipo, item, onClose } = props;
  const form = useForm<ItemListaInput>({
    resolver: zodResolver(tipo === 'talles' ? talleSchema : tipoPrendaSchema),
    defaultValues: { nombre: item.nombre, activo: item.activo },
  });
  const [error, setError] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: (d: ItemListaInput) => api(`/${tipo}/${item.id}`, { method: 'PUT', body: d }),
    onSuccess: () => {
      props.onGuardado();
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
        <DialogTitle>Editar {props.singular}</DialogTitle>
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
              control={<Switch defaultChecked={item.activo} {...form.register('activo')} />}
              label="Activo (aparece para elegir al cargar productos)"
            />
            <Typography variant="body2" color="text.secondary">
              Si lo desactivás, los productos que ya lo usan no cambian.
            </Typography>
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
