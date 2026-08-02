import "dotenv/config";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import { errorHandler } from "./lib/http";

// Baileys (WhatsApp) dispara internamente operaciones async que a veces rechazan sin que
// nuestro codigo pueda capturarlas (ej. timeouts al subir prekeys tras la conexion). Sin esto,
// un problema de la sesion de WhatsApp tumba todo el proceso, incluyendo ventas/productos/etc.
process.on("unhandledRejection", (reason) => {
  console.error("[proceso] Promesa rechazada sin capturar:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[proceso] Excepcion no capturada:", err);
});

import { requireAdmin, requireAuth, requireManagerOrAdmin } from "./lib/auth-middleware";
import { prisma } from "./lib/prisma";
import { authRouter } from "./routes/auth.routes";
import { comisionesRouter } from "./routes/comisiones.routes";
import { comprasRouter } from "./routes/compras.routes";
import { compradoresRouter } from "./routes/compradores.routes";
import { cuotasRouter } from "./routes/cuotas.routes";
import { metricsRouter } from "./routes/metrics.routes";
import { productosRouter } from "./routes/productos.routes";
import { publicoRouter } from "./routes/publico.routes";
import { usuariosRouter } from "./routes/usuarios.routes";
import { ventasRouter } from "./routes/ventas.routes";
import { whatsappRouter } from "./routes/whatsapp.routes";
import { iniciarWhatsapp } from "./whatsapp/client";
import { programarEnviosMasivos } from "./whatsapp/envios-masivos";
import { programarRecordatoriosCuotas } from "./whatsapp/recordatorios";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

const PORT = process.env["PORT"] ?? 3000;

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});

// Catalogo publico para compradores (sin login) - fotos, nombre, categoria y precio; oculta agotados.
app.use("/api/publico", publicoRouter);

// /api/auth/login y /logout son publicas; /me y /cambiar-password se protegen adentro del router.
app.use("/api/auth", authRouter);

// productos: GET (catalogo) abierto a los 3 roles; las mutaciones se restringen adentro del router.
app.use("/api/productos", requireAuth, productosRouter);
app.use("/api/compras", requireAuth, requireManagerOrAdmin, comprasRouter);
app.use("/api/comisiones", requireAuth, requireManagerOrAdmin, comisionesRouter);
app.use("/api/compradores", requireAuth, compradoresRouter);
app.use("/api/ventas", requireAuth, ventasRouter);
app.use("/api/cuotas", requireAuth, cuotasRouter);
app.use("/api/metrics", requireAuth, requireManagerOrAdmin, metricsRouter);
app.use("/api/whatsapp", requireAuth, whatsappRouter);
app.use("/api/usuarios", requireAuth, requireAdmin, usuariosRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Camelia API escuchando en el puerto ${PORT}`);
});

iniciarWhatsapp().catch((err) => console.error("Error iniciando WhatsApp:", err));
programarRecordatoriosCuotas();
programarEnviosMasivos();
