-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimiento" ADD VALUE 'DEVOLUCION';
ALTER TYPE "TipoMovimiento" ADD VALUE 'CAMBIO';

-- AlterTable
ALTER TABLE "movimientos_stock" ADD COLUMN     "cambio_id" INTEGER;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "cliente_id" INTEGER;

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "whatsapp" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambios" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendedor_id" INTEGER,
    "total_devuelto" DECIMAL(12,2) NOT NULL,
    "total_llevado" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "nota" TEXT,

    CONSTRAINT "cambios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambio_devueltos" (
    "id" SERIAL NOT NULL,
    "cambio_id" INTEGER NOT NULL,
    "venta_item_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "cambio_devueltos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambio_llevados" (
    "id" SERIAL NOT NULL,
    "cambio_id" INTEGER NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_lista" DECIMAL(12,2) NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "cambio_llevados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambio_pagos" (
    "id" SERIAL NOT NULL,
    "cambio_id" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "cuotas" INTEGER NOT NULL DEFAULT 1,
    "monto" DECIMAL(12,2) NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ajuste" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cobrado" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "cambio_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClienteToTalle" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ClienteToTalle_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "clientes_nombre_idx" ON "clientes"("nombre");

-- CreateIndex
CREATE INDEX "clientes_whatsapp_idx" ON "clientes"("whatsapp");

-- CreateIndex
CREATE INDEX "cambios_venta_id_idx" ON "cambios"("venta_id");

-- CreateIndex
CREATE INDEX "cambios_creado_en_idx" ON "cambios"("creado_en");

-- CreateIndex
CREATE INDEX "cambio_devueltos_venta_item_id_idx" ON "cambio_devueltos"("venta_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "cambio_devueltos_cambio_id_venta_item_id_key" ON "cambio_devueltos"("cambio_id", "venta_item_id");

-- CreateIndex
CREATE INDEX "cambio_llevados_variante_id_idx" ON "cambio_llevados"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "cambio_llevados_cambio_id_variante_id_key" ON "cambio_llevados"("cambio_id", "variante_id");

-- CreateIndex
CREATE INDEX "cambio_pagos_cambio_id_idx" ON "cambio_pagos"("cambio_id");

-- CreateIndex
CREATE INDEX "_ClienteToTalle_B_index" ON "_ClienteToTalle"("B");

-- CreateIndex
CREATE INDEX "movimientos_stock_cambio_id_idx" ON "movimientos_stock"("cambio_id");

-- CreateIndex
CREATE INDEX "ventas_cliente_id_idx" ON "ventas"("cliente_id");

-- AddForeignKey
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_cambio_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambio_devueltos" ADD CONSTRAINT "cambio_devueltos_cambio_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambio_devueltos" ADD CONSTRAINT "cambio_devueltos_venta_item_id_fkey" FOREIGN KEY ("venta_item_id") REFERENCES "venta_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambio_llevados" ADD CONSTRAINT "cambio_llevados_cambio_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambio_llevados" ADD CONSTRAINT "cambio_llevados_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambio_pagos" ADD CONSTRAINT "cambio_pagos_cambio_id_fkey" FOREIGN KEY ("cambio_id") REFERENCES "cambios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClienteToTalle" ADD CONSTRAINT "_ClienteToTalle_A_fkey" FOREIGN KEY ("A") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClienteToTalle" ADD CONSTRAINT "_ClienteToTalle_B_fkey" FOREIGN KEY ("B") REFERENCES "talles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Validaciones también en la base
ALTER TABLE "cambio_devueltos" ADD CONSTRAINT "cambio_devueltos_cantidad_positiva" CHECK ("cantidad" > 0 AND "precio_unitario" >= 0);
ALTER TABLE "cambio_llevados" ADD CONSTRAINT "cambio_llevados_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "cambio_llevados" ADD CONSTRAINT "cambio_llevados_precios_no_negativos" CHECK ("precio_lista" >= 0 AND "precio_unitario" >= 0 AND "costo_unitario" >= 0);
ALTER TABLE "cambios" ADD CONSTRAINT "cambios_totales_no_negativos" CHECK ("total_devuelto" >= 0 AND "total_llevado" >= 0 AND "diferencia" = "total_llevado" - "total_devuelto");
ALTER TABLE "cambio_pagos" ADD CONSTRAINT "cambio_pagos_monto_distinto_de_cero" CHECK ("monto" <> 0 AND "cobrado" <> 0);
