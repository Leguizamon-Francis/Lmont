import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import type { CantidadInicial, ItemLista } from '@lmont/shared';

/** Cantidades por combinación, con clave "colorId-talleId". Vacío = 0. */
export type Cantidades = Record<string, string>;

export const claveCombinacion = (colorId: number, talleId: number) => `${colorId}-${talleId}`;

/** Arma la lista para la API con las combinaciones elegidas que tienen unidades. */
export function cantidadesParaApi(c: Cantidades, colorIds: number[], talleIds: number[], excluir?: Set<string>): CantidadInicial[] {
  return colorIds.flatMap((colorId) =>
    talleIds
      .map((talleId) => ({ colorId, talleId, cantidad: Number(c[claveCombinacion(colorId, talleId)] || 0) }))
      .filter((x) => x.cantidad > 0 && !excluir?.has(claveCombinacion(x.colorId, x.talleId))),
  );
}

/**
 * Grilla para cargar cuántas unidades hay de cada color × talle.
 * Las combinaciones en `existentes` ya están cargadas: se muestran sin campo.
 */
export function CantidadesGrid(props: {
  colores: ItemLista[];
  talles: ItemLista[];
  value: Cantidades;
  onChange: (c: Cantidades) => void;
  existentes?: Set<string>;
}) {
  const { colores, talles, value, onChange, existentes } = props;
  const [todas, setTodas] = useState('');
  if (colores.length === 0 || talles.length === 0) return null;

  const editables = colores.flatMap((c) => talles.map((t) => claveCombinacion(c.id, t.id))).filter((k) => !existentes?.has(k));
  if (editables.length === 0) return null;
  const total = editables.reduce((s, k) => s + Number(value[k] || 0), 0);
  const soloDigitos = (s: string) => s.replace(/\D/g, '').slice(0, 5);

  return (
    <Box>
      <Typography variant="subtitle2">Unidades de cada uno</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Cuántas prendas hay de cada color y talle. Lo que quede vacío arranca en 0.
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
        <TextField
          size="small"
          label="Misma cantidad para todas"
          value={todas}
          onChange={(e) => setTodas(soloDigitos(e.target.value))}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          sx={{ maxWidth: 220 }}
        />
        <Button
          variant="outlined"
          disabled={todas === ''}
          onClick={() => onChange({ ...value, ...Object.fromEntries(editables.map((k) => [k, todas])) })}
          sx={{ height: 40, flexShrink: 0 }}
        >
          Aplicar
        </Button>
      </Stack>

      <Stack spacing={1.5}>
        {colores.map((c) => (
          <Box key={c.id}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
              {c.nombre}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {talles.map((t) => {
                const k = claveCombinacion(c.id, t.id);
                if (existentes?.has(k)) {
                  return (
                    <Box key={k} sx={{ width: 72, textAlign: 'center', alignSelf: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        {t.nombre}: ya existe
                      </Typography>
                    </Box>
                  );
                }
                return (
                  <TextField
                    key={k}
                    size="small"
                    label={t.nombre}
                    value={value[k] ?? ''}
                    placeholder="0"
                    onChange={(e) => onChange({ ...value, [k]: soloDigitos(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `${c.nombre} talle ${t.nombre}`, style: { textAlign: 'center' } } }}
                    sx={{ width: 72 }}
                  />
                );
              })}
            </Box>
          </Box>
        ))}
      </Stack>
      <Typography sx={{ mt: 1.5, fontWeight: 600 }}>
        Total: {total} {total === 1 ? 'unidad' : 'unidades'}
      </Typography>
    </Box>
  );
}
