import { useState } from 'react';
import { Alert, Box, Button, List, ListItem, ListItemText, Paper, Stack, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import WarningIcon from '@mui/icons-material/WarningAmberOutlined';
import type { EscaneoEnviado } from '@lmont/shared';
import { api, mensajeDeError } from '../api/client';
import { buscarPorCodigo, nombreVariante } from '../api/catalogo';
import { CamaraEnVivo } from '../components/Escaner';
import { avisarLectura, prepararSonido } from '../escaner/camara';

type Lectura = { id: number; codigo: string; prenda: string | null; ok: boolean; estado: string };

let siguienteId = 1;

/**
 * El celular como lector de códigos: cada código que ve la cámara se manda a la pantalla que
 * está abierta en la notebook (Vender, Ingreso de mercadería, Cambios, Productos…).
 */
export function EscanerPage() {
  const [encendida, setEncendida] = useState(false);
  const [lecturas, setLecturas] = useState<Lectura[]>([]);

  const leer = async (codigo: string) => {
    let lectura: Lectura;
    try {
      const [envio, prenda] = await Promise.all([
        api<EscaneoEnviado>('/escaner', { body: { codigo } }),
        buscarPorCodigo(codigo).catch(() => null),
      ]);
      const llego = envio.pantallas > 0;
      lectura = {
        id: siguienteId++,
        codigo,
        prenda: prenda ? nombreVariante(prenda) : null,
        ok: llego,
        estado: llego
          ? prenda
            ? 'Enviado a la notebook'
            : 'Enviado a la notebook (ese código no está cargado en ninguna prenda)'
          : 'No llegó: no hay ninguna pantalla abierta en la notebook. Abrí Vender, Ingreso o Cambios.',
      };
    } catch (e) {
      lectura = { id: siguienteId++, codigo, prenda: null, ok: false, estado: mensajeDeError(e) };
    }
    avisarLectura(lectura.ok);
    setLecturas((l) => [lectura, ...l].slice(0, 20));
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h4" sx={{ display: { xs: 'none', md: 'block' } }}>
        Escáner
      </Typography>
      <Typography color="text.secondary">
        Usá el celular como lector de códigos. En la notebook abrí Vender, Ingreso de mercadería o Cambios, con la misma cuenta, y apuntá
        el celular al código de la etiqueta: la prenda aparece en la notebook.
      </Typography>

      {encendida ? (
        <>
          <CamaraEnVivo onCodigo={(c) => void leer(c)} />
          <Typography variant="body2" color="text.secondary">
            Para leer otra prenda igual, apartá la cámara un segundo y volvé a apuntar.
          </Typography>
          <Button variant="outlined" onClick={() => setEncendida(false)} sx={{ alignSelf: 'flex-start' }}>
            Apagar cámara
          </Button>
        </>
      ) : (
        <Button
          variant="contained"
          size="large"
          onClick={() => {
            prepararSonido();
            setEncendida(true);
          }}
          sx={{ minHeight: 56 }}
        >
          Prender la cámara
        </Button>
      )}

      {lecturas.length > 0 && (
        <Paper sx={{ overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'action.hover' }}>
            <Typography sx={{ fontWeight: 600 }}>Últimas lecturas</Typography>
            <Button size="small" onClick={() => setLecturas([])}>
              Borrar
            </Button>
          </Box>
          <List disablePadding>
            {lecturas.map((l) => (
              <ListItem key={l.id} divider>
                {l.ok ? <CheckIcon color="success" sx={{ mr: 1.5 }} /> : <WarningIcon color="warning" sx={{ mr: 1.5 }} />}
                <ListItemText
                  primary={l.prenda ?? l.codigo}
                  secondary={
                    <>
                      {l.prenda && <Box component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{l.codigo}</Box>}
                      {l.estado}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {lecturas.length === 0 && encendida && <Alert severity="info">Todavía no se leyó ningún código.</Alert>}
    </Stack>
  );
}
