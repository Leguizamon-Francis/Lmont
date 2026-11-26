import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCameraOutlined';
import { avisarLectura, camaraDisponible, errorDeCamara, filtrarRepetidos, iniciarLector, prepararSonido } from '../escaner/camara';
import { esComputadora } from '../escaner/remoto';

/** Qué pasó con un código leído, para mostrarlo debajo de la cámara. */
export type Resultado = { ok: boolean; texto: string };

/** Vista de la cámara leyendo códigos. Se apaga sola al salir de la pantalla. */
export function CamaraEnVivo({ onCodigo, pausada = false }: { onCodigo: (codigo: string) => void; pausada?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onCodigo);
  useEffect(() => {
    cb.current = onCodigo;
  });
  const [estado, setEstado] = useState<{ tipo: 'prendiendo' | 'lista' } | { tipo: 'error'; texto: string }>({ tipo: 'prendiendo' });
  const [intento, setIntento] = useState(0);
  const disponible = camaraDisponible();

  useEffect(() => {
    if (pausada || !disponible || !video.current) return;
    let cancelado = false;
    let apagar: (() => void) | null = null;
    setEstado({ tipo: 'prendiendo' });
    iniciarLector(video.current, filtrarRepetidos((c) => cb.current(c))).then(
      (f) => {
        if (cancelado) return f();
        apagar = f;
        setEstado({ tipo: 'lista' });
      },
      (e: unknown) => !cancelado && setEstado({ tipo: 'error', texto: errorDeCamara(e) }),
    );
    return () => {
      cancelado = true;
      apagar?.();
    };
  }, [pausada, intento, disponible]);

  if (!disponible) {
    return (
      <Alert severity="warning">
        La cámara solo funciona entrando a L&apos;Mont por la dirección segura (la que empieza con https).
      </Alert>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        bgcolor: '#000',
        borderRadius: 2,
        overflow: 'hidden',
        aspectRatio: '4 / 3',
        maxHeight: '60dvh',
        width: '100%',
        mx: 'auto',
      }}
    >
      <Box
        component="video"
        ref={video}
        playsInline
        muted
        autoPlay
        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: pausada ? 0.3 : 1 }}
      />
      {/* Guía para apuntar */}
      {estado.tipo === 'lista' && !pausada && (
        <Box
          sx={{
            position: 'absolute',
            inset: '30% 10%',
            border: '2px solid rgba(255,255,255,0.85)',
            borderRadius: 2,
            pointerEvents: 'none',
            '&::after': { content: '""', position: 'absolute', left: 8, right: 8, top: '50%', height: 2, bgcolor: 'error.main', opacity: 0.8 },
          }}
        />
      )}
      {estado.tipo === 'prendiendo' && !pausada && (
        <CircularProgress sx={{ position: 'absolute', top: '50%', left: '50%', mt: -2.5, ml: -2.5, color: '#fff' }} />
      )}
      {pausada && (
        <Typography sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff' }}>Cámara en pausa</Typography>
      )}
      {estado.tipo === 'error' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 2 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </Button>
            }
          >
            {estado.texto}
          </Alert>
        </Box>
      )}
    </Box>
  );
}

/**
 * Diálogo con la cámara. `continuo`: queda abierto para leer varias prendas seguidas;
 * si no, se cierra con la primera lectura que sale bien.
 */
export function EscanerCamaraDialog(props: {
  titulo?: string;
  continuo?: boolean;
  onCodigo: (codigo: string) => Promise<Resultado> | Resultado;
  onClose: () => void;
}) {
  const theme = useTheme();
  const celular = useMediaQuery(theme.breakpoints.down('sm'));
  const [ultimo, setUltimo] = useState<Resultado | null>(null);
  // Los códigos se procesan de a uno, en el orden en que se leyeron.
  const cola = useRef(Promise.resolve());
  const cerrado = useRef(false);

  const leer = (codigo: string) => {
    cola.current = cola.current.then(async () => {
      if (cerrado.current) return;
      let r: Resultado;
      try {
        r = await props.onCodigo(codigo);
      } catch {
        r = { ok: false, texto: `No se pudo procesar el código ${codigo}` };
      }
      avisarLectura(r.ok);
      setUltimo(r);
      if (r.ok && !props.continuo) {
        cerrado.current = true;
        props.onClose();
      }
    });
  };

  return (
    <Dialog open onClose={props.onClose} fullScreen={celular} fullWidth maxWidth="sm">
      <DialogTitle>{props.titulo ?? 'Escanear con la cámara'}</DialogTitle>
      <DialogContent>
        <CamaraEnVivo onCodigo={leer} />
        <Box sx={{ mt: 2, minHeight: 56 }}>
          {ultimo ? (
            <Alert severity={ultimo.ok ? 'success' : 'warning'}>{ultimo.texto}</Alert>
          ) : (
            <Typography color="text.secondary">Apuntá al código de barras de la etiqueta.</Typography>
          )}
          {props.continuo && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Podés leer varias prendas seguidas. Para leer otra igual, apartá la cámara un segundo y volvé a apuntar.
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={props.onClose}>
          Listo
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Botón con ícono de cámara para poner al lado de un campo de código. No aparece si no hay cámara. */
export function BotonCamara(props: { titulo?: string; continuo?: boolean; onCodigo: (codigo: string) => Promise<Resultado> | Resultado }) {
  const [abierto, setAbierto] = useState(false);
  if (!camaraDisponible()) return null;
  return (
    <>
      <Tooltip title="Escanear con la cámara">
        <IconButton
          edge="end"
          aria-label="Escanear con la cámara"
          onClick={() => {
            prepararSonido();
            setAbierto(true);
          }}
        >
          <PhotoCameraIcon />
        </IconButton>
      </Tooltip>
      {abierto && <EscanerCamaraDialog {...props} onClose={() => setAbierto(false)} />}
    </>
  );
}

/** Recordatorio en la notebook de que se puede escanear con el celular. */
export function AyudaCelular() {
  if (!esComputadora()) return null;
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
      ¿Sin lector? Abrí L&apos;Mont en el celular, entrá a <b>Escáner</b> y apuntá al código: aparece acá.
    </Typography>
  );
}
