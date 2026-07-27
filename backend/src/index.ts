import "dotenv/config";
import express from "express";
import { prisma } from "./lib/prisma";

const app = express();
app.use(express.json());

const PORT = process.env["PORT"] ?? 3000;

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Camelia API escuchando en el puerto ${PORT}`);
});
