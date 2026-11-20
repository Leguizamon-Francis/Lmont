import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAddOutlined';
import type { Cliente, ListaClientes } from '@lmont/shared';
import { api } from '../api/client';
import { ClienteDialog } from '../pages/clientes/ClienteDialog';

/** Lo que se recuerda del cliente elegido (también en el borrador de la venta). */
export type ClienteElegido = Pick<Cliente, 'id' | 'nombre'> & { talles?: string[] };

type Opcion = ClienteElegido | { nuevo: string };
const esNuevo = (o: Opcion): o is { nuevo: string } => 'nuevo' in o;

/** Buscar un cliente por nombre o WhatsApp, o crearlo en el momento. Es opcional. */
export function ClienteSelector(props: {
  value: ClienteElegido | null;
  onChange: (c: ClienteElegido | null) => void;
  error?: string;
  label?: string;
  /** Ofrecer “Agregar cliente nuevo” (por defecto sí). */
  permitirCrear?: boolean;
}) {
  const permitirCrear = props.permitirCrear ?? true;
  const [texto, setTexto] = useState('');
  const [creando, setCreando] = useState<string | null>(null);
  const q = texto.trim();
  const { data, isFetching } = useQuery({
    queryKey: ['clientes', 'buscar', q],
    queryFn: () => api<ListaClientes>(`/clientes?activos=1&q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
  const encontrados: Opcion[] = q.length >= 2 ? (data?.clientes ?? []).map((c) => ({ id: c.id, nombre: c.nombre, talles: c.talles.map((t) => t.nombre) })) : [];
  const opciones: Opcion[] = permitirCrear ? [...encontrados, { nuevo: q }] : encontrados;

  return (
    <>
      <Autocomplete<Opcion>
        value={props.value}
        onChange={(_, o) => {
          if (o && esNuevo(o)) setCreando(o.nuevo);
          else props.onChange(o);
        }}
        inputValue={texto}
        onInputChange={(_, v) => setTexto(v)}
        options={opciones}
        filterOptions={(x) => x}
        loading={isFetching}
        getOptionLabel={(o) => (esNuevo(o) ? o.nuevo : o.nombre)}
        isOptionEqualToValue={(a, b) => !esNuevo(a) && !esNuevo(b) && a.id === b.id}
        getOptionKey={(o) => (esNuevo(o) ? 'nuevo' : o.id)}
        noOptionsText="Escribí el nombre o el WhatsApp"
        renderOption={({ key, ...p }, o) => (
          <Box component="li" key={key} {...p}>
            {esNuevo(o) ? (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', color: 'primary.main' }}>
                <PersonAddIcon fontSize="small" />
                {o.nuevo ? `Agregar “${o.nuevo}” como cliente nuevo` : 'Agregar un cliente nuevo'}
              </Box>
            ) : (
              <Box>
                <Typography>{o.nombre}</Typography>
                {!!o.talles?.length && (
                  <Typography variant="body2" color="text.secondary">
                    Talles: {o.talles.join(', ')}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={props.label ?? 'Cliente (opcional)'}
            error={!!props.error}
            helperText={props.error ?? (props.value?.talles?.length ? `Talles: ${props.value.talles.join(', ')}` : undefined)}
          />
        )}
      />
      {creando !== null && (
        <ClienteDialog
          nombreInicial={creando}
          onClose={() => setCreando(null)}
          onGuardado={(c) => props.onChange({ id: c.id, nombre: c.nombre, talles: c.talles.map((t) => t.nombre) })}
        />
      )}
    </>
  );
}
