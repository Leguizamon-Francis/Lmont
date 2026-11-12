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
      { path: 'productos', element: <ProductosPage /> },
      { path: 'productos/:id', element: <ProductoPage /> },
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
