import "dotenv/config";
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

import { prisma } from "./lib/prisma";
import { comprasRouter } from "./routes/compras.routes";
import { compradoresRouter } from "./routes/compradores.routes";
import { cuotasRouter } from "./routes/cuotas.routes";
import { metricsRouter } from "./routes/metrics.routes";
import { productosRouter } from "./routes/productos.routes";
import { ventasRouter } from "./routes/ventas.routes";
import { whatsappRouter } from "./routes/whatsapp.routes";
import { iniciarWhatsapp } from "./whatsapp/client";
import { programarRecordatoriosCuotas } from "./whatsapp/recordatorios";

const app = express();
app.use(express.json());

const PORT = process.env["PORT"] ?? 3000;

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});

app.use("/api/productos", productosRouter);
app.use("/api/compras", comprasRouter);
app.use("/api/compradores", compradoresRouter);
app.use("/api/ventas", ventasRouter);
app.use("/api/cuotas", cuotasRouter);
app.use("/api/metrics", metricsRouter);
app.use("/api/whatsapp", whatsappRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Camelia API escuchando en el puerto ${PORT}`);
});

iniciarWhatsapp().catch((err) => console.error("Error iniciando WhatsApp:", err));
programarRecordatoriosCuotas();
