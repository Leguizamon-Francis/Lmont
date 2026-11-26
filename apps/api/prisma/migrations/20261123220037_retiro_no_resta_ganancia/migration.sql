-- Un retiro del dueño saca plata de la caja pero no es un gasto del local: no resta en la ganancia.
UPDATE "conceptos_caja" SET "cuenta_en_ganancia" = false WHERE "nombre" = 'Retiro del dueño' AND "tipo" = 'GASTO';
