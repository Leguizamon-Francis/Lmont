import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { DIAS_REPOSICION, formatFecha, formatMonto, type DistribucionTipo, type ReporteMercaderia } from '@lmont/shared';
import { Fila } from '../../components/resumen';
import { Ayuda, Barra, BotonExcel, decimal, pct, prendas, Seccion, Tabla, Tarjeta, Tarjetas, Vacio, vendidas } from './comunes';
import { Contenido, useReporte } from './ReportesPage';
import { textoPeriodo, type Periodo } from './periodo';

const dias = (n: number | null) => (n === null ? '—' : n > 365 ? 'más de un año' : `${n} ${n === 1 ? 'día' : 'días'}`);

export function MercaderiaTab({ periodo }: { periodo: Periodo }) {
  const q = useReporte<ReporteMercaderia>('mercaderia', periodo);
  return <Contenido q={q}>{(data) => <Mercaderia data={data} />}</Contenido>;
}

/** Talles (o colores) de cada tipo de prenda: qué parte de lo vendido se llevó cada uno y cuánto queda. */
function Distribucion({ grupos, que }: { grupos: DistribucionTipo[]; que: string }) {
  if (!grupos.length) return <Vacio>No hay ventas ni stock para mostrar.</Vacio>;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, p: 2 }}>
      {grupos.map((g) => {
        // Colores: los 8 que más se venden; el resto se suma en "Otros".
        const filas = que === 'color' && g.filas.length > 8
          ? [
              ...[...g.filas].sort((a, b) => b.unidades - a.unidades).slice(0, 7),
              [...g.filas].sort((a, b) => b.unidades - a.unidades).slice(7).reduce((o, f) => ({ nombre: 'Otros', unidades: o.unidades + f.unidades, stock: o.stock + f.stock }), { nombre: 'Otros', unidades: 0, stock: 0 }),
            ]
          : g.filas;
        const max = Math.max(1, ...filas.map((f) => f.unidades));
        return (
          <Box key={g.tipo}>
            <Typography sx={{ fontWeight: 600 }}>
              {g.tipo}{' '}
              <Typography component="span" variant="body2" color="text.secondary">
                · {vendidas(g.unidades)}
              </Typography>
            </Typography>
            <Stack spacing={0.75} sx={{ mt: 1 }}>
              {filas.map((f) => (
                <Box key={f.nombre}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }}>
                      {f.nombre}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {g.unidades ? `${pct(Math.round((f.unidades / g.unidades) * 1000) / 10)} · ` : ''}
                      {vendidas(f.unidades)} · quedan {f.stock}
                    </Typography>
                  </Stack>
                  <Barra valor={f.unidades} max={max} />
                </Box>
              ))}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

function Mercaderia({ data }: { data: ReporteMercaderia }) {
  const navigate = useNavigate();
  const [copiado, setCopiado] = useState<string | null>(null);
  const vendido = data.porTipo.reduce((s, t) => ({ unidades: s.unidades + t.unidades, importe: s.importe + t.importe, ganancia: s.ganancia + t.ganancia }), {
    unidades: 0,
    importe: 0,
    ganancia: 0,
  });
  const margen = vendido.importe ? Math.round((vendido.ganancia / vendido.importe) * 1000) / 10 : 0;
  const parada = data.sinVentas.reduce((s, p) => s + p.valorStock, 0);

  const copiarReposicion = async () => {
    const porProducto = new Map<string, string[]>();
    for (const r of data.reponer) porProducto.set(`${r.tipo} ${r.producto}`, [...(porProducto.get(`${r.tipo} ${r.producto}`) ?? []), `${r.color} ${r.talle} × ${r.sugerido}`]);
    const texto = [...porProducto].map(([p, vs]) => `• ${p}: ${vs.join(', ')}`).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado('Lista copiada. Pegala en el WhatsApp del proveedor.');
    } catch {
      setCopiado('No se pudo copiar automáticamente.');
    }
  };

  const hojas = () => [
    {
      nombre: 'Por tipo',
      columnas: [
        { titulo: 'Tipo' },
        { titulo: 'Vendidas', tipo: 'numero' as const },
        { titulo: 'Importe', tipo: 'moneda' as const },
        { titulo: 'Costo', tipo: 'moneda' as const },
        { titulo: 'Ganancia', tipo: 'moneda' as const },
        { titulo: 'Margen', tipo: 'porcentaje' as const },
        { titulo: 'Stock', tipo: 'numero' as const },
      ],
      filas: data.porTipo.map((t) => [t.tipo, t.unidades, t.importe, t.costo, t.ganancia, t.margen, t.stock]),
    },
    {
      nombre: 'Talles',
      columnas: [{ titulo: 'Tipo' }, { titulo: 'Talle' }, { titulo: 'Vendidas', tipo: 'numero' as const }, { titulo: 'Stock', tipo: 'numero' as const }],
      filas: data.talles.flatMap((g) => g.filas.map((f) => [g.tipo, f.nombre, f.unidades, f.stock])),
    },
    {
      nombre: 'Colores',
      columnas: [{ titulo: 'Tipo' }, { titulo: 'Color' }, { titulo: 'Vendidas', tipo: 'numero' as const }, { titulo: 'Stock', tipo: 'numero' as const }],
      filas: data.colores.flatMap((g) => g.filas.map((f) => [g.tipo, f.nombre, f.unidades, f.stock])),
    },
    {
      nombre: 'Productos',
      columnas: [
        { titulo: 'Tipo' },
        { titulo: 'Producto' },
        { titulo: 'Vendidas', tipo: 'numero' as const },
        { titulo: 'Importe', tipo: 'moneda' as const },
        { titulo: 'Ganancia', tipo: 'moneda' as const },
        { titulo: 'Margen', tipo: 'porcentaje' as const },
        { titulo: 'Stock', tipo: 'numero' as const },
        { titulo: 'Por día', tipo: 'decimal' as const },
        { titulo: 'Alcanza para (días)', tipo: 'numero' as const },
      ],
      filas: data.productos.map((p) => [p.tipo, p.producto, p.unidades, p.importe, p.ganancia, p.margen, p.stock, p.porDia, p.cobertura]),
    },
    {
      nombre: 'Reponer',
      columnas: [
        { titulo: 'Tipo' },
        { titulo: 'Producto' },
        { titulo: 'Color' },
        { titulo: 'Talle' },
        { titulo: 'Vendidas', tipo: 'numero' as const },
        { titulo: 'Quedan', tipo: 'numero' as const },
        { titulo: 'Alcanza para (días)', tipo: 'numero' as const },
        { titulo: 'Pedir', tipo: 'numero' as const },
      ],
      filas: data.reponer.map((r) => [r.tipo, r.producto, r.color, r.talle, r.vendidas, r.stock, r.cobertura, r.sugerido]),
    },
    {
      nombre: 'Sin ventas',
      columnas: [{ titulo: 'Tipo' }, { titulo: 'Producto' }, { titulo: 'Stock', tipo: 'numero' as const }, { titulo: 'Valor (costo)', tipo: 'moneda' as const }, { titulo: 'Última venta' }],
      filas: data.sinVentas.map((p) => [p.tipo, p.producto, p.stock, p.valorStock, p.ultimaVenta ? formatFecha(p.ultimaVenta) : 'Nunca']),
    },
    {
      nombre: 'Proveedores',
      columnas: [
        { titulo: 'Proveedor' },
        { titulo: 'Comprado', tipo: 'moneda' as const },
        { titulo: 'Prendas compradas', tipo: 'numero' as const },
        { titulo: 'Vendidas', tipo: 'numero' as const },
        { titulo: 'Importe vendido', tipo: 'moneda' as const },
        { titulo: 'Ganancia', tipo: 'moneda' as const },
        { titulo: 'Margen', tipo: 'porcentaje' as const },
      ],
      filas: data.porProveedor.map((p) => [p.proveedor, p.comprado, p.unidadesCompradas, p.vendidas, p.importe, p.ganancia, p.margen]),
    },
    {
      nombre: 'Valor del stock',
      columnas: [{ titulo: 'Tipo' }, { titulo: 'Prendas', tipo: 'numero' as const }, { titulo: 'A costo', tipo: 'moneda' as const }, { titulo: 'A precio de venta', tipo: 'moneda' as const }],
      filas: [...data.stock.porTipo.map((t) => [t.tipo, t.unidades, t.costo, t.venta]), ['Total', data.stock.unidades, data.stock.costo, data.stock.venta]],
    },
    {
      nombre: 'Pérdidas',
      columnas: [
        { titulo: 'Fecha' },
        { titulo: 'Producto' },
        { titulo: 'Color' },
        { titulo: 'Talle' },
        { titulo: 'Cantidad', tipo: 'numero' as const },
        { titulo: 'Motivo' },
        { titulo: 'Valor (costo)', tipo: 'moneda' as const },
      ],
      filas: data.perdidas.detalle.map((p) => [formatFecha(p.fecha), p.producto, p.color, p.talle, p.cantidad, p.motivo, p.valor]),
    },
  ];

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography color="text.secondary">Mercadería {textoPeriodo(data)}</Typography>
        <BotonExcel archivo={`Mercaderia ${data.desde} a ${data.hasta}`} hojas={hojas} />
      </Stack>

      <Tarjetas>
        <Tarjeta titulo="Prendas vendidas" valor={String(vendido.unidades)}>
          <Typography variant="body2" color="text.secondary">
            {formatMonto(vendido.importe)}
          </Typography>
        </Tarjeta>
        <Tarjeta titulo="Margen promedio" valor={pct(margen)}>
          <Typography variant="body2" color="text.secondary">
            Ganancia {formatMonto(vendido.ganancia)}
          </Typography>
        </Tarjeta>
        <Tarjeta titulo="Valor del stock hoy" valor={formatMonto(data.stock.costo)}>
          <Typography variant="body2" color="text.secondary">
            {data.stock.unidades} prendas · a precio de venta {formatMonto(data.stock.venta)}
          </Typography>
        </Tarjeta>
        <Tarjeta titulo="Pérdidas por ajustes" valor={formatMonto(Math.max(0, data.perdidas.valor))} color={data.perdidas.valor > 0 ? 'error' : undefined}>
          <Typography variant="body2" color="text.secondary">
            {data.perdidas.unidades > 0 ? `${prendas(data.perdidas.unidades)} menos` : 'Sin faltantes'}
          </Typography>
        </Tarjeta>
      </Tarjetas>

      <Seccion
        titulo="Qué reponer"
        extra={
          data.reponer.length > 0 && (
            <Button size="small" startIcon={<ContentCopyIcon />} onClick={copiarReposicion}>
              Copiar lista para pedir
            </Button>
          )
        }
      >
        <Ayuda>
          Lo que se vende y no alcanza para los próximos {DIAS_REPOSICION} días al ritmo de este período. “Pedir” es lo que falta para cubrirlos.
        </Ayuda>
        {copiado && (
          <Alert severity="info" sx={{ mx: 2, mt: 1 }} onClose={() => setCopiado(null)}>
            {copiado}
          </Alert>
        )}
        {data.reponer.length === 0 ? (
          <Vacio>Con lo que hay alcanza para los próximos {DIAS_REPOSICION} días.</Vacio>
        ) : (
          <Tabla
            clave={(r) => r.varianteId}
            filas={data.reponer}
            onClick={(r) => navigate(`/productos/${r.productoId}`)}
            columnas={[
              { titulo: 'Prenda', valor: (r) => `${r.tipo} ${r.producto} · ${r.color} ${r.talle}` },
              { titulo: 'Vendidas', derecha: true, secundaria: true, valor: (r) => r.vendidas },
              { titulo: 'Quedan', derecha: true, valor: (r) => (r.stock <= 0 ? <Chip label="Sin stock" size="small" color="error" variant="outlined" /> : r.stock) },
              { titulo: 'Alcanza para', derecha: true, secundaria: true, valor: (r) => dias(r.cobertura) },
              { titulo: 'Pedir', derecha: true, valor: (r) => <b>{r.sugerido}</b> },
            ]}
          />
        )}
      </Seccion>

      <Seccion titulo="Por tipo de prenda">
        {data.porTipo.length === 0 ? (
          <Vacio>No hay productos con ventas ni stock.</Vacio>
        ) : (
          <Tabla
            clave={(t) => t.tipo}
            filas={data.porTipo}
            columnas={[
              { titulo: 'Tipo', valor: (t) => t.tipo },
              { titulo: 'Vendidas', derecha: true, valor: (t) => t.unidades },
              { titulo: 'Importe', derecha: true, valor: (t) => formatMonto(t.importe) },
              { titulo: 'Ganancia', derecha: true, secundaria: true, valor: (t) => formatMonto(t.ganancia) },
              { titulo: 'Margen', derecha: true, valor: (t) => (t.importe ? pct(t.margen) : '—') },
              { titulo: 'Stock', derecha: true, secundaria: true, valor: (t) => t.stock },
            ]}
          />
        )}
      </Seccion>

      <Seccion titulo="Talles por tipo de prenda">
        <Ayuda>Qué parte de lo vendido de cada tipo fue de cada talle, y cuánto queda. Sirve para decidir qué talles comprar.</Ayuda>
        <Distribucion grupos={data.talles} que="talle" />
      </Seccion>

      <Seccion titulo="Colores por tipo de prenda">
        <Distribucion grupos={data.colores} que="color" />
      </Seccion>

      <Seccion titulo="Productos: margen y rotación">
        {data.productos.length === 0 ? (
          <Vacio>No se vendió nada en este período.</Vacio>
        ) : (
          <>
            <Ayuda>“Alcanza para”: cuántos días dura el stock que queda si se sigue vendiendo como en este período.</Ayuda>
            <Tabla
              clave={(p) => p.productoId}
              filas={data.productos}
              onClick={(p) => navigate(`/productos/${p.productoId}`)}
              columnas={[
                { titulo: 'Producto', valor: (p) => `${p.tipo} ${p.producto}` },
                { titulo: 'Vendidas', derecha: true, valor: (p) => p.unidades },
                { titulo: 'Importe', derecha: true, secundaria: true, valor: (p) => formatMonto(p.importe) },
                { titulo: 'Ganancia', derecha: true, secundaria: true, valor: (p) => formatMonto(p.ganancia) },
                { titulo: 'Margen', derecha: true, valor: (p) => pct(p.margen) },
                { titulo: 'Stock', derecha: true, valor: (p) => p.stock },
                { titulo: 'Por día', derecha: true, secundaria: true, valor: (p) => (p.porDia < 0.1 ? 'menos de 0,1' : decimal(p.porDia)) },
                { titulo: 'Alcanza para', derecha: true, secundaria: true, valor: (p) => dias(p.cobertura) },
              ]}
            />
          </>
        )}
      </Seccion>

      <Seccion
        titulo="Lo que no se vende"
        extra={
          data.sinVentas.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {formatMonto(parada)} parados
            </Typography>
          )
        }
      >
        <Ayuda>Productos con stock que no se vendieron ni una vez {textoPeriodo(data)}. El monto es lo que costó la mercadería que queda.</Ayuda>
        {data.sinVentas.length === 0 ? (
          <Vacio>Todo lo que tiene stock se vendió al menos una vez.</Vacio>
        ) : (
          <Tabla
            clave={(p) => p.productoId}
            filas={data.sinVentas}
            onClick={(p) => navigate(`/productos/${p.productoId}`)}
            columnas={[
              { titulo: 'Producto', valor: (p) => `${p.tipo} ${p.producto}` },
              { titulo: 'Stock', derecha: true, valor: (p) => p.stock },
              { titulo: 'Última venta', derecha: true, secundaria: true, valor: (p) => (p.ultimaVenta ? formatFecha(p.ultimaVenta) : 'Nunca') },
              { titulo: 'Valor', derecha: true, valor: (p) => formatMonto(p.valorStock) },
            ]}
          />
        )}
      </Seccion>

      <Seccion titulo="Por proveedor">
        {data.porProveedor.length === 0 ? (
          <Vacio>No hubo compras ni ventas de mercadería de proveedores en este período.</Vacio>
        ) : (
          <>
            <Ayuda>
              Lo que se le compró a cada uno en el período, y lo que se vendió de sus productos (cada producto cuenta para el último proveedor que lo trajo).
            </Ayuda>
            <Tabla
              clave={(p) => p.proveedorId ?? 0}
              filas={data.porProveedor}
              columnas={[
                { titulo: 'Proveedor', valor: (p) => p.proveedor },
                { titulo: 'Comprado', derecha: true, valor: (p) => (p.comprado ? formatMonto(p.comprado) : '—') },
                { titulo: 'Prendas compradas', derecha: true, secundaria: true, valor: (p) => p.unidadesCompradas || '—' },
                { titulo: 'Vendidas', derecha: true, valor: (p) => p.vendidas },
                { titulo: 'Ganancia', derecha: true, secundaria: true, valor: (p) => formatMonto(p.ganancia) },
                { titulo: 'Margen', derecha: true, valor: (p) => (p.importe ? pct(p.margen) : '—') },
              ]}
            />
          </>
        )}
      </Seccion>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Box sx={{ flex: 1 }}>
          <Seccion titulo="Valor del stock hoy">
            <Ayuda>Lo que vale la mercadería que hay en el local: a lo que se compró y a lo que se vendería.</Ayuda>
            <Tabla
              clave={(t) => t.tipo}
              filas={data.stock.porTipo}
              columnas={[
                { titulo: 'Tipo', valor: (t) => t.tipo },
                { titulo: 'Prendas', derecha: true, valor: (t) => t.unidades },
                { titulo: 'A costo', derecha: true, valor: (t) => formatMonto(t.costo) },
                { titulo: 'A precio de venta', derecha: true, secundaria: true, valor: (t) => formatMonto(t.venta) },
              ]}
            />
            <Stack spacing={0.75} sx={{ p: 2 }}>
              <Fila texto="Total a costo" valor={formatMonto(data.stock.costo)} fuerte />
              <Fila texto="Total a precio de venta" valor={formatMonto(data.stock.venta)} fuerte />
              <Fila texto="Ganancia que hay en el stock" valor={formatMonto(data.stock.venta - data.stock.costo)} />
            </Stack>
          </Seccion>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Seccion titulo="Pérdidas por ajustes de stock">
            {data.perdidas.detalle.length === 0 ? (
              <Vacio>No hubo ajustes de stock en este período.</Vacio>
            ) : (
              <>
                <Ayuda>Ajustes hechos al contar, por roturas o robos. Valuados al precio de compra actual.</Ayuda>
                <Stack spacing={0.75} sx={{ p: 2 }}>
                  {data.perdidas.porMotivo.map((m) => (
                    <Fila
                      key={m.motivo}
                      texto={`${m.motivo} · ${m.unidades >= 0 ? `${prendas(m.unidades)} menos` : `${prendas(-m.unidades)} de más`}`}
                      valor={formatMonto(Math.abs(m.valor))}
                      color={m.valor > 0 ? 'error' : undefined}
                    />
                  ))}
                </Stack>
                <Tabla
                  clave={(_, i) => i}
                  filas={data.perdidas.detalle.slice(0, 50)}
                  columnas={[
                    { titulo: 'Fecha', valor: (p) => formatFecha(p.fecha) },
                    { titulo: 'Prenda', valor: (p) => `${p.producto} · ${p.color} ${p.talle}` },
                    { titulo: 'Cantidad', derecha: true, valor: (p) => (p.cantidad > 0 ? `+${p.cantidad}` : p.cantidad) },
                    { titulo: 'Motivo', secundaria: true, valor: (p) => p.motivo },
                  ]}
                />
              </>
            )}
          </Seccion>
        </Box>
      </Stack>
    </>
  );
}
