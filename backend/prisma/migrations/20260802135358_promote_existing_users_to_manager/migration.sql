-- El rol "user" existente hasta ahora representaba acceso completo (menos el modulo de
-- usuarios). Se renombra semanticamente a "manager"; "user" queda libre para representar el
-- nuevo rol restringido (catalogo, compradores, ventas, whatsapp).
UPDATE "usuarios" SET "rol" = 'manager' WHERE "rol" = 'user';
