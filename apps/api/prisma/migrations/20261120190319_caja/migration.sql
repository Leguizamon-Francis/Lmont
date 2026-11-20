-- CreateEnum
CREATE TYPE "TipoCaja" AS ENUM ('INGRESO', 'GASTO');

-- CreateTable
CREATE TABLE "conceptos_caja" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCaja" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "conceptos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_caja" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "TipoCaja" NOT NULL,
    "concepto_id" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "medio" "MedioPago" NOT NULL DEFAULT 'EFECTIVO',
    "detalle" TEXT,
    "vendedor_id" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conceptos_caja_nombre_tipo_key" ON "conceptos_caja"("nombre", "tipo");

-- CreateIndex
CREATE INDEX "movimientos_caja_fecha_idx" ON "movimientos_caja"("fecha");

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_concepto_id_fkey" FOREIGN KEY ("concepto_id") REFERENCES "conceptos_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_vendedor_id_fkey" FOREIGN KEY ("vendedor_id") REFERENCES "vendedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_monto_positivo" CHECK ("monto" > 0);

-- Conceptos habituales; se pueden cambiar desde Configuración.
-- (La compra de mercadería no va acá: sale de los ingresos marcados "pagado con la caja".)
INSERT INTO "conceptos_caja" ("nombre", "tipo") VALUES
  ('Alquiler', 'GASTO'),
  ('Servicios (luz, agua, internet)', 'GASTO'),
  ('Sueldos', 'GASTO'),
  ('Impuestos', 'GASTO'),
  ('Comisiones de tarjetas', 'GASTO'),
  ('Limpieza y mantenimiento', 'GASTO'),
  ('Retiro del dueño', 'GASTO'),
  ('Otros gastos', 'GASTO'),
  ('Cambio inicial', 'INGRESO'),
  ('Aporte del dueño', 'INGRESO'),
  ('Otros ingresos', 'INGRESO');
