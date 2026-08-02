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
usuarios es suficiente). **Login implementado (2026-08-01)** — ver modelo
`usuarios` abajo y detalle en el backlog.

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

### usuarios (login — agregado 2026-08-01)
- id (PK)
- usuario (string, único — funciona como login, no necesariamente una cédula aunque el admin
  seed usa una)
- nombre
- apellido
- rol (enum: 'admin', 'user') — única diferencia funcional: admin ve el módulo de crear
  usuarios, user no. Todo lo demás del acceso es igual para ambos roles.
- password_hash (bcrypt, nunca se expone en ninguna respuesta de la API)
- debe_cambiar_password (boolean, default true) — se pone en `false` al cambiar la contraseña
  exitosamente. Al crear un usuario nuevo desde el módulo de admin, la contraseña inicial es
  igual al `usuario` y este flag queda en `true`, forzando el cambio en el primer login.
- fecha_creacion

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

**Estado (actualizado 2026-08-01):** el módulo de WhatsApp (conexión, recordatorios, límites,
historial, envíos masivos), el login básico, y el diseño responsive de toda la app están
completos y probados. Queda por hacer:

1. Despliegue (systemd/pm2 + Nginx en el Contabo).

### Diseño responsive — COMPLETO (2026-08-01)

Todas las vistas (incluyendo login y cambio de password) se probaron en 3 anchos — móvil
(390px), tablet (820px), desktop (1440px) — sin overflow horizontal en ninguna página.

- Nav principal: en pantallas ≤860px colapsa a un botón hamburguesa que despliega los links en
  columna (con nombre de usuario y botón de cerrar sesión al final). Implementado con
  `display: contents` en `.nav-links` en desktop (los hijos se comportan como parte del flex de
  `.main-nav`) y `display: flex/none` + `.abierto` en mobile — evita duplicar el markup del nav
  para cada breakpoint.
- Cada página tiene un `@media (max-width: 640px)` en su `:host` que reduce el padding de 24px a
  16px.
- Fix real encontrado: `.card` como *grid item* (dentro de `.dashboard-grid`/`.split` del
  Dashboard) puede no encogerse por debajo del ancho de su contenido por defecto en CSS Grid —
  una tabla ancha adentro puede forzar el ancho de toda la página en vez de solo scrollear
  dentro de `.table-scroll`. Se agregó `min-width: 0` a `.card` globalmente. Los grids del
  dashboard ya usaban `minmax(0, 1fr)` en sus columnas, que es el fix complementario a nivel de
  track.
- Formularios (`.form-grid`, `grid-template-columns: repeat(auto-fit, minmax(160px, 1fr))`) y
  tablas (envueltas en `.table-scroll { overflow-x: auto }`) ya eran responsive desde que se
  construyeron — no necesitaron cambios, solo se verificó que no rompieran.

### Login básico — COMPLETO (2026-08-01)

Login con JWT en cookie httpOnly (`camelia_token`, 7 días), `bcryptjs` para hashear password,
`cookie-parser` para leerla. `requireAuth` (verifica JWT + carga el usuario fresco de la BD en
cada request, así que un cambio de rol o password aplica de inmediato) y `requireAdmin` en
`backend/src/lib/auth-middleware.ts`.

- Rutas en `backend/src/routes/auth.routes.ts`: `POST /login`, `POST /logout`, `GET /me`,
  `POST /cambiar-password`. `POST /login` y `POST /logout` son públicas; el resto de rutas de la
  API (incluidas `/me` y `/cambiar-password`) exigen `requireAuth`.
- `backend/src/routes/usuarios.routes.ts` (`GET/POST /api/usuarios`) montada con
  `requireAuth + requireAdmin` — por eso "el admin puede ver el módulo de crear usuario y el
  user no" se cumple también a nivel de API, no solo ocultando el link en el front.
- Usuario nuevo: contraseña inicial = mismo `usuario`, `debe_cambiar_password = true`. Al
  cambiarla se pone en `false`. Roles: `admin` y `user` — única diferencia funcional es el
  acceso al módulo de usuarios.
- Seed del admin: `backend/src/scripts/seed-admin.ts` (`npm run seed:admin`, idempotente vía
  upsert). Usuario `1054988359` / Diego Sánchez / admin / password `Dagonnet1` —
  `debe_cambiar_password = false` porque se le dio una contraseña real explícita, a diferencia
  de los usuarios creados desde el módulo de admin.
- Frontend: `AuthService` (señal `usuario`, siempre revalida contra `/api/auth/me`),
  `authGuard` (redirige a `/login` si no hay sesión, a `/cambiar-password` si
  `debeCambiarPassword` y la ruta no es esa), `adminGuard` (además exige rol admin),
  interceptor que redirige a `/login` ante cualquier 401. Páginas `/login`,
  `/cambiar-password`, `/usuarios` (solo admin, oculta el link de nav si no lo es).
- Requiere `JWT_SECRET` en `.env` (generado con `openssl rand -hex 48`) — variable nueva a
  configurar también en el servidor de producción.

