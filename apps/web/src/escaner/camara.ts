/**
 * Lectura de códigos de barras con la cámara (celular o notebook).
 * Usa el lector del navegador cuando existe (Chrome en Android, rápido) y si no la librería
 * ZXing (iPhone, notebooks), que se carga recién cuando se abre la cámara.
 */

type Detectado = { rawValue: string };
type Detector = { detect(fuente: HTMLVideoElement): Promise<Detectado[]> };
type DetectorConstructor = {
  new (opciones?: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/** Formatos de las etiquetas de ropa (EAN/UPC de fábrica y los Code 128/39/ITF de proveedores). */
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

const CODIGO_VALIDO = /^[0-9A-Za-z-]{1,40}$/;

/** La cámara solo se puede usar en páginas seguras (https o 127.0.0.1). */
export const camaraDisponible = () =>
  typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

async function detectorNativo(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (!BD) return null;
  try {
    const soportados = await BD.getSupportedFormats();
    const formats = FORMATOS.filter((f) => soportados.includes(f));
    return formats.includes('ean_13') ? new BD({ formats }) : null;
  } catch {
    return null;
  }
}

async function detectorZxing() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map<number, unknown>([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF],
    ],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
}

/**
 * Prende la cámara trasera en `video` y llama a `onCodigo` cada vez que ve un código
 * (mientras siga apuntando al mismo, lo repite: filtrar con `filtrarRepetidos`).
 * Devuelve la función para apagarla.
 */
export async function iniciarLector(video: HTMLVideoElement, onCodigo: (codigo: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  let apagada = false;
  let pararZxing: (() => void) | null = null;
  const apagar = () => {
    apagada = true;
    pararZxing?.();
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  const avisar = (texto: string) => {
    const c = texto.trim();
    if (!apagada && CODIGO_VALIDO.test(c)) onCodigo(c);
  };

  try {
    const nativo = await detectorNativo();
    if (nativo) {
      video.srcObject = stream;
      await video.play();
      const buscar = async () => {
        if (apagada) return;
        try {
          if (video.readyState >= 2) for (const d of await nativo.detect(video)) avisar(d.rawValue);
        } catch {
          // un cuadro que no se pudo analizar: se sigue con el próximo
        }
        if (!apagada) setTimeout(buscar, 150);
      };
      void buscar();
    } else {
      const lector = await detectorZxing();
      const controles = await lector.decodeFromStream(stream, video, (r) => r && avisar(r.getText()));
      pararZxing = () => controles.stop();
      if (apagada) controles.stop();
    }
  } catch (e) {
    apagar();
    throw e;
  }
  return apagar;
}

/**
 * La cámara ve el mismo código varias veces por segundo: lo deja pasar una sola vez mientras
 * siga a la vista. Para leer otra prenda igual, se aparta la cámara un momento.
 */
export function filtrarRepetidos(onCodigo: (codigo: string) => void, pausaMs = 1500) {
  let ultimo = '';
  let visto = 0;
  return (codigo: string) => {
    const ahora = Date.now();
    const repetido = codigo === ultimo && ahora - visto < pausaMs;
    visto = ahora;
    ultimo = codigo;
    if (!repetido) onCodigo(codigo);
  };
}

/** Texto para mostrar cuando no se pudo prender la cámara. */
export function errorDeCamara(e: unknown): string {
  const nombre = e instanceof DOMException ? e.name : '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError')
    return 'No hay permiso para usar la cámara. Permitilo desde el candado de la barra de direcciones y probá de nuevo.';
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No se encontró ninguna cámara en este dispositivo.';
  if (nombre === 'NotReadableError' || nombre === 'AbortError') return 'La cámara está siendo usada por otra app. Cerrala y probá de nuevo.';
  return 'No se pudo prender la cámara.';
}

// --- Aviso de lectura: pitido corto y vibración ---

let audio: AudioContext | null = null;

/** Llamar desde un toque del usuario (los navegadores no dejan sonar sin uno). */
export function prepararSonido() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

export function avisarLectura(ok = true) {
  navigator.vibrate?.(ok ? 60 : [60, 60, 60]);
  if (!audio || audio.state !== 'running') return;
  const osc = audio.createOscillator();
  const vol = audio.createGain();
  osc.frequency.value = ok ? 1500 : 400;
  vol.gain.value = 0.08;
  osc.connect(vol).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + (ok ? 0.08 : 0.25));
}
