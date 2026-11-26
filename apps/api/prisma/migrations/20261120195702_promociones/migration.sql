-- CreateEnum
CREATE TYPE "ModoPromocion" AS ENUM ('PRECIO_FIJO', 'NXM');

-- AlterTable
ALTER TABLE "venta_items" ADD COLUMN     "descuento_promo" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "descuento_promos" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "promociones" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "modo" "ModoPromocion" NOT NULL,
    "precio" DECIMAL(12,2),
    "paga_cantidad" INTEGER,
    "desde" DATE,
    "hasta" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promociones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promocion_componentes" (
    "id" SERIAL NOT NULL,
    "promocion_id" INTEGER NOT NULL,
    "producto_id" INTEGER,
    "tipo_id" INTEGER,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "promocion_componentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_promociones" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "promocion_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "veces" INTEGER NOT NULL,
    "precio_normal" DECIMAL(12,2) NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "venta_promociones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promociones_nombre_key" ON "promociones"("nombre");

-- CreateIndex
CREATE INDEX "promocion_componentes_promocion_id_idx" ON "promocion_componentes"("promocion_id");

-- CreateIndex
CREATE INDEX "venta_promociones_venta_id_idx" ON "venta_promociones"("venta_id");

-- CreateIndex
CREATE INDEX "venta_promociones_promocion_id_idx" ON "venta_promociones"("promocion_id");

-- AddForeignKey
ALTER TABLE "promocion_componentes" ADD CONSTRAINT "promocion_componentes_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promociones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_componentes" ADD CONSTRAINT "promocion_componentes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_componentes" ADD CONSTRAINT "promocion_componentes_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipos_prenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_promociones" ADD CONSTRAINT "venta_promociones_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_promociones" ADD CONSTRAINT "venta_promociones_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promociones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validaciones también en la base
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_modo_valido" CHECK (
  ("modo" = 'PRECIO_FIJO' AND "precio" IS NOT NULL AND "precio" > 0 AND "paga_cantidad" IS NULL) OR
  ("modo" = 'NXM' AND "paga_cantidad" IS NOT NULL AND "paga_cantidad" > 0 AND "precio" IS NULL)
);
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_vigencia" CHECK ("desde" IS NULL OR "hasta" IS NULL OR "desde" <= "hasta");
ALTER TABLE "promocion_componentes" ADD CONSTRAINT "promocion_componentes_producto_o_tipo" CHECK (("producto_id" IS NULL) <> ("tipo_id" IS NULL));
ALTER TABLE "promocion_componentes" ADD CONSTRAINT "promocion_componentes_cantidad_positiva" CHECK ("cantidad" > 0);
ALTER TABLE "venta_promociones" ADD CONSTRAINT "venta_promociones_valores" CHECK ("veces" > 0 AND "precio" >= 0 AND "descuento" > 0 AND "precio_normal" = "precio" + "descuento");
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_descuento_promo" CHECK ("descuento_promo" >= 0 AND "descuento_promo" <= "precio_unitario" * "cantidad");
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_descuento_promos_no_negativo" CHECK ("descuento_promos" >= 0);
