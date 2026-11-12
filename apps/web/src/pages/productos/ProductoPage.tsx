import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  List,
  ListItemButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/EditOutlined';
import AddIcon from '@mui/icons-material/Add';
import QrCodeIcon from '@mui/icons-material/QrCode2';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { formatMonto, type PrecioHistorial, type ProductoDetalle, type Variante } from '@lmont/shared';
import { api, mensajeDeError } from '../../api/client';
import { useProducto } from '../../api/catalogo';
import { NoEncontradaPage } from '../NoEncontradaPage';
import { ProductoFormDialog } from './ProductoFormDialog';
import { AgregarVariantesDialog, EditarVarianteDialog } from './VarianteDialogs';

const fmtFecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export function ProductoPage() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const resaltada = Number(params.get('variante')) || null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: p, isPending, error } = useProducto(id);

  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [variante, setVariante] = useState<Variante | null>(null);

  const generar = useMutation({
    mutationFn: () => api<ProductoDetalle>(`/productos/${id}/codigos-internos`, { method: 'POST' }),
    onSuccess: (d) => qc.setQueryData(['producto', id], d),
  });

  if (!Number.isInteger(id) || id <= 0) return <NoEncontradaPage />;
  if (isPending) return <Typography color="text.secondary">Cargando…</Typography>;
  if (error || !p) return <Alert severity="error">{mensajeDeError(error)}</Alert>;

  const porColor = agrupar(p.variantes);
  const sinCodigo = p.variantes.filter((v) => !v.codigoBarras).length;

  return (
    <Stack spacing={2} sx={{ maxWidth: 1000 }}>
      <Box>
        <Button component={RouterLink} to="/productos" startIcon={<ArrowBackIcon />} sx={{ ml: -1 }}>
          Productos
        </Button>
      </Box>

      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
          <Box>
            <Typography color="text.secondary">{p.tipo.nombre}</Typography>
            <Typography variant="h4" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {p.nombre}
              {!p.activo && <Chip label="Inactivo" />}
            </Typography>
          </Box>
          <Box>
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditando(true)}>
              Editar
            </Button>
          </Box>
        </Stack>
        <Stack direction="row" spacing={4} sx={{ mt: 2 }}>
          <Dato titulo="Precio de venta" valor={formatMonto(p.precioVenta)} destacado />
          <Dato titulo="Precio de compra" valor={formatMonto(p.precioCompra)} />
          <Dato titulo="Stock total" valor={String(p.variantes.filter((v) => v.activo).reduce((s, v) => s + v.stock, 0))} />
        </Stack>
        {p.observaciones && (
          <Typography sx={{ mt: 2, whiteSpace: 'pre-line' }} color="text.secondary">
            {p.observaciones}
          </Typography>
        )}
      </Paper>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="h6" sx={{ mr: 'auto' }}>
          Variantes
        </Typography>
        {sinCodigo > 0 && (
          <Button startIcon={<QrCodeIcon />} onClick={() => generar.mutate()} loading={generar.isPending}>
            Generar {sinCodigo === 1 ? 'código interno' : `${sinCodigo} códigos internos`}
          </Button>
        )}
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAgregando(true)}>
          Agregar colores o talles
        </Button>
      </Stack>
      {generar.error && <Alert severity="error">{mensajeDeError(generar.error)}</Alert>}
      {sinCodigo > 0 && (
        <Typography variant="body2" color="text.secondary">
          Las variantes sin código de barras no se pueden escanear. Cargá el código de la etiqueta del proveedor o generá un
          código interno para imprimir.
        </Typography>
      )}

      {p.variantes.length === 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">Este producto todavía no tiene variantes. Agregá colores y talles.</Typography>
        </Paper>
      )}
      {porColor.map(([color, variantes]) => (
        <Paper key={color} sx={{ overflow: 'hidden' }}>
          <Typography sx={{ px: 2, py: 1.5, fontWeight: 600, bgcolor: 'action.hover' }}>{color}</Typography>
          <List disablePadding>
            {variantes.map((v) => (
              <ListItemButton
                key={v.id}
                divider
                onClick={() => setVariante(v)}
                selected={v.id === resaltada}
                sx={{ gap: 2, py: 1.25, opacity: v.activo ? 1 : 0.55 }}
              >
                <Typography sx={{ fontWeight: 600, minWidth: 48 }}>{v.talle.nombre}</Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace' }} color={v.codigoBarras ? undefined : 'text.secondary'}>
                    {v.codigoBarras ?? 'Sin código'}
                  </Typography>
                  {!v.activo && <Chip label="Inactiva" size="small" sx={{ mt: 0.5 }} />}
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 600 }} color={v.activo && v.stockMinimo > 0 && v.stock <= v.stockMinimo ? 'warning.main' : undefined}>
                    {v.stock} u.
                  </Typography>
                  {v.stockMinimo > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      mín. {v.stockMinimo}
                    </Typography>
                  )}
                </Box>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      ))}

      <HistorialPrecios productoId={id} />

      {editando && <ProductoFormDialog producto={p} onClose={() => setEditando(false)} onGuardado={() => setEditando(false)} />}
      {agregando && <AgregarVariantesDialog producto={p} onClose={() => setAgregando(false)} />}
      {variante && (
        <EditarVarianteDialog
          productoId={id}
          variante={variante}
          onClose={() => {
            setVariante(null);
            if (resaltada) navigate(`/productos/${id}`, { replace: true });
          }}
        />
      )}
    </Stack>
  );
}

function Dato({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {titulo}
      </Typography>
      <Typography variant={destacado ? 'h5' : 'h6'} sx={{ fontWeight: destacado ? 700 : 500 }}>
        {valor}
      </Typography>
    </Box>
  );
}

function agrupar(variantes: Variante[]): [string, Variante[]][] {
  const m = new Map<string, Variante[]>();
  for (const v of variantes) {
    const lista = m.get(v.color.nombre) ?? [];
    lista.push(v);
    m.set(v.color.nombre, lista);
  }
  return [...m];
}

function HistorialPrecios({ productoId }: { productoId: number }) {
  const [abierto, setAbierto] = useState(false);
  const { data, error } = useQuery({
    queryKey: ['precios', productoId],
    queryFn: () => api<PrecioHistorial[]>(`/productos/${productoId}/precios`),
    enabled: abierto,
  });
  return (
    <Accordion expanded={abierto} onChange={(_, v) => setAbierto(v)} disableGutters sx={{ '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>Historial de precios</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        {error && <Alert severity="error">{mensajeDeError(error)}</Alert>}
        {data && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Desde</TableCell>
                <TableCell align="right">Compra</TableCell>
                <TableCell align="right">Venta</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{fmtFecha.format(new Date(h.desde))}</TableCell>
                  <TableCell align="right">{formatMonto(h.precioCompra)}</TableCell>
                  <TableCell align="right">{formatMonto(h.precioVenta)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
