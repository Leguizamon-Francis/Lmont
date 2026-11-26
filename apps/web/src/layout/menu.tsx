import type { ReactNode } from 'react';
import HomeIcon from '@mui/icons-material/HomeOutlined';
import PointOfSaleIcon from '@mui/icons-material/PointOfSaleOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHorizOutlined';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScannerOutlined';
import CheckroomIcon from '@mui/icons-material/CheckroomOutlined';
import InventoryIcon from '@mui/icons-material/Inventory2Outlined';
import LocalOfferIcon from '@mui/icons-material/LocalOfferOutlined';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PeopleIcon from '@mui/icons-material/PeopleOutlined';
import BarChartIcon from '@mui/icons-material/BarChartOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';

export type ItemMenu = { texto: string; ruta: string; icono: ReactNode; disponible: boolean };

/** Secciones del sistema. Las que no están disponibles se habilitan en etapas siguientes. */
export const MENU: ItemMenu[] = [
  { texto: 'Inicio', ruta: '/', icono: <HomeIcon />, disponible: true },
  { texto: 'Vender', ruta: '/ventas', icono: <PointOfSaleIcon />, disponible: true },
  { texto: 'Cambios y devoluciones', ruta: '/cambios', icono: <SwapHorizIcon />, disponible: true },
  { texto: 'Escáner', ruta: '/escaner', icono: <QrCodeScannerIcon />, disponible: true },
  { texto: 'Productos', ruta: '/productos', icono: <CheckroomIcon />, disponible: true },
  { texto: 'Stock', ruta: '/stock', icono: <InventoryIcon />, disponible: true },
  { texto: 'Promociones', ruta: '/promociones', icono: <LocalOfferIcon />, disponible: true },
  { texto: 'Caja', ruta: '/caja', icono: <AccountBalanceWalletIcon />, disponible: true },
  { texto: 'Clientes', ruta: '/clientes', icono: <PeopleIcon />, disponible: true },
  { texto: 'Reportes', ruta: '/reportes', icono: <BarChartIcon />, disponible: true },
  { texto: 'Configuración', ruta: '/configuracion', icono: <SettingsIcon />, disponible: true },
];
