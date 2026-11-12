-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('CARGA_INICIAL');

-- CreateTable
CREATE TABLE "movimientos_stock" (
    "id" SERIAL NOT NULL,
    "variante_id" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "stock_resultante" INTEGER NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_stock_variante_id_creado_en_idx" ON "movimientos_stock"("variante_id", "creado_en");

-- AddForeignKey
ALTER TABLE "movimientos_stock" ADD CONSTRAINT "movimientos_stock_variante_id_fkey" FOREIGN KEY ("variante_id") REFERENCES "variantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
