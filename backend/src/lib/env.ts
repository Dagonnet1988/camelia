// Modulo dedicado solo para el efecto secundario de cargar el .env, importado primero en
// index.ts. Un import (a diferencia de una llamada suelta) preserva su orden relativo frente
// a otros imports incluso si el bundler los "hoistea" por encima del codigo normal - por eso
// esto vive en su propio archivo en vez de un dotenv.config() suelto en medio de otros imports.
import dotenv from "dotenv";

// override: true porque el proceso puede heredar variables (ej. PORT) del entorno de PM2/la
// shell del servidor (compartido con otros proyectos como Ramelo) - el .env propio de Camelia
// siempre debe ganar sobre lo heredado, no al reves (comportamiento por defecto de dotenv).
dotenv.config({ override: true });
