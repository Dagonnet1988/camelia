# Proyecto: App de Inventario y Métricas — Bisutería

## Contexto
Negocio de venta de bisutería (aretes, anillos, manillas, collares). Se necesita
una app pequeña para llevar inventario, registrar ventas y generar métricas
básicas de rentabilidad. Se desplegará en un servidor Contabo que ya corre
otro proyecto (Ramelo, en ramelo.app) — este va como servicio/subdominio
independiente en el mismo servidor (ej. inventario.<dominio> o dominio propio),
sin interferir con Ramelo.

## Alcance
App simple, uso interno (yo/mi negocio), no multi-tenant, no necesita
autenticación compleja (con login básico de un solo usuario o unos pocos
usuarios es suficiente).

## Modelo de datos

### productos
- codigo (PK, string, único — el SKU)
- nombre
- categoria (arete, anillo, manilla, collar, otro)
- valor_venta (precio de lista, "de contado")
- costo_promedio (decimal, se recalcula automáticamente con cada compra/refill — ver `compras_inventario`)
- stock_actual (int)
- stock_minimo (int, para alertas de reabastecimiento)
- fecha_ingreso (date, cuando se creó el SKU por primera vez)

### compras_inventario (refill de stock)
- id (PK)
- codigo_producto (FK -> productos.codigo)
- cantidad (int)
- valor_compra_unitario (decimal, costo de ESTA compra específica)
- proveedor (opcional)
- fecha_compra

Al insertar una compra:
1. `productos.stock_actual += cantidad`
2. Recalcular `productos.costo_promedio` con promedio ponderado:
   `nuevo_costo = ((stock_previo * costo_previo) + (cantidad * valor_compra_unitario)) / (stock_previo + cantidad)`

### compradores
- celular (PK, string — se usa el número de celular como identificador)
- nombre
- fecha_primera_compra (opcional, se puede derivar de ventas)

### ventas
- id (PK)
- codigo_producto (FK -> productos.codigo)
- comprador_celular (FK -> compradores.celular, nullable si es venta anónima)
- cantidad (int)
- valor_contado (decimal, = valor_venta del producto al momento × cantidad, antes de cualquier recargo)
- medio_pago (enum: 'contado', 'cuotas')
- num_cuotas (int, nullable — solo si medio_pago = 'cuotas'; máximo 3)
- recargo_cuotas (decimal, nullable — valor extra cobrado por financiar)
- valor_total_venta (decimal, = valor_contado + recargo_cuotas)
- costo_promedio_al_momento (decimal, copiado de productos.costo_promedio al momento de la venta, para que la ganancia histórica no se distorsione con recálculos futuros)
- ganancia (decimal, = valor_total_venta - (costo_promedio_al_momento × cantidad))
- canal (enum: 'whatsapp', 'presencial')
- fecha_venta

### cuotas (solo aplica si ventas.medio_pago = 'cuotas')
- id (PK)
- id_venta (FK -> ventas.id)
- numero_cuota (int, 1..num_cuotas)
- valor_cuota (decimal)
- fecha_vencimiento (date)
- fecha_pago (date, nullable — null = aún no pagada)
- estado (enum: 'pendiente', 'pagada', 'atrasada')
- recordatorio_enviado (boolean, default false — evita reenviar el recordatorio de WhatsApp
  varias veces por la misma cuota)

## Métricas / dashboard que debe entregar la app

1. **Top productos** — más vendidos por unidades y por ingresos (pueden diferir).
2. **Margen por producto** — `(valor_venta - costo_promedio) / valor_venta`, ranking de mejor % de ganancia.
3. **Rotación de inventario** — unidades vendidas / tiempo, por producto y categoría.
4. **Ganancia acumulada** — por semana/mes, con tendencia.
5. **Análisis ABC** — clasificar productos en A/B/C según % de ganancia que aportan.
6. **Ticket promedio** — general, por comprador (frecuencia de recompra por celular).
7. **Análisis contado vs. cuotas** — comparar margen efectivo de ventas de contado vs. cuotas (incluyendo el recargo_cuotas), para evaluar si el recargo actual compensa el riesgo/costo de financiar. Sugerir si el recargo debería subir o bajar según el comportamiento histórico de mora.
8. **Cartera de cuotas** — cuotas pendientes/atrasadas, total por cobrar, próximos vencimientos.
9. **Stock muerto** — productos sin ventas en los últimos N días.
10. **Historial de costos por proveedor** — variación de valor_compra_unitario en el tiempo, por proveedor.

