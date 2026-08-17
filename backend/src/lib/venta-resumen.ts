/** Resumen de los productos de una venta multi-linea: "Aretes Luna" (1 linea) o
 * "Aretes Luna + 2 más" (varias) - una sola convencion reutilizada en todo lo que necesite
 * mostrar "el producto" de una venta que ahora puede tener varios. */
export function resumenProductosVenta(items: { producto: { nombre: string } }[]): string {
  if (items.length === 0) return "—";
  const primero = items[0]!.producto.nombre;
  return items.length === 1 ? primero : `${primero} + ${items.length - 1} más`;
}
