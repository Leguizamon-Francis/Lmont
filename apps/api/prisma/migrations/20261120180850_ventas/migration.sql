-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimiento" ADD VALUE 'VENTA';
ALTER TYPE "TipoMovimiento" ADD VALUE 'ANULACION_VENTA';

-- AlterTable
ALTER TABLE "movimientos_stock" ADD COLUMN     "venta_id" INTEGER;

-- CreateTable
CREATE TABLE "planes_pago" (
    "id" SERIAL NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "cuotas" INTEGER NOT NULL DEFAULT 1,
    "porcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "planes_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendedor_id" INTEGER,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "nota" TEXT,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "anulada_en" TIMESTAMP(3),
    "motivo_anulacion" TEXT,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_items" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_lista" DECIMAL(12,2) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "venta_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_pagos" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "cuotas" INTEGER NOT NULL DEFAULT 1,
    "monto" DECIMAL(12,2) NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ajuste" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cobrado" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "venta_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planes_pago_medio_cuotas_key" ON "planes_pago"("medio", "cuotas");

-- CreateIndex
CREATE INDEX "ventas_creado_en_idx" ON "ventas"("creado_en");

-- CreateIndex
CREATE INDEX "venta_items_variante_id_idx" ON "venta_items"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "venta_items_venta_id_variante_id_key" ON "venta_items"("venta_id", "variante_id");

-- CreateIndex
CREATE INDEX "venta_pagos_venta_id_idx" ON "venta_pagos"("venta_id");

-- CreateIndex
CREATE INDEX "movimientos_stock_venta_id_idx" ON "movimientos_stock"("venta_id");

-- AddForeignKey
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_pagos" ADD CONSTRAINT "venta_pagos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valores válidos aunque alguien escriba directo en la base.
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_precios_no_negativos" CHECK ("precio_lista" >= 0 AND "precio_unitario" >= 0 AND "costo_unitario" >= 0);
ALTER TABLE "venta_pagos" ADD CONSTRAINT "venta_pagos_monto_positivo" CHECK ("monto" > 0 AND "cobrado" >= 0);
ALTER TABLE "venta_pagos" ADD CONSTRAINT "venta_pagos_cuotas_validas" CHECK ("cuotas" >= 1 AND ("medio" = 'CREDITO' OR "cuotas" = 1));
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_totales_no_negativos" CHECK ("subtotal" >= 0 AND "total" >= 0);
ALTER TABLE "planes_pago" ADD CONSTRAINT "planes_pago_cuotas_validas" CHECK ("cuotas" >= 1 AND ("medio" = 'CREDITO' OR "cuotas" = 1));
ALTER TABLE "planes_pago" ADD CONSTRAINT "planes_pago_porcentaje_valido" CHECK ("porcentaje" > -100);

-- Un plan por medio de pago, sin recargo ni descuento: se configuran desde la app.
INSERT INTO "planes_pago" ("medio", "cuotas") VALUES ('EFECTIVO', 1), ('DEBITO', 1), ('CREDITO', 1), ('TRANSFERENCIA', 1);