## Stack (definido — mismo que Ramelo, por consistencia operativa)
- Backend: Node.js (mismo stack que Ramelo).
- Frontend: Angular (mismo stack que Ramelo).
- DB: PostgreSQL — misma instancia de Postgres del servidor, pero con una base de datos separada (ej. `bisuteria_db`), independiente de la de Ramelo.
- Gráficas del dashboard: Chart.js o similar sobre Angular.
- Deploy: mismo servidor Contabo donde corre Ramelo. Ramelo NO usa Docker, corre directo en el servidor con Nginx como reverse proxy. Este nuevo proyecto debe seguir el mismo patrón (proceso nativo, ej. con systemd o pm2/gunicorn según el stack elegido, sin contenedores) y exponerse en un subdominio o dominio propio distinto, con su propio bloque `server` en Nginx, sin tocar ni interferir con la configuración existente de ramelo.app.

### Servidor (Contabo Cloud VPS 4, 2026)

- CPU: 4 núcleos vCPU
- RAM: 8 GB
- Almacenamiento: 100 GB SSD (+ almacenamiento adicional disponible si hace falta)
- Snapshot: 1 incluido
- Puerto: 200 Mbit/s
- Corren aquí: Ramelo (ya en producción) + Camelia (este proyecto), ~2 usuarios internos por app.
  Evaluado en 2026-07-28: holgado para esta carga (Node+Postgres+Nginx para 2 apps de bajo
  tráfico es liviano frente a estos recursos); el único punto a vigilar a futuro es el consumo
  de memoria del proceso de Baileys (WhatsApp) en sesiones largas — mitigar con pm2 y un límite
  de reinicio por memoria, no por falta de capacidad del VPS.

## Primeros pasos sugeridos para Claude Code
1. Inicializar el proyecto con el stack definido (Node backend, Angular frontend, Postgres).
2. Definir esquema de base de datos (migraciones) según el modelo de arriba.
3. Construir API CRUD para productos, compras_inventario, compradores, ventas, cuotas.
4. Implementar la lógica de recálculo de costo_promedio en cada compra.
5. Implementar la lógica de generación de cuotas al crear una venta a cuotas.
6. Construir endpoints/queries para las métricas listadas.
7. Construir dashboard frontend simple.

## Backlog / Módulos futuros (no implementados aún)

**Para retomar en la próxima sesión (definido 2026-07-28):**

1. Integrar el módulo de WhatsApp con Baileys — ver detalle abajo. Es el que quedó más
   avanzado en decisiones, buen punto de partida.
2. Login básico.
3. Despliegue (systemd/pm2 + Nginx en el Contabo).

### Login básico

Autenticación simple de uno o pocos usuarios (ver "Alcance"). Pendiente.

### Despliegue

Configuración systemd/pm2 + bloque Nginx para el subdominio en el servidor Contabo (sin Docker, mismo patrón que Ramelo). Pendiente.

### Módulo de notificaciones por WhatsApp — EN CONSTRUCCIÓN (2026-07-28)

Enviar mensajes automáticos: recordatorios de vencimiento de cuotas (`cuotas.fecha_vencimiento`),
avisos de nueva mercancía/reabastecimiento, y potencialmente otros avisos operativos.

**Decisión explícita del usuario:** NO usar la API oficial de WhatsApp Business. Se descartó
whatsapp-web.js (requiere Chromium headless en el VPS) y Evolution API/WAHA (capas REST con
multi-sesión/webhooks que no aportan nada cuando el único consumidor es este mismo backend, y
normalmente se despliegan vía Docker).

**Librería:** `baileys` (org WhiskeySockets), integrada como dependencia directa dentro del
backend Node existente en `backend/src/whatsapp/` — sin proceso, contenedor ni Docker adicional.
Confirma que el plan de despliegue sigue 100% nativo (systemd/pm2), sin Docker, igual que Ramelo.

