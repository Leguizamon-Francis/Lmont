-- CreateTable
CREATE TABLE "tipos_prenda" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_prenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talles" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "talles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "colores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" SERIAL NOT NULL,
    "tipo_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_compra" DECIMAL(12,2) NOT NULL,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "tienda_nube_id" BIGINT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variantes" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "color_id" INTEGER NOT NULL,
    "talle_id" INTEGER NOT NULL,
    "codigo_barras" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stock_minimo" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "tienda_nube_variante_id" BIGINT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precios_historial" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "precio_compra" DECIMAL(12,2) NOT NULL,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precios_historial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_prenda_nombre_key" ON "tipos_prenda"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "talles_nombre_key" ON "talles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "colores_nombre_key" ON "colores"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "productos_tienda_nube_id_key" ON "productos"("tienda_nube_id");

-- CreateIndex
CREATE UNIQUE INDEX "productos_tipo_id_nombre_key" ON "productos"("tipo_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "variantes_codigo_barras_key" ON "variantes"("codigo_barras");

-- CreateIndex
CREATE UNIQUE INDEX "variantes_tienda_nube_variante_id_key" ON "variantes"("tienda_nube_variante_id");

-- CreateIndex
CREATE INDEX "variantes_color_id_idx" ON "variantes"("color_id");

-- CreateIndex
CREATE INDEX "variantes_talle_id_idx" ON "variantes"("talle_id");

-- CreateIndex
CREATE UNIQUE INDEX "variantes_producto_id_color_id_talle_id_key" ON "variantes"("producto_id", "color_id", "talle_id");

-- CreateIndex
CREATE INDEX "precios_historial_producto_id_desde_idx" ON "precios_historial"("producto_id", "desde");

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "tipos_prenda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_talle_id_fkey" FOREIGN KEY ("talle_id") REFERENCES "talles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios_historial" ADD CONSTRAINT "precios_historial_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que Prisma no expresa: stock y mínimos nunca negativos, precios no negativos.
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_stock_no_negativo" CHECK ("stock" >= 0);
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_stock_minimo_no_negativo" CHECK ("stock_minimo" >= 0);
ALTER TABLE "productos" ADD CONSTRAINT "productos_precios_no_negativos" CHECK ("precio_compra" >= 0 AND "precio_venta" >= 0);
ALTER TABLE "precios_historial" ADD CONSTRAINT "precios_historial_no_negativos" CHECK ("precio_compra" >= 0 AND "precio_venta" >= 0);

-- Listas iniciales (de la entrevista). Se pueden editar desde Configuración.
INSERT INTO "tipos_prenda" ("nombre") VALUES
  ('Pantalones'), ('Remeras'), ('Chombas'), ('Buzos'), ('Sweaters'), ('Bermudas'),
  ('Mallas'), ('Boxers'), ('Medias'), ('Deportivo'), ('Cintos');

INSERT INTO "talles" ("nombre", "orden") VALUES
  ('XS', 10), ('S', 20), ('M', 30), ('L', 40), ('XL', 50), ('XXL', 60), ('XXXL', 70),
  ('38', 110), ('40', 120), ('42', 130), ('44', 140), ('46', 150), ('48', 160), ('50', 170),
  ('Único', 200);

INSERT INTO "colores" ("nombre") VALUES
  ('Negro'), ('Blanco'), ('Crudo'), ('Beige'), ('Visón'), ('Gris claro'), ('Gris oscuro'), ('Gris'),
  ('Azul marino'), ('Azul'), ('Verde'), ('Rosa'), ('Salmón');
