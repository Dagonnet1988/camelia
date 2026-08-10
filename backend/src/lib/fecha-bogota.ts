// Postgres tiene las columnas de fecha del negocio (fecha_venta, fecha_vencimiento, etc.) como
// "timestamp/date without time zone". Prisma trata esas columnas como si siempre fueran UTC,
// tanto al leer como al escribir - ignora el timezone de sesion de Postgres (que si esta bien
// configurado en America/Bogota, pero eso solo afecta a los defaults DEFAULT CURRENT_TIMESTAMP
// resueltos por el propio Postgres, no a los valores que la app arma en Node y le pasa a Prisma).
// Colombia es UTC-5 todo el año (sin horario de verano), asi que el offset es fijo.
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;

/**
 * Dado un instante real (ej. new Date()), devuelve un Date desplazado tal que sus getters/
 * setters UTC coinciden con la hora local de Bogota de ese instante - exactamente lo que Prisma
 * necesita para que el valor que efectivamente escribe en una columna naive sea la hora de
 * Bogota, no la hora UTC real.
 *
 * Uso: pasar el resultado directamente a Prisma (create/update) para columnas fecha_venta,
 * fecha_pago, fecha_vencimiento, etc. Si necesitas hacer aritmetica de fechas sobre el
 * resultado (sumar dias, etc.), usa SIEMPRE los getters/setters UTC (getUTCDate/setUTCDate) -
 * los getters locales de este Date ya no representan la hora real en ningun timezone.
 */
export function comoBogota(instanteReal: Date): Date {
  return new Date(instanteReal.getTime() - OFFSET_BOGOTA_MS);
}