- **Version pinneada en `6.7.23` (exacta, sin `^`), no `6.7.19` ni `7.0.0-rc.x`.** Al integrar se
  encontró que 6.7.19 (la que se había evaluado como "estable") tiene una vulnerabilidad crítica
  parchada en 6.7.22 (spoofing de mensajes vía `protocolMessage` manipulado, GHSA-qvv5-jq5g-4cgg).
  v7 sigue en RC con bugs de desconexión/CPU documentados — revisar upgrade cuando salga de RC.
- `makeWASocket` requiere pasar explícitamente `version` obtenido de `fetchLatestBaileysVersion()`
  — sin esto la conexión falla con un 405 "Connection Failure" al intentar registrar el
  dispositivo (versión de protocolo desactualizada, error no obvio la primera vez).
- Sesión persistida en `backend/whatsapp-session/` (gitignored — son credenciales).

**Ya implementado y funcionando (verificado hasta la generación del QR; falta que el usuario
escanee con su celular para verificar el pareo y el envío real):**

- `backend/src/whatsapp/client.ts` — conexión/sesión, reconexión automática, QR como data URL.
- `backend/src/routes/whatsapp.routes.ts` — `GET /status`, `POST /reconectar`, `POST /logout`,
  `POST /enviar` (mensaje manual), `POST /recordatorios/enviar-ahora` (forzar el job).
- `backend/src/whatsapp/recordatorios.ts` — cron diario 9:00am: busca cuotas `pendiente`/
  `atrasada` con vencimiento en ≤2 días y `recordatorioEnviado = false`, envía un WhatsApp al
  comprador y marca `recordatorioEnviado = true` (una sola vez por cuota, no reenvía a diario).
  Requirió migración: `cuotas.recordatorio_enviado boolean default false`.
- **Switch on/off de los recordatorios automáticos** (pedido explícito del usuario) — tabla
  `configuracion_app` (singleton, id=1) con `recordatorios_cuotas_activos`. El switch solo
  controla el disparo automático del cron; el botón manual "enviar recordatorios ahora" siempre
  funciona sin importar el switch. Rutas `GET/PUT /api/whatsapp/config`.
- Frontend `/whatsapp` — estado de conexión, QR para vincular, cerrar sesión, envío manual de
  prueba, switch de recordatorios automáticos, botón para forzar el envío ahora.

**Bugs de estabilidad encontrados y corregidos durante las pruebas (importante para no
reintroducirlos):**

1. **Una excepción no capturada dentro de Baileys tumbaba TODO el proceso Express** (no solo el
   módulo de WhatsApp) — ej. un timeout interno al subir prekeys tras conectar. Se agregaron
   `process.on("unhandledRejection", ...)` y `process.on("uncaughtException", ...)` en
   `backend/src/index.ts` que loguean sin matar el proceso. Sin esto, un problema de conexión de
   WhatsApp tumbaba también ventas/productos/etc.
2. **Loop de reconexión sin control** — antes reintentaba cada 3s indefinidamente ante cualquier
   cierre de conexión, lo cual martilla los servidores de WhatsApp (justo el patrón que aumenta
   el riesgo de bloqueo). Ahora `client.ts` tiene backoff exponencial (3s → 60s tope) y se detiene
   tras 8 intentos seguidos fallidos, dejando el estado en `desconectado` hasta que alguien
   reconecte manualmente desde `/whatsapp`. Se resetea al conectar establemente (30s) o al
   reconectar/cerrar sesión manualmente.
3. Verificar que solo corra **un** `tsx watch` a la vez (`lsof -ti:3000 -sTCP:LISTEN`) — tener dos
   procesos de dev corriendo en paralelo generó comportamiento confuso (config con valores
   inesperados) durante el desarrollo de este módulo.

**Pendiente de decidir:** el disparador de "aviso de nueva mercancía/reabastecimiento" NO se
implementó todavía — quedó pendiente definir si es automático al registrar una
`compra_inventario` (riesgo de spamear compradores en cada reabastecimiento) o una acción manual
donde el dueño elige a quién avisar. Evaluar con el usuario antes de construirlo.

**Riesgo a asumir (sin cambios):** viola los términos de servicio de WhatsApp, el número
vinculado puede ser bloqueado sin aviso. Mitigar con número dedicado y bajo volumen — el uso
previsto aquí ya es de por sí bajo volumen.
