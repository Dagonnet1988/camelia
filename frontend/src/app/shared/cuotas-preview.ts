// Misma regla de redondeo que generarCuotas() en el backend
// (backend/src/services/ventas.service.ts): cada cuota (salvo la ultima) se redondea a la
// centena mas cercana; la ultima absorbe la diferencia para que la suma cuadre exacto con el
// total.
export function previsualizarCuotas(valorTotalVenta: number, numCuotas: number): number[] {
  if (!numCuotas || numCuotas < 1 || !Number.isFinite(valorTotalVenta)) return [];
  const base = Math.round(valorTotalVenta / numCuotas / 100) * 100;
  const cuotas = Array(numCuotas - 1).fill(base);
  cuotas.push(valorTotalVenta - base * (numCuotas - 1));
  return cuotas;
}
