-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimiento" ADD VALUE 'INGRESO';
ALTER TYPE "TipoMovimiento" ADD VALUE 'AJUSTE';

-- AlterTable
ALTER TABLE "movimientos_stock" ADD COLUMN     "detalle" TEXT,
ADD COLUMN     "ingreso_id" INTEGER;

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "whatsapp" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingresos" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "proveedor_id" INTEGER,
    "total" DECIMAL(12,2) NOT NULL,
    "pagado_con_caja" BOOLEAN NOT NULL DEFAULT false,
    "nota" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingresos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingreso_items" (
    "id" SERIAL NOT NULL,
    "ingreso_id" INTEGER NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ingreso_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_nombre_key" ON "proveedores"("nombre");

-- CreateIndex
CREATE INDEX "ingresos_fecha_idx" ON "ingresos"("fecha");

-- CreateIndex
CREATE INDEX "ingreso_items_variante_id_idx" ON "ingreso_items"("variante_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingreso_items_ingreso_id_variante_id_key" ON "ingreso_items"("ingreso_id", "variante_id");

-- CreateIndex
CREATE INDEX "movimientos_stock_ingreso_id_idx" ON "movimientos_stock"("ingreso_id");

-- AddForeignKey
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_ingreso_id_fkey" FOREIGN KEY ("ingreso_id") REFERENCES "ingresos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingreso_items" ADD CONSTRAINT "ingreso_items_ingreso_id_fkey" FOREIGN KEY ("ingreso_id") REFERENCES "ingresos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingreso_items" ADD CONSTRAINT "ingreso_items_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cantidades y costos válidos aunque alguien escriba directo en la base.
ALTER TABLE "ingreso_items" ADD CONSTRAINT "ingreso_items_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "ingreso_items" ADD CONSTRAINT "ingreso_items_costo_no_negativo" CHECK ("costo_unitario" >= 0);
ALTER TABLE "ingresos" ADD CONSTRAINT "ingresos_total_no_negativo" CHECK ("total" >= 0);