### Despliegue

Configuración systemd/pm2 + bloque Nginx para el subdominio en el servidor Contabo (sin Docker, mismo patrón que Ramelo). Pendiente.

### Módulo de notificaciones por WhatsApp — COMPLETO (2026-07-28)

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

**Ya implementado y funcionando — verificado con pareo real (el usuario escaneó el QR con su
celular) y envío/recepción real de mensajes confirmados:**

- `backend/src/whatsapp/client.ts` — conexión/sesión, reconexión automática, QR como data URL,
  `normalizarNumeroColombia()` (ver punto de +57 abajo).
- `backend/src/routes/whatsapp.routes.ts` — `GET /status`, `POST /reconectar`, `POST /logout`,
  `POST /enviar` (mensaje manual), `POST /recordatorios/enviar-ahora` (forzar el job),
  `GET /historial`, `GET/PUT /config`.
- `backend/src/whatsapp/recordatorios.ts` — cron diario 9:00am: busca cuotas `pendiente`/
  `atrasada` con vencimiento en ≤2 días y `recordatorioEnviado = false`, envía un WhatsApp al
  comprador y marca `recordatorioEnviado = true` (una sola vez por cuota, no reenvía a diario).
  Requirió migración: `cuotas.recordatorio_enviado boolean default false`.
- **Switch on/off de los recordatorios automáticos** (pedido explícito del usuario) — tabla
  `configuracion_app` (singleton, id=1) con `recordatorios_cuotas_activos`. El switch solo
  controla el disparo automático del cron; el botón manual "enviar recordatorios ahora" siempre
  funciona sin importar el switch.
- **Numero colombiano por defecto** (pedido explícito del usuario) — `normalizarNumeroColombia()`
  antepone `57` automáticamente cuando el número tiene 10 dígitos (formato celular CO sin
  indicativo). Se aplica tanto al envío manual como a los recordatorios de cuotas.
- **Límites de envío por hora/día** (pedido explícito del usuario) — `configuracion_app.
  limite_mensajes_hora` / `limite_mensajes_dia` (nullable = sin límite; default 20/hora, 100/día).
  `backend/src/whatsapp/mensajes.ts` cuenta los mensajes `enviado` en la ventana correspondiente
  antes de cada envío y bloquea con 429 si se supera — mitigación real contra el riesgo de
  bloqueo por patrón de envío automatizado.
- **Historial de mensajes** (pedido explícito del usuario) — tabla
  `historial_mensajes_whatsapp` (numero, mensaje, tipo, estado `enviado`/`fallido`, error,
  fecha_envio). Se registra cada intento, incluso los bloqueados por límite (con el motivo en
  `error`). `enviarMensajeControlado()` en `mensajes.ts` es el único punto de entrada para enviar
  — envuelve límites + historial + el envío real; tanto la ruta manual como los recordatorios
  pasan por ahí.
- Frontend `/whatsapp` — estado de conexión, QR para vincular, cerrar sesión, envío manual de
  prueba, switch de recordatorios automáticos, botón para forzar el envío ahora, edición de
  límites hora/día, tabla de historial con botón de refrescar.
- **Módulo de envíos masivos / "aviso de nueva mercancía"** (pedido explícito del usuario,
  resuelve el punto que había quedado pendiente de decidir) — se implementó como acción manual:
  el dueño compone el mensaje, elige a qué compradores enviar (checkboxes, con "seleccionar
  todos"), y la cola se procesa con un retraso aleatorio configurable entre cada envío (min/max
  segundos, default 5-15s) para no parecer un patrón automatizado. Modelos `EnvioMasivo` +
  `EnvioMasivoDestinatario` (estados `pendiente/en_progreso/completado/cancelado` y
  `pendiente/enviado/fallido` respectivamente). `backend/src/whatsapp/envios-masivos.ts` corre
  un cron cada minuto (`procesarEnviosMasivosPendientes`) que retoma cualquier campaña con
  destinatarios pendientes — resiliente a reinicios del servidor porque el estado vive en la
  BD, no en memoria. Si se alcanza el límite de mensajes por hora/día a mitad de una campaña, se
  pausa sola (sin ensuciar el historial con reintentos fallidos) y se retoma cuando el límite se
  libera. Cada envío individual pasa por `enviarMensajeControlado()`, así que respeta límites e
  historial igual que cualquier otro mensaje. Frontend en `/difusion`: compositor, selector de
  destinatarios, configuración de retraso, tabla de campañas con progreso en vivo (poll cada 4s)
  y detalle expandible por destinatario. Botón de cancelar detiene los destinatarios pendientes
  sin afectar los ya enviados.
  Probado end-to-end con delay corto (2-4s) verificando timestamps reales entre envíos.

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

**Riesgo a asumir (sin cambios):** viola los términos de servicio de WhatsApp, el número
vinculado puede ser bloqueado sin aviso. Mitigar con número dedicado y bajo volumen — el uso
previsto aquí ya es de por sí bajo volumen.
