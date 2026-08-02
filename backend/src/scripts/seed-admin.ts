import "dotenv/config";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../services/auth.service";

const ADMIN = {
  usuario: "1054988359",
  nombre: "Diego",
  apellido: "Sanchez",
  rol: "admin" as const,
  password: "Dagonnet1",
};

async function main(): Promise<void> {
  const passwordHash = await hashPassword(ADMIN.password);

  const usuario = await prisma.usuario.upsert({
    where: { usuario: ADMIN.usuario },
    update: {},
    create: {
      usuario: ADMIN.usuario,
      nombre: ADMIN.nombre,
      apellido: ADMIN.apellido,
      rol: ADMIN.rol,
      passwordHash,
      // Password real (no autogenerada) provista al crear el seed: no se obliga a cambiarla.
      debeCambiarPassword: false,
    },
    select: { id: true, usuario: true, nombre: true, apellido: true, rol: true },
  });

  console.log("Usuario admin listo:", usuario);
}

main()
  .catch((err) => {
    console.error("Error creando el usuario admin:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
