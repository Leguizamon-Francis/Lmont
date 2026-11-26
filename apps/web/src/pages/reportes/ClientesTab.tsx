import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Box, Button, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { DIAS_INACTIVO, formatFecha, formatMes, formatMonto, linkWhatsapp, type ReporteClientes } from '@lmont/shared';
import { Ayuda, Barra, BotonExcel, pct, Seccion, Tabla, Tarjeta, Tarjetas, Vacio } from './comunes';
import { Contenido, useReporte } from './ReportesPage';
import { textoPeriodo, type Periodo } from './periodo';

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ClientesTab({ periodo }: { periodo: Periodo }) {
  const [inactivos, setInactivos] = useState<number>(90);
  const q = useReporte<ReporteClientes>('clientes', periodo, `&inactivos=${inactivos}`);
  return <Contenido q={q}>{(data) => <Clientes data={data} inactivos={inactivos} setInactivos={setInactivos} />}</Contenido>;
}

function Clientes({ data, inactivos, setInactivos }: { data: ReporteClientes; inactivos: number; setInactivos: (n: number) => void }) {
  const navigate = useNavigate();
  const [copiado, setCopiado] = useState<string | null>(null);
  const r = data.resumen;
  const maxMes = Math.max(1, ...data.meses.map((m) => m.nuevos + m.recurrentes));

  const copiarInactivos = async () => {
    const texto = data.inactivos.clientes
      .filter((c) => c.whatsapp)
      .map((c) => `${c.nombre}: ${c.whatsapp}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado('Lista copiada (nombre y WhatsApp de los que tienen número cargado).');
    } catch {
      setCopiado('No se pudo copiar automáticamente.');
    }
  };

  const hojas = () => [
    {
      nombre: 'Mejores clientes',
      columnas: [
        { titulo: 'Cliente' },
        { titulo: 'WhatsApp' },
        { titulo: 'Compras', tipo: 'numero' as const },
        { titulo: 'Prendas', tipo: 'numero' as const },
        { titulo: 'Importe', tipo: 'moneda' as const },
        { titulo: 'Ticket promedio', tipo: 'moneda' as const },
        { titulo: 'Última compra' },
      ],
      filas: data.mejores.map((c) => [c.nombre, c.whatsapp, c.compras, c.prendas, c.importe, c.ticketPromedio, formatFecha(c.ultima)]),
    },
    {
      nombre: `Sin comprar hace ${data.inactivos.dias} días`,
      columnas: [
        { titulo: 'Cliente' },
        { titulo: 'WhatsApp' },
        { titulo: 'Última compra' },
        { titulo: 'Días', tipo: 'numero' as const },
        { titulo: 'Compras (total)', tipo: 'numero' as const },
        { titulo: 'Importe (total)', tipo: 'moneda' as const },
      ],
      filas: data.inactivos.clientes.map((c) => [c.nombre, c.whatsapp, formatFecha(c.ultima), c.dias, c.compras, c.importe]),
    },
    {
      nombre: 'Nuevos y recurrentes',
      columnas: [{ titulo: 'Mes' }, { titulo: 'Nuevos', tipo: 'numero' as const }, { titulo: 'Volvieron', tipo: 'numero' as const }, { titulo: 'Ventas sin cliente', tipo: 'numero' as const }],
      filas: data.meses.map((m) => [capital(formatMes(m.mes)), m.nuevos, m.recurrentes, m.sinCliente]),
    },
  ];

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography color="text.secondary">Clientes {textoPeriodo(data)}</Typography>
        <BotonExcel archivo={`Clientes ${data.desde} a ${data.hasta}`} hojas={hojas} />
      </Stack>

      <Tarjetas>
        <Tarjeta titulo="Clientes que compraron" valor={String(r.clientesDistintos)}>
          <Typography variant="body2" color="text.secondary">
            {r.nuevos} {r.nuevos === 1 ? 'compró' : 'compraron'} por primera vez
          </Typography>
        </Tarjeta>
        <Tarjeta titulo="Ventas con cliente cargado" valor={r.ventas ? pct(Math.round((r.conCliente / r.ventas) * 1000) / 10) : '—'}>
          <Typography variant="body2" color="text.secondary">
            {r.conCliente} de {r.ventas} ventas
          </Typography>
        </Tarjeta>
      </Tarjetas>
      {r.ventas > 0 && r.conCliente / r.ventas < 0.5 && (
        <Alert severity="info">
          Menos de la mitad de las ventas tienen el cliente cargado: estos números van a ser más útiles cuanto más se carguen.
        </Alert>
      )}

      <Seccion titulo="Mejores clientes">
        {data.mejores.length === 0 ? (
          <Vacio>No hubo ventas con cliente en este período.</Vacio>
        ) : (
          <Tabla
            clave={(c) => c.clienteId}
            filas={data.mejores}
            onClick={(c) => navigate(`/clientes/${c.clienteId}`)}
            columnas={[
              { titulo: 'Cliente', valor: (c) => c.nombre },
              { titulo: 'Compras', derecha: true, valor: (c) => c.compras },
              { titulo: 'Prendas', derecha: true, secundaria: true, valor: (c) => c.prendas },
              { titulo: 'Importe', derecha: true, valor: (c) => <b>{formatMonto(c.importe)}</b> },
              { titulo: 'Ticket', derecha: true, secundaria: true, valor: (c) => formatMonto(c.ticketPromedio) },
              { titulo: 'Última compra', derecha: true, secundaria: true, valor: (c) => formatFecha(c.ultima) },
            ]}
          />
        )}
      </Seccion>

      <Seccion
        titulo="Clientes que no vuelven"
        extra={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField select size="small" value={inactivos} onChange={(e) => setInactivos(Number(e.target.value))} sx={{ width: 240 }} aria-label="Sin comprar hace">
              {DIAS_INACTIVO.map((d) => (
                <MenuItem key={d} value={d}>
                  Sin comprar hace {d === 365 ? 'un año' : `${d} días`}
                </MenuItem>
              ))}
            </TextField>
            {data.inactivos.clientes.some((c) => c.whatsapp) && (
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={copiarInactivos}>
                Copiar
              </Button>
            )}
          </Stack>
        }
      >
        <Ayuda>Clientes que compraron alguna vez pero no volvieron hace más de {data.inactivos.dias} días (no depende del período elegido arriba). Buenos para mandarles novedades o una promo.</Ayuda>
        {copiado && (
          <Alert severity="info" sx={{ mx: 2, mt: 1 }} onClose={() => setCopiado(null)}>
            {copiado}
          </Alert>
        )}
        {data.inactivos.clientes.length === 0 ? (
          <Vacio>Todos los clientes compraron en los últimos {data.inactivos.dias} días.</Vacio>
        ) : (
          <Tabla
            clave={(c) => c.clienteId}
            filas={data.inactivos.clientes}
            onClick={(c) => navigate(`/clientes/${c.clienteId}`)}
            columnas={[
              { titulo: 'Cliente', valor: (c) => c.nombre },
              { titulo: 'Última compra', derecha: true, valor: (c) => `hace ${c.dias} días` },
              { titulo: 'Compró en total', derecha: true, secundaria: true, valor: (c) => `${formatMonto(c.importe)} (${c.compras})` },
              {
                titulo: 'WhatsApp',
                derecha: true,
                valor: (c) =>
                  c.whatsapp ? (
                    <IconButton
                      size="small"
                      color="success"
                      href={linkWhatsapp(c.whatsapp)}
                      target="_blank"
                      rel="noopener"
                      aria-label={`WhatsApp de ${c.nombre}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <WhatsAppIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        )}
      </Seccion>

      <Seccion titulo="Clientes nuevos y que vuelven, mes a mes">
        <Ayuda>
          Nuevos: compraron por primera vez ese mes. Volvieron: ya habían comprado antes. Últimos 12 meses hasta {capital(formatMes(data.hasta.slice(0, 7)))}.
        </Ayuda>
        <Stack spacing={1.25} sx={{ p: 2 }}>
          {[...data.meses].reverse().map((m) => (
            <Box key={m.mes}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {capital(formatMes(m.mes))}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                  {m.nuevos} nuevos · {m.recurrentes} volvieron{m.sinCliente ? ` · ${m.sinCliente} ventas sin cliente` : ''}
                </Typography>
              </Stack>
              <Barra valor={m.nuevos + m.recurrentes} max={maxMes} />
            </Box>
          ))}
        </Stack>
      </Seccion>
    </>
  );
}
