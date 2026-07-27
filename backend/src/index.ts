import "dotenv/config";
import express from "express";
import { errorHandler } from "./lib/http";
import { prisma } from "./lib/prisma";
import { comprasRouter } from "./routes/compras.routes";
import { compradoresRouter } from "./routes/compradores.routes";
import { cuotasRouter } from "./routes/cuotas.routes";
import { productosRouter } from "./routes/productos.routes";
import { ventasRouter } from "./routes/ventas.routes";

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

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Camelia API escuchando en el puerto ${PORT}`);
});
