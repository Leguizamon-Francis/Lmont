import { createTheme } from '@mui/material/styles';
import { esES } from '@mui/material/locale';

export const theme = createTheme(
  {
    palette: {
      mode: 'light',
      primary: { main: '#1f2a37', contrastText: '#ffffff' },
      secondary: { main: '#a26b3c' },
      background: { default: '#f6f4f1', paper: '#ffffff' },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
      // Botones e inputs cómodos para usar con el dedo en el celular.
      MuiTextField: { defaultProps: { fullWidth: true } },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid #e7e2db' } } },
      MuiAppBar: { styleOverrides: { root: { border: 'none' } } },
      MuiDrawer: { styleOverrides: { paper: { border: 'none' } } },
    },
  },
  esES,
);
