import { createTheme } from '@mui/material/styles';
import { esES } from '@mui/material/locale';

/** Fondo del menú lateral y del login en modo oscuro (en claro usan primary.main). */
export const FONDO_MENU_OSCURO = '#12100e';

// Claro y oscuro con variables CSS: la elección (claro / oscuro / como el dispositivo)
// la guarda MUI en este navegador y se cambia desde Configuración > Apariencia.
export const theme = createTheme(
  {
    cssVariables: { colorSchemeSelector: 'class' },
    colorSchemes: {
      light: {
        palette: {
          primary: { main: '#1f2a37', contrastText: '#ffffff' },
          secondary: { main: '#a26b3c' },
          background: { default: '#f6f4f1', paper: '#ffffff' },
        },
      },
      dark: {
        palette: {
          primary: { main: '#dcd4c8', contrastText: '#1f2a37' },
          secondary: { main: '#d29a68' },
          background: { default: '#191714', paper: '#23201c' },
          divider: 'rgba(255,255,255,0.1)',
        },
      },
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
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({
            border: '1px solid #e7e2db',
            ...theme.applyStyles('dark', { borderColor: 'rgba(255,255,255,0.1)', backgroundImage: 'none' }),
          }),
        },
      },
      MuiAppBar: { styleOverrides: { root: { border: 'none' } } },
      MuiDrawer: { styleOverrides: { paper: { border: 'none' } } },
    },
  },
  esES,
);
