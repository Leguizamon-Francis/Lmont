import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';
import {
  hoy,
  MEDIOS_PAGO,
  montoParaInput,
  type ConceptoCaja,
  type MedioPago,
  type MovimientoCaja,
  type MovimientoCajaInput,
  type TipoCaja,
  type Vendedor,
} from '@lmont/shared';
import { api, ApiRequestError, mensajeDeError } from '../../api/client';
import { MontoField } from '../../components/campos';

type Props = {
  tipo: TipoCaja;
  /** Movimiento a editar (solo los cargados a mano). */
  movimiento?: MovimientoCaja;
  /** Día que se está mirando: el movimiento nuevo arranca con esa fecha. */
  fecha: string;
  onClose: () => void;
};

/** Cargar o editar un ingreso o gasto de caja. */
export function MovimientoCajaDialog({ tipo, movimiento: m, fecha, onClose }: Props) {
  const qc = useQueryClient();
  const conceptos = useQuery({ queryKey: ['caja', 'conceptos', 'todos'], queryFn: () => api<ConceptoCaja[]>('/caja/conceptos') });
  const vendedores = useQuery({ queryKey: ['vendedores', 'activos'], queryFn: () => api<Vendedor[]>('/vendedores?activos=1') });
  const opciones = conceptos.data?.filter((c) => c.tipo === tipo && (c.activo || c.id === m?.conceptoId)) ?? [];

  const [d, setD] = useState({
    conceptoId: m?.conceptoId ? String(m.conceptoId) : '',
    monto: m ? montoParaInput(m.monto) : '',
    medio: (m?.medio ?? 'EFECTIVO') as MedioPago,
    fecha: m?.fecha ?? (fecha > hoy() ? hoy() : fecha),
    detalle: m?.detalle ?? '',
    vendedorId: m?.vendedor ? String(m.vendedor.id) : '',
  });
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  const invalidar = () => qc.invalidateQueries({ queryKey: ['caja'] });
  const guardar = useMutation({
    mutationFn: () => {
      const body: MovimientoCajaInput = {
        tipo,
        conceptoId: d.conceptoId,
        monto: d.monto,
        medio: d.medio,
        fecha: d.fecha,
        detalle: d.detalle,
        vendedorId: d.vendedorId ? Number(d.vendedorId) : null,
      };
      return m ? api(`/caja/movimientos/${m.id}`, { method: 'PUT', body }) : api('/caja/movimientos', { body });
    },
    onSuccess: () => {
      invalidar();
      onClose();
    },
  });
  const borrar = useMutation({
    mutationFn: () => api(`/caja/movimientos/${m!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidar();
      onClose();
    },
  });
  const campos = guardar.error instanceof ApiRequestError ? (guardar.error.campos ?? {}) : {};
  const nombre = tipo === 'GASTO' ? 'gasto' : 'ingreso';

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <DialogTitle>{m ? `Editar ${nombre}` : `Cargar ${nombre}`}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              label="Concepto"
              value={d.conceptoId}
              onChange={(e) => setD({ ...d, conceptoId: e.target.value })}
              error={!!campos.conceptoId}
              helperText={campos.conceptoId ?? (conceptos.data && !opciones.length ? 'Cargá conceptos en Configuración → Conceptos de caja' : undefined)}
            >
              {opciones.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.nombre}
                </MenuItem>
              ))}
            </TextField>
            <MontoField
              autoFocus
              label="Monto"
              value={d.monto}
              onChange={(e) => setD({ ...d, monto: e.target.value })}
              error={!!campos.monto}
              helperText={campos.monto}
            />
            <Stack direction="row" spacing={2}>
              <TextField select label={tipo === 'GASTO' ? 'Se pagó con' : 'Entró en'} value={d.medio} onChange={(e) => setD({ ...d, medio: e.target.value as MedioPago })}>
                {(Object.keys(MEDIOS_PAGO) as MedioPago[]).map((x) => (
                  <MenuItem key={x} value={x}>
                    {MEDIOS_PAGO[x]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                type="date"
                label="Fecha"
                value={d.fecha}
                onChange={(e) => setD({ ...d, fecha: e.target.value })}
                error={!!campos.fecha}
                helperText={campos.fecha}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: hoy() } }}
              />
            </Stack>
            <TextField
              label="Detalle (opcional)"
              placeholder={tipo === 'GASTO' ? 'Ej: luz de octubre' : undefined}
              value={d.detalle}
              onChange={(e) => setD({ ...d, detalle: e.target.value })}
              error={!!campos.detalle}
              helperText={campos.detalle}
            />
            {!!vendedores.data?.length && (
              <TextField select label="Quién lo cargó (opcional)" value={d.vendedorId} onChange={(e) => setD({ ...d, vendedorId: e.target.value })}>
                <MenuItem value="">Sin especificar</MenuItem>
                {vendedores.data.map((v) => (
                  <MenuItem key={v.id} value={String(v.id)}>
                    {v.nombre}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {guardar.error && !Object.keys(campos).length && <Alert severity="error">{mensajeDeError(guardar.error)}</Alert>}
            {borrar.error && <Alert severity="error">{mensajeDeError(borrar.error)}</Alert>}
            {confirmarBorrar && (
              <Alert
                severity="warning"
                action={
                  <Button color="error" size="small" onClick={() => borrar.mutate()} loading={borrar.isPending}>
                    Borrar
                  </Button>
                }
              >
                ¿Borrar este {nombre}?
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {m && !confirmarBorrar && (
            <Button color="error" onClick={() => setConfirmarBorrar(true)} sx={{ mr: 'auto' }}>
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" loading={guardar.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
