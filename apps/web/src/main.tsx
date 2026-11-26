import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline, ThemeProvider } from '@mui/material';
import '@lmont/shared'; // activa los mensajes de validación en español
import { theme } from './theme';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { InicioPage } from './pages/InicioPage';
import { ConfiguracionPage } from './pages/configuracion/ConfiguracionPage';
import { NoEncontradaPage } from './pages/NoEncontradaPage';
import { ProductosPage } from './pages/productos/ProductosPage';
import { ProductoPage } from './pages/productos/ProductoPage';
import { StockPage } from './pages/stock/StockPage';
import { IngresoPage } from './pages/stock/IngresoPage';
import { VentasPage } from './pages/ventas/VentasPage';
import { VentaPage } from './pages/ventas/VentaPage';
import { CajaPage } from './pages/caja/CajaPage';
import { ClientesPage } from './pages/clientes/ClientesPage';
import { ClientePage } from './pages/clientes/ClientePage';
import { CambiosPage } from './pages/cambios/CambiosPage';
import { NuevoCambio } from './pages/cambios/NuevoCambio';
import { PromocionesPage } from './pages/promociones/PromocionesPage';
import { ReportesPage } from './pages/reportes/ReportesPage';
import { EscanerPage } from './pages/EscanerPage';
import { ApiRequestError } from './api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (n, e) => !(e instanceof ApiRequestError && e.status < 500) && n < 2,
    },
  },
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <InicioPage /> },
      { path: 'ventas', element: <VentasPage /> },
      { path: 'ventas/:id', element: <VentaPage /> },
      { path: 'ventas/:id/cambio', element: <NuevoCambio /> },
      { path: 'cambios', element: <CambiosPage /> },
      { path: 'promociones', element: <PromocionesPage /> },
      { path: 'clientes', element: <ClientesPage /> },
      { path: 'clientes/:id', element: <ClientePage /> },
      { path: 'caja', element: <CajaPage /> },
      { path: 'reportes', element: <ReportesPage /> },
      { path: 'escaner', element: <EscanerPage /> },
      { path: 'productos', element: <ProductosPage /> },
      { path: 'productos/:id', element: <ProductoPage /> },
      { path: 'stock', element: <StockPage /> },
      { path: 'stock/ingresos/:id', element: <IngresoPage /> },
      { path: 'configuracion', element: <ConfiguracionPage /> },
      { path: '*', element: <NoEncontradaPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
