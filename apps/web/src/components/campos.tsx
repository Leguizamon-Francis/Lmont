import { forwardRef } from 'react';
import { Box, Chip, FormHelperText, InputAdornment, TextField, Typography, type TextFieldProps } from '@mui/material';
import type { ItemLista } from '@lmont/shared';

/** Campo de monto en pesos. Acepta "15.000" o "15000,50"; en el celular abre el teclado numérico. */
export const MontoField = forwardRef<HTMLDivElement, TextFieldProps>(function MontoField(props, ref) {
  return (
    <TextField
      ref={ref}
      {...props}
      slotProps={{
        ...props.slotProps,
        htmlInput: { inputMode: 'decimal', autoComplete: 'off' },
        input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
      }}
    />
  );
});

/** Elegir varios elementos de una lista (colores, talles) tocando chips. */
export function SelectorChips(props: {
  titulo: string;
  opciones: ItemLista[] | undefined;
  /** Ids elegidos (el esquema los acepta como `unknown` porque los convierte a número). */
  value: readonly unknown[];
  onChange: (ids: number[]) => void;
  error?: string;
  /** Ids que ya existen: se muestran marcados y no se pueden quitar. */
  bloqueados?: number[];
}) {
  const { opciones, onChange } = props;
  const value = props.value.map(Number);
  const bloqueados = new Set(props.bloqueados ?? []);
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }} color={props.error ? 'error' : undefined}>
        {props.titulo}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {opciones?.map((o) => {
          const bloqueado = bloqueados.has(o.id);
          const elegido = bloqueado || value.includes(o.id);
          return (
            <Chip
              key={o.id}
              label={o.nombre}
              color={elegido ? 'primary' : 'default'}
              variant={elegido ? 'filled' : 'outlined'}
              disabled={bloqueado}
              onClick={() => toggle(o.id)}
              sx={{ minHeight: 36, fontSize: 15 }}
            />
          );
        })}
        {opciones?.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No hay opciones cargadas. Agregalas en Configuración.
          </Typography>
        )}
      </Box>
      {props.error && <FormHelperText error>{props.error}</FormHelperText>}
    </Box>
  );
}
