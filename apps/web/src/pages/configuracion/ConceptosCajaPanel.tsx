import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';
import { TIPOS_CAJA, type ConceptoCaja, type TipoCaja } from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';

/** Conceptos para cargar ingresos y gastos de caja. */
export function ConceptosCajaPanel() {
  const { data, isPending, error } = useQuery({ queryKey: ['caja', 'conceptos', 'todos'], queryFn: () => api<ConceptoCaja[]>('/caja/conceptos') });
  const [editando, setEditando] = useState<ConceptoCaja | 'nuevo' | null>(null);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h6">Conceptos de caja</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Se eligen al cargar un ingreso o un gasto. Sirven para ver en qué se va la plata cada mes.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditando('nuevo')} sx={{ flexShrink: 0 }}>
          Agregar
        </Button>
      </Stack>
      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      {(['GASTO', 'INGRESO'] as TipoCaja[]).map((tipo) => {
        const lista = data?.filter((c) => c.tipo === tipo) ?? [];
        if (!data) return null;
        return (
          <Box key={tipo} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
              {tipo === 'GASTO' ? 'Gastos' : 'Ingresos'}
            </Typography>
            {lista.length === 0 && <Typography color="text.secondary">No hay conceptos cargados.</Typography>}
            <List disablePadding>
              {lista.map((c) => (
                <ListItem
                  key={c.id}
                  divider
                  secondaryAction={
                    <IconButton edge="end" aria-label={`Editar ${c.nombre}`} onClick={() => setEditando(c)}>
                      <EditIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={
                      <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        {c.nombre}
                        {!c.activo && <Chip label="Inactivo" size="small" />}
                        {c.tipo === 'GASTO' && !c.cuentaEnGanancia && <Chip label="No resta en la ganancia" size="small" variant="outlined" />}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        );
      })}
      <Typography variant="body2" color="text.secondary">
        La compra de mercadería no hace falta cargarla: sale sola de los ingresos marcados como pagados con la caja.
      </Typography>
      {editando && <ConceptoDialog concepto={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)} />}
    </Paper>
  );
}

function ConceptoDialog({ concepto, onClose }: { concepto: ConceptoCaja | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(concepto?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCaja>(concepto?.tipo ?? 'GASTO');
  const [activo, setActivo] = useState(concepto?.activo ?? true);
  const [cuentaEnGanancia, setCuentaEnGanancia] = useState(concepto?.cuentaEnGanancia ?? true);
  const guardar = useMutation({
    mutationFn: () =>
      concepto
        ? api(`/caja/conceptos/${concepto.id}`, { method: 'PUT', body: { nombre, tipo, activo, cuentaEnGanancia } })
        : api('/caja/conceptos', { body: { nombre, tipo, activo, cuentaEnGanancia } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja', 'conceptos'] });
      onClose();
    },
  });
  const campos = guardar.error instanceof ApiRequestError ? (guardar.error.campos ?? {}) : {};
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <DialogTitle>{concepto ? 'Editar concepto' : 'Nuevo concepto'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField autoFocus label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={!!campos.nombre} helperText={campos.nombre} />
            <TextField select label="Es un" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCaja)} error={!!campos.tipo} helperText={campos.tipo}>
              {(Object.keys(TIPOS_CAJA) as TipoCaja[]).map((t) => (
                <MenuItem key={t} value={t}>
                  {TIPOS_CAJA[t]}
                </MenuItem>
              ))}
            </TextField>
            {tipo === 'GASTO' && (
              <Box>
                <FormControlLabel
                  control={<Switch checked={cuentaEnGanancia} onChange={(e) => setCuentaEnGanancia(e.target.checked)} />}
                  label="Resta en la ganancia"
                />
                <Typography variant="caption" color="text.secondary" component="div">
                  Desactivalo para la plata que sale de la caja pero no es un gasto del local, como un retiro del dueño.
                </Typography>
              </Box>
            )}
            {concepto && <FormControlLabel control={<Switch checked={activo} onChange={(e) => setActivo(e.target.checked)} />} label="Activo (se puede elegir)" />}
            {guardar.error && !Object.keys(campos).length && <Alert severity="error">{mensajeDeError(guardar.error)}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" loading={guardar.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
