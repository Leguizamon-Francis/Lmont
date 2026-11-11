import { useState } from 'react';
import { Link as RouterLink, Navigate, Outlet, useLocation } from 'react-router';
import {
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import { MENU } from './menu';
import { useLogout, useSesion } from '../auth/useSesion';

const ANCHO = 248;

export function AppLayout() {
  const theme = useTheme();
  const escritorio = useMediaQuery(theme.breakpoints.up('md'));
  const [abierto, setAbierto] = useState(false);
  const { data: usuario, isPending } = useSesion();
  const logout = useLogout();
  const location = useLocation();

  if (isPending) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location.pathname }} />;

  const actual = MENU.find((m) => (m.ruta === '/' ? location.pathname === '/' : location.pathname.startsWith(m.ruta)));

  const contenidoMenu = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
      <Toolbar>
        <Typography variant="h5" sx={{ fontFamily: 'Georgia, serif', letterSpacing: 1 }}>
          L&apos;Mont
        </Typography>
      </Toolbar>
      <List sx={{ flex: 1, px: 1 }}>
        {MENU.map((item) => (
          <ListItemButton
            key={item.ruta}
            component={RouterLink}
            to={item.ruta}
            disabled={!item.disponible}
            selected={actual?.ruta === item.ruta}
            onClick={() => setAbierto(false)}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              minHeight: 48,
              '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.14)' },
              '&.Mui-selected:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
              '&.Mui-disabled': { opacity: 0.55 },
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{item.icono}</ListItemIcon>
            <ListItemText primary={item.texto} />
            {!item.disponible && (
              <Chip label="Pronto" size="small" sx={{ color: 'inherit', bgcolor: 'rgba(255,255,255,0.12)', height: 20, fontSize: 11 }} />
            )}
          </ListItemButton>
        ))}
      </List>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />
      <List sx={{ px: 1 }}>
        <ListItemButton onClick={() => logout.mutate()} sx={{ borderRadius: 2, minHeight: 48 }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText primary="Cerrar sesión" />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      {!escritorio && (
        <AppBar position="fixed" color="primary">
          <Toolbar>
            <IconButton color="inherit" edge="start" onClick={() => setAbierto(true)} aria-label="Abrir menú" sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap>
              {actual?.texto ?? "L'Mont"}
            </Typography>
          </Toolbar>
        </AppBar>
      )}

      <Box component="nav" sx={{ width: { md: ANCHO }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={escritorio ? 'permanent' : 'temporary'}
          open={escritorio || abierto}
          onClose={() => setAbierto(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: ANCHO, boxSizing: 'border-box' } }}
        >
          {contenidoMenu}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 }, pt: { xs: 9, md: 4 } }}>
        <Outlet />
      </Box>
    </Box>
  );
}
