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
  InputAdornment,
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
import { nombrePlan, textoPorcentaje, type PlanPago } from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';

type Tipo = 'ninguno' | 'descuento' | 'recargo';

/** Recargo por cuotas con crédito y descuento por pagar en efectivo o transferencia. */
export function MediosPagoPanel() {
  const { data, isPending, error } = useQuery({ queryKey: ['planes-pago', 'todos'], queryFn: () => api<PlanPago[]>('/planes-pago') });
  const [editando, setEditando] = useState<PlanPago | 'nuevo' | null>(null);

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h6">Medios de pago</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Si cobran recargo por pagar en cuotas o hacen descuento por efectivo o transferencia, configuralo acá. Se aplica solo al
            cobrar y cada venta guarda el porcentaje de ese momento.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditando('nuevo')} sx={{ flexShrink: 0 }}>
          Cuotas
        </Button>
      </Stack>

      {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
      {isPending && <Typography color="text.secondary">Cargando…</Typography>}
      <List disablePadding>
        {data?.map((p) => (
          <ListItem
            key={p.id}
            divider
            secondaryAction={
              <IconButton edge="end" aria-label={`Editar ${nombrePlan(p)}`} onClick={() => setEditando(p)}>
                <EditIcon />
              </IconButton>
            }
          >
            <ListItemText
              primary={
                <Box component="span" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {nombrePlan(p)}
                  {!p.activo && <Chip label="No se acepta" size="small" />}
                </Box>
              }
              secondary={textoPorcentaje(p.porcentaje) ?? 'Sin recargo ni descuento'}
            />
          </ListItem>
        ))}
      </List>
      {editando && <PlanDialog plan={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)} />}
    </Paper>
  );
}

function PlanDialog({ plan, onClose }: { plan: PlanPago | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [cuotas, setCuotas] = useState('3');
  const [tipo, setTipo] = useState<Tipo>(!plan ? 'recargo' : plan.porcentaje < 0 ? 'descuento' : plan.porcentaje > 0 ? 'recargo' : 'ninguno');
  const [valor, setValor] = useState(plan && plan.porcentaje ? String(Math.abs(plan.porcentaje)).replace('.', ',') : '');
  const [activo, setActivo] = useState(plan?.activo ?? true);

  const guardar = useMutation({
    mutationFn: () => {
      const v = valor.trim().replace(/^-/, '');
      const porcentaje = tipo === 'ninguno' || !v ? '0' : tipo === 'descuento' ? `-${v}` : v;
      return plan
        ? api(`/planes-pago/${plan.id}`, { method: 'PUT', body: { porcentaje, activo } })
        : api('/planes-pago', { body: { cuotas, porcentaje, activo } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planes-pago'] });
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
        <DialogTitle>{plan ? nombrePlan(plan) : 'Nuevo plan de cuotas'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {!plan && (
              <TextField
                label="Cantidad de cuotas"
                value={cuotas}
                onChange={(e) => setCuotas(e.target.value.replace(/\D/g, '').slice(0, 2))}
                error={!!campos.cuotas}
                helperText={campos.cuotas}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            )}
            <TextField select label="Al pagar así" value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
              <MenuItem value="ninguno">Se cobra el precio normal</MenuItem>
              <MenuItem value="recargo">Se cobra un recargo</MenuItem>
              <MenuItem value="descuento">Se hace un descuento</MenuItem>
            </TextField>
            {tipo !== 'ninguno' && (
              <TextField
                label={tipo === 'recargo' ? 'Recargo' : 'Descuento'}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                error={!!campos.porcentaje}
                helperText={campos.porcentaje ?? (tipo === 'recargo' ? 'Ej: 15 → una venta de $ 10.000 se cobra $ 11.500' : 'Ej: 10 → una venta de $ 10.000 se cobra $ 9.000')}
                slotProps={{ htmlInput: { inputMode: 'decimal' }, input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
              />
            )}
            <FormControlLabel control={<Switch checked={activo} onChange={(e) => setActivo(e.target.checked)} />} label="Se acepta este medio de pago" />
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
