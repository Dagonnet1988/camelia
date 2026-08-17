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
- categoria (string, texto libre — ver "Categorías como texto libre" abajo. Originalmente era un
  enum fijo con 5 valores: arete, anillo, manilla, collar, otro; se migró a texto libre el
  2026-08-08.)
- valor_venta (precio de lista, "de contado")
- costo_promedio (decimal, se recalcula automáticamente con cada compra/refill — ver `compras_inventario`)
- stock_actual (int)
- stock_minimo (int, para alertas de reabastecimiento)
- fecha_ingreso (date, cuando se creó el SKU por primera vez)
- proveedor (string, opcional, agregado 2026-08-08 — dato propio del producto, editable desde
  Productos; distinto del `proveedor` de `compras_inventario`, que es histórico por compra)

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

### ventas (multi-línea desde 2026-08-17 — ver backlog)
Una venta puede incluir **varios productos** (líneas en `venta_items`, ver abajo). Los campos de
`ventas` son siempre **agregados de toda la venta** — total, cuotas y comisión se calculan sobre
el conjunto, no por producto. `codigo_producto`/`cantidad` (que antes vivían directo en esta
tabla, cuando una venta era de un solo producto) se movieron a `venta_items`.
- id (PK)
- comprador_celular (FK -> compradores.celular, nullable si es venta anónima)
- valor_contado (decimal, = suma de `valor_unitario × cantidad` de todas las líneas, antes de
  cualquier recargo)
- medio_pago (enum: 'contado', 'cuotas')
- num_cuotas (int, nullable — solo si medio_pago = 'cuotas'; máximo 3)
- frecuencia_cuotas (enum: 'semanal', 'quincenal', 'mensual'; nullable — solo si medio_pago =
  'cuotas'. Define cada cuántos días vence cada cuota — 7/15/30 respectivamente.)
- recargo_cuotas (decimal, nullable — valor extra cobrado por financiar, de la venta completa,
  no por línea. Editable por venta desde el momento de crearla (agregado 2026-08-17) — si no se
  manda, cae a `configuracion_app.recargo_cuotas_global` (ajustable desde Cuotas, no desde
  Comisiones); al editar una venta ya creada, también se puede ajustar manualmente para esa
  venta puntual sin afectar el global.)
- valor_total_venta (decimal, = valor_contado + recargo_cuotas)
- ganancia (decimal, = suma de la `ganancia` de cada línea — ver `venta_items`)
- canal (enum: 'whatsapp', 'presencial')
- fecha_venta
- vendedor_id (FK -> usuarios.id, nullable — quien registró la venta; lo asigna el backend a
  partir de la sesión autenticada, nunca lo manda el cliente. Agregado 2026-08-02.)
- comision_porcentaje (decimal, copiado de usuarios.porcentaje_comision al momento de la venta —
  mismo patrón de snapshot histórico que `venta_items.costo_unitario_al_momento`, para que
  liquidaciones pasadas no se distorsionen si el % de un vendedor cambia después)
- comision (decimal, = valor_total_venta × comision_porcentaje / 100 — sobre el total de la
  venta, no por línea/producto)
- comision_estado (enum: 'pendiente', 'liquidada')
- liquidacion_id (FK -> liquidaciones_comision.id, nullable — se llena cuando se liquida)

### venta_items (agregado 2026-08-17)
Una línea = un producto dentro de una venta. `onDelete: Cascade` desde `ventas` (las líneas no
tienen vida propia fuera de su venta — a diferencia de `cuotas`, que deliberadamente NO tiene
cascada porque el service ya maneja su borrado paso a paso con resguardos).
- id (PK)
- venta_id (FK -> ventas.id, cascade on delete)
- codigo_producto (FK -> productos.codigo)
- cantidad (int)
- valor_unitario (decimal, precio de venta de **esta línea** — por defecto el precio de
  catálogo del producto, editable por línea para descuentos puntuales; ya no existe un
  "Valor a cobrar" libre para toda la venta como antes, porque con varios productos de
  distinto costo no hay forma de repartir un descuento global sin inventar una regla arbitraria
  de ganancia por producto)
- costo_unitario_al_momento (decimal — el nombre es histórico: se copia el costo de la
  **compra más reciente** del producto al momento de la venta, no el promedio ponderado
  `productos.costo_promedio`. Fallback al promedio ponderado solo si el producto no tiene
  ninguna compra registrada. Se copia una vez por línea y no se recalcula después, para que la
  ganancia histórica no se distorsione con compras futuras — al editar una venta, las líneas
  que se conservan preservan este valor; solo las líneas realmente nuevas calculan costo fresco)
- ganancia (decimal, = (valor_unitario - costo_unitario_al_momento) × cantidad — por esto se
  guarda como columna en vez de calcularse al vuelo: el análisis ABC necesita ganancia por
  producto, que solo existe a nivel de línea, no de venta)

### liquidaciones_comision (agregado 2026-08-02)
- id (PK)
- vendedor_id (FK -> usuarios.id)
- generada_por_id (FK -> usuarios.id — el manager/admin que ejecutó la liquidación)
- fecha_liquidacion
- total_comision (decimal, suma de las comisiones de las ventas incluidas)
- cantidad_ventas (int)
- Relación 1-a-muchos con ventas (cada venta liquidada apunta a esta liquidación via
  liquidacion_id) — permite regenerar el PDF de la liquidación en cualquier momento.

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
- porcentaje_comision (decimal, default 0 — agregado 2026-08-02. Ajustable solo por admin desde
  el módulo Usuarios; se copia a cada venta que registre ese usuario, ver `ventas` abajo)
- fecha_creacion

## Métricas / dashboard que debe entregar la app

1. **Top productos** — más vendidos por unidades y por ingresos (pueden diferir).
2. **Margen por producto** — `(valor_venta - costo_ultima_compra) / valor_venta`, ranking de mejor % de
   ganancia. Usa el `valor_compra_unitario` de la compra más reciente de cada producto, no el
   `costo_promedio` ponderado (ver detalle en el backlog: 2026-08-08). Incluye fila de totales
   (sumatoria de precio de venta y de costo de compra) al pie de la tabla.
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

**Estado (actualizado 2026-08-08):** el módulo de WhatsApp, el login con 3 roles, el Catálogo
interno, el catálogo público tipo marketplace, el módulo de comisiones de vendedores, y el
**despliegue a producción** (`camelia.ramelo.app`, en el mismo VPS Contabo que Ramelo — ver
`DEPLOY.md`) están completos. La app está **en producción y en uso real**. No hay pendientes
de infraestructura; el backlog restante es de producto (ver secciones más recientes abajo).

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
  cambiarla se pone en `false`.
- **Ajuste 2026-08-02:** en el cambio de contraseña forzado del primer login (`debe_cambiar_password
  = true`), ya no se pide la contraseña actual — el usuario acaba de escribirla para entrar (es
  igual a su `usuario`), pedirla de nuevo era fricción sin valor de seguridad real. `POST
  /api/auth/cambiar-password` acepta `passwordActual` opcional; `auth.service.ts` solo la exige
  y valida si `usuario.debeCambiarPassword` es `false` (cambio voluntario posterior, donde sí se
  verifica). El frontend (`cambiar-password.component`) oculta ese campo cuando `esPrimerCambio`.
- **Roles (actualizado 2026-08-02): `admin`, `manager`, `user`.** El `user` original (acceso
  completo salvo módulo de usuarios) se renombró a `manager`; se creó un `user` nuevo, más
  restringido. Ver sección "Roles y permisos" abajo para el detalle de qué ve cada uno.
- **Reset de contraseña (2026-08-02):** botón "Resetear clave" en el módulo Usuarios
  (`POST /api/usuarios/:id/resetear-password`) — mismo patrón que la creación: la nueva
  contraseña queda igual al `usuario` y se fuerza `debe_cambiar_password = true` de nuevo. Solo
  admin puede usarlo (la ruta cuelga de `usuariosRouter`, montada con `requireAdmin`).
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

### Datos de prueba (seed) para desarrollo — COMPLETO (2026-08-02)

`npm run seed:prueba` (`backend/src/scripts/seed-datos-prueba.ts`) puebla 9 productos
(codigos `SEED-*`, uno por categoría o dos), ~10 compras repartidas en los últimos ~75 días,
6 compradores, y 19 ventas (mezcla contado/cuotas, whatsapp/presencial, con y sin comprador)
repartidas en los últimos ~60 días — pensado para ejercitar las 10 métricas del dashboard a la
vez (top productos, margen, rotación, ganancia acumulada, ABC, ticket promedio, contado vs.
cuotas, cartera con cuotas ya vencidas/pagadas/pendientes, stock muerto, historial de costos por
proveedor). Reutiliza los services reales (`registrarCompra`, `registrarVenta`,
`marcarCuotaPagada`, `marcarAtrasadas`) en vez de insertar filas a mano, para que los cálculos
(costo promedio ponderado, ganancia, generación de cuotas) sean exactamente los de producción.
Es idempotente: si detecta que `SEED-ARE-01` ya existe, no vuelve a sembrar.
`npm run seed:prueba:limpiar` (`limpiar-datos-prueba.ts`) borra todo lo sembrado (por código
`SEED-*` y por los celulares de prueba) sin tocar datos reales.

### Roles y permisos — COMPLETO (2026-08-02)

Pedido explícito del usuario: mantener el `admin` como está, renombrar el `user` original a
`manager` (acceso completo salvo módulo de usuarios), y crear un `user` nuevo restringido a
Catálogo, Compradores, Ventas y WhatsApp.

- `RolUsuario` en Postgres: `admin | manager | user` (migración en dos pasos —
  `ALTER TYPE ... ADD VALUE 'manager'` en una migración, y el `UPDATE usuarios SET rol =
  'manager' WHERE rol = 'user'` de backfill en una migración separada, porque Postgres no deja
  usar un valor de enum recién agregado en la misma transacción que lo crea).
- Backend: `requireRol(...roles)` genérico en `backend/src/lib/auth-middleware.ts`, del que se
  derivan `requireAdmin` y `requireManagerOrAdmin`. Gating real a nivel de API (no solo se oculta
  en el nav):
  - `/api/compras` y `/api/metrics`: `requireManagerOrAdmin` completo.
  - `/api/productos`: `GET` abierto a cualquier autenticado (el `user` restringido necesita ver
    el catálogo); `POST/PUT/DELETE` exigen `requireManagerOrAdmin` (el `user` no puede crear ni
    editar productos manualmente — ver "Catálogo" abajo).
  - `/api/compradores`, `/api/ventas`, `/api/whatsapp`: `requireAuth` sin restricción de rol —
    los tres roles pueden operarlos.
- Frontend: `managerGuard` (nuevo, en `frontend/src/app/guards/manager.guard.ts`) protege
  Dashboard (`/`) y Compras — el `user` restringido que intente entrar es redirigido a
  `/productos` (el Catálogo). El nav (`app.html`) oculta Dashboard/Compras/Usuarios según
  `u.rol` con `@if`.
- El toggle on/off de recordatorios automáticos de WhatsApp (`configuracion_app.
  recordatorios_cuotas_activos`) es intencional y persiste correctamente — confirmado con el
  usuario, no requirió cambio de código.

### Difusión fusionada en WhatsApp — COMPLETO (2026-08-02)

Pedido explícito del usuario: la página standalone `/difusion` (envíos masivos) no debía ser un
módulo aparte, sino vivir dentro de la página de WhatsApp. Se eliminó la ruta `/difusion` de
`app.routes.ts` y `DifusionComponent` ahora se embebe directamente dentro de
`WhatsappComponent` (`<app-difusion />`, debajo del historial de mensajes). El componente de
Difusión no cambió su lógica interna, solo se le quitó el `<header>` de página propia (ya no es
standalone) y su `:host` dejó de fijar `max-width`/`padding` (hereda el contenedor de WhatsApp).

### Productos (ex-"Catálogo") alimentado desde Compras — COMPLETO (2026-08-02)

Pedido explícito del usuario: "Productos" sobraba como módulo separado de creación manual — un
producto nuevo debería darse de alta automáticamente al registrar su primera Compra, no en un
formulario aparte. La página quedó de solo-lectura/edición (sin creación manual):

- `backend/src/services/compras.service.ts`: `registrarCompra` acepta un `productoNuevo?`
  opcional (`{ nombre, categoria, valorVenta, stockMinimo? }`). Si `codigoProducto` no existe en
  la tabla y se mandó `productoNuevo`, lo crea dentro de la misma transacción que la compra
  (costo inicial = `valorCompraUnitario` de esa primera compra). Si no existe y no se mandó
  `productoNuevo`, error 404 pidiendo incluirlo.
- Frontend Compras: checkbox "Es un producto nuevo" que alterna entre el `<select>` de productos
  existentes y un formulario inline (código/nombre/categoría/precio/stock mínimo).
- Frontend Productos (`productos.component.*`): sin formulario de creación. Edición y borrado
  (Editar/Eliminar) solo visibles/habilitados si `auth.esManagerOAdmin()` — el `user` restringido
  ve la tabla pero no puede modificarla desde ahí (coherente con que el backend ya lo bloquea).
- `backend/src/lib/constantes.ts`: `CATEGORIAS_PRODUCTO` extraído a constante compartida entre
  las rutas de productos y compras (evita duplicar el enum de categorías).
- **Ajuste 2026-08-06:** el usuario pidió revertir el nombre de la página de "Catálogo" a
  "Productos" (nav y `<h1>`) — la ruta sigue siendo `/productos`, solo cambió la etiqueta visible.
  También se quitó la columna "Costo prom." de la tabla (dato interno sensible, visible incluso
  para el rol `user`) y se agregó una columna "Comisión" que calcula, para **quien esté
  logueado**, cuánto ganaría de comisión por ese producto (`valorVenta × usuario.porcentajeComision
  / 100`, usando el propio `%` del usuario en sesión — no el de otro vendedor). Requirió exponer
  `porcentajeComision` en `UsuarioPublico`/`UsuarioSesion` (antes solo viajaba en el detalle del
  módulo Usuarios), así que ahora también viaja en `/api/auth/me` y en la respuesta de login.

### Catálogo público tipo marketplace — COMPLETO (2026-08-02)

Decisiones explícitas del usuario que destrabaron esto (venían diferidas desde antes):
fotos en disco local del VPS (no cloud storage); en vez de mostrar "agotado", los productos sin
stock simplemente **no aparecen** en el catálogo público; y la arquitectura final es el catálogo
como página principal (`/`), con un botón "Ingresar" en la esquina que abre un modal flotante de
login, en vez de una página `/login` separada como flujo primario.

- **Backend — multi-foto:** tabla `fotos_producto` (`codigo_producto` FK, `url`, `orden`) en vez
  de un solo campo `foto_url` — necesario para el carrusel deslizable (varias fotos por
  producto). `backend/src/lib/upload.ts`: `multer` con `diskStorage` guardando en
  `backend/uploads/productos/` (nombre de archivo = UUID, límite 8MB/archivo, 8 archivos, solo
  jpg/png/webp). Servido estático en `/uploads` (`express.static`) — en dev, el proxy de Angular
  (`frontend/proxy.conf.json`) necesitó una entrada extra para `/uploads` además de `/api`, si no
  las imágenes daban 404 en el navegador aunque el archivo existiera en disco.
- **Backend — endpoints de fotos** (`productos.routes.ts`, `requireManagerOrAdmin`):
  `POST /api/productos/:codigo/fotos` (multipart, agrega) y
  `DELETE /api/productos/:codigo/fotos/:fotoId` (borra el registro y el archivo del disco).
- **Backend — catálogo público:** `backend/src/routes/publico.routes.ts`, montado en
  `index.ts` como `app.use("/api/publico", publicoRouter)` **sin** `requireAuth` (antes de
  todas las rutas protegidas). `productosService.listarCatalogoPublico()` filtra
  `stockActual > 0` y hace `select` explícito de solo `codigo, nombre, categoria, valorVenta,
  fotos` — nunca expone `costoPromedio` ni el `stockActual`/`stockMinimo` exactos.
- **Frontend — página pública:** `frontend/src/app/catalogo-publico/` es ahora la ruta `''`
  (sin guard). Grid de tarjetas estilo marketplace; cada tarjeta tiene un carrusel de fotos
  deslizable hecho con CSS puro (`scroll-snap-type: x mandatory` + `overflow-x: auto`, sin
  librería — funciona con swipe táctil real en mobile) y chips de filtro por categoría
  (client-side, sobre la lista ya cargada). El Dashboard se movió de `/` a `/dashboard`
  (sigue con `managerGuard`).
- **Frontend — login como modal:** se extrajo `LoginFormComponent`
  (`frontend/src/app/login/login-form.component.ts`) con la lógica de usuario/password/submit,
  reutilizado en dos lugares: la página `/login` (que se mantiene como ruta de respaldo para
  acceso directo/deep-link) y un modal flotante en `app.html` (`mostrarLogin` signal en
  `app.ts`), abierto con el botón "Ingresar" que aparece en la esquina del nav cuando
  `auth.usuario()` es null. Tras un login exitoso (ruta o modal) se redirige por rol:
  `admin`/`manager` → `/dashboard`, `user` → `/productos` (mismo criterio aplicado también al
  flujo de cambio de contraseña obligatorio).
- **Frontend — gestión de fotos:** en el Catálogo interno (`/productos`, ya protegido por
  `puedeEditar`), el formulario de edición de cada producto incluye miniaturas de sus fotos con
  botón "Eliminar" y un input de archivo múltiple para agregar nuevas.
- Probado end-to-end con Playwright: catálogo vacío sin login → crear producto con stock vía
  Compras → subir foto desde el Catálogo interno → cerrar sesión → el producto aparece en `/`
  con foto/categoría/precio → filtro por categoría → bajar el stock a 0 vía SQL confirma que el
  producto desaparece del catálogo público (sin badge de "agotado").
- **Ajuste 2026-08-02 (segunda vuelta):** pedido explícito del usuario — zoom al pasar el cursor
  sobre la foto (`transform: scale(1.12)` en `.foto-wrapper:hover .foto-slide img`, con
  `overflow: hidden` en el slide para recortarlo) y flechas + puntos de navegación cuando el
  producto tiene más de una foto (antes no había ninguna señal visual de que un producto tuviera
  varias fotos). Las flechas/puntos solo se renderizan `@if (p.fotos.length > 1)`. El punto activo
  se calcula en `onScrollFotos()` a partir de `scrollLeft / clientWidth` del contenedor nativo
  (sin librería de carrusel), y las flechas usan una variable de referencia de plantilla
  (`#carrusel`) para llamar `scrollTo()` directamente sobre el div nativo de cada tarjeta.
  También se agregó el link "Vista pública ↗" en el nav autenticado (`target="_blank"`) porque
  el admin no tenía forma de ver el catálogo como lo ve un comprador — el link "Catálogo" del nav
  siempre apuntaba al Catálogo interno (`/productos`), no al público.

### Comisiones de vendedores — COMPLETO (2026-08-02)

Pedido explícito del usuario: registrar quién hizo cada venta (para `user` y `manager`), que el
admin pueda ver/ajustar el % de comisión de cada usuario desde el módulo Usuarios, que el manager
pueda filtrar ventas por vendedor y liquidar comisiones (marcar cuáles ya se pagaron), y generar
un PDF tipo factura de liquidación. **Decisión de negocio confirmada con el usuario:** la
comisión se calcula sobre el valor total de la venta (`valor_total_venta`), no sobre la ganancia.

- **Captura del vendedor:** `vendedor_id` en `ventas` se asigna **en el backend** a partir de
  `req.usuario.id` (la sesión autenticada) en `POST /api/ventas` — nunca lo manda el cliente, así
  que no se puede falsear. Aplica a cualquiera de los 3 roles que registre una venta.
- **Cálculo de comisión:** mismo patrón que `costo_promedio_al_momento` — al registrar la venta
  se copian `comision_porcentaje` (del `usuarios.porcentaje_comision` del vendedor en ese
  momento) y se calcula `comision = valor_total_venta × comision_porcentaje / 100`, guardados en
  la fila de la venta. Así, si el admin cambia el % de un vendedor después, las comisiones ya
  generadas no cambian retroactivamente.
- **Backend — ajuste de %:** `PUT /api/usuarios/:id/comision` (`requireAdmin`, dentro de
  `usuariosRouter`) — separado del endpoint de creación/edición general a propósito, mismo
  patrón que el reset de password.
- **Backend — módulo de comisiones:** `backend/src/services/comisiones.service.ts` +
  `backend/src/routes/comisiones.routes.ts`, montado en `/api/comisiones` con
  `requireManagerOrAdmin` completo (ningún endpoint de este módulo es accesible para el rol
  `user`, ni siquiera para ver su propio resumen — el `user` solo ve su comisión por venta
  individual en la tabla de Ventas, no el módulo de liquidación).
  - `GET /vendedores` — lista liviana (id, nombre, apellido, %) para el filtro de Ventas y el
    selector de Comisiones, sin exponer el resto de campos de `usuarios` (ese detalle completo
    sigue exclusivo de `/api/usuarios`, que sigue siendo solo-admin).
  - `GET /resumen` — agrupa por vendedor las ventas con `comision_estado = pendiente`.
  - `GET /vendedores/:id/pendientes` — detalle de esas ventas para un vendedor.
  - `POST /vendedores/:id/liquidar` — toma **todas** las ventas pendientes de ese vendedor (no
    hay selección parcial en esta primera versión), crea una fila en `liquidaciones_comision`,
    y marca esas ventas como `liquidada` con su `liquidacion_id`. Transaccional.
  - `GET /liquidaciones` (+ `?vendedorId=`) — historial.
  - `GET /liquidaciones/:id/pdf` — genera el PDF on-demand con `pdfkit`
    (`backend/src/lib/pdf-liquidacion.ts`, encabezado Camelia + tabla de ventas incluidas +
    total), `Content-Disposition: inline` para que abra como preview en una pestaña nueva en vez
    de forzar la descarga silenciosa.
- **Frontend — Usuarios:** columna "Comisión %" con input numérico + botón "Guardar" por fila
  (`PUT .../comision`), solo visible porque toda la página ya es admin-only.
- **Frontend — Ventas:** columna "Vendedor" y "Comisión" (con badge pendiente/liquidada) en la
  tabla, visibles para los 3 roles (mismo nivel de transparencia que el resto de la tabla, que
  ya era visible para todos). El selector "Filtrar por vendedor" solo se renderiza
  `@if (auth.esManagerOAdmin())`.
- **Frontend — página Comisiones** (`frontend/src/app/comisiones/`, ruta `/comisiones` con
  `managerGuard`, nueva pestaña en el nav junto a Compras): tabla de comisiones pendientes por
  vendedor con detalle expandible y botón "Liquidar" (liquida todas las pendientes de ese
  vendedor de una vez), e historial de liquidaciones con botón "Descargar PDF"
  (`window.open` a la URL del PDF — la cookie httpOnly viaja automáticamente por ser same-origin).
- Probado end-to-end con Playwright: usuario restringido (`user`) registra una venta → como
  admin se ve el vendedor y la comisión "pendiente" en Ventas, con el filtro por vendedor
  funcionando → en Comisiones aparece el resumen pendiente → "Ver detalle" muestra la venta →
  "Liquidar" genera la liquidación y la mueve al historial → "Descargar PDF" abre un PDF con el
  membrete Camelia, la tabla de ventas liquidadas y el total — contenido verificado directamente.

### Ajustes a Ventas: vendedor asignable, edición, cliente nuevo, cuotas — COMPLETO (2026-08-06)

Varios ajustes pedidos sobre la marcha tras usar el módulo de comisiones y de cuotas en la
práctica:

- **Cliente nuevo desde Ventas:** igual que Compras con productos, el campo comprador ahora
  tiene un checkbox "Es un cliente nuevo" que revela celular+nombre inline en vez de exigir
  crearlo antes desde Compradores. `ventasService.registrarVenta`/`actualizarVenta` reciben
  `compradorNuevo?: { nombre }` y lo crean dentro de la misma transacción si el celular no
  existe (mismo patrón que `productoNuevo` en compras).
- **Vendedor asignable por manager/admin:** al registrar (o editar) una venta, manager/admin ven
  un selector "Vendedor" (poblado con `GET /api/comisiones/vendedores`) para asignarla a
  cualquier usuario — por defecto viene pre-seleccionado el propio usuario en sesión. El backend
  solo respeta ese `vendedorId` del body si `req.usuario.rol` es `admin`/`manager`; para `user`
  siempre se fuerza a `req.usuario.id` sin importar lo que mande el cliente (no se puede
  falsear). El rol `user` no ve el selector — su venta siempre queda a su propio nombre.
- **Edición de ventas (manager/admin):** `PUT /api/ventas/:id` (`requireManagerOrAdmin`) permite
  corregir comprador, cantidad, valor, medio de pago, canal y vendedor de una venta ya
  registrada. Recalcula stock (revierte la cantidad anterior y aplica la nueva, validando
  disponibilidad), ganancia (conservando el `costo_promedio_al_momento` original — nunca se
  recalcula con el costo actual del producto) y comisión (con el % del vendedor vigente al
  momento de editar). Bloqueada con 400 si la venta ya fue liquidada o si alguna de sus cuotas
  ya está pagada — evita descuadrar una liquidación ya generada o un pago ya cobrado. El
  frontend (`ventas.component`) oculta el botón "Editar" en esos casos (`puedeEditarVenta()`) en
  vez de dejar que el usuario choque con el error.
- **Recargo por cuotas — global con ajuste puntual:** se quitó el campo "Recargo por cuotas" del
  formulario de *nueva* venta — ahora se registra automáticamente el valor global configurado en
  `configuracion_app.recargo_cuotas_global` (editable desde una tarjeta nueva en el módulo
  Comisiones, `GET/PUT /api/comisiones/configuracion`, mismo patrón que la config de WhatsApp).
  Al *editar* una venta a cuotas sí aparece el campo recargo, editable puntualmente para esa
  venta sin tocar el valor global ni afectar otras ventas.
- **Frecuencia de cuotas:** nuevo campo `frecuencia_cuotas` (semanal/quincenal/mensual,
  7/15/30 días entre cuotas respectivamente) seleccionable al registrar o editar una venta a
  cuotas — reemplaza el `DIAS_ENTRE_CUOTAS = 30` fijo que había antes.
- **Redondeo de cuotas:** decisión explícita del usuario — cada cuota (salvo la última) se
  redondea a la centena más cercana (`Prisma.Decimal.toNearest(100)`) en vez de dejar centavos
  exactos de la división; la última cuota sigue absorbiendo la diferencia de redondeo para que
  la suma de todas las cuotas cuadre exacto con `valor_total_venta`.
- **Cuotas pendientes — solo la próxima por venta:** en la tabla "Cuotas pendientes" de Ventas,
  antes se veían 1/3, 2/3 y 3/3 de una misma venta a la vez. Ajuste explícito del usuario: ahora
  solo se muestra la cuota más próxima sin pagar de cada venta; al marcarla pagada, la siguiente
  aparece sola. Es un filtro **solo de esa tabla en el frontend** (`cargarCuotasPendientes()`
  se queda con la primera cuota no pagada por `idVenta`, ya que el listado del backend viene
  ordenado por `fecha_vencimiento` asc) — no se tocó el backend ni las métricas de cartera del
  dashboard, que sí necesitan ver todas las cuotas pendientes/atrasadas para calcular el total
  real por cobrar.

### Compras y edición de productos abiertas a todos los roles, proveedor, lightbox — COMPLETO (2026-08-08)

Pedido explícito del usuario, ya con la app en producción:

- **Compras y edición de productos ya no son exclusivos de manager/admin** — el rol `user`
  restringido ahora también puede registrar compras (`/api/compras` pasó de
  `requireManagerOrAdmin` a solo `requireAuth`) y editar productos existentes, incluyendo
  gestionar sus fotos (`PUT /api/productos/:codigo`, `POST/DELETE .../fotos` ya no llevan
  `requireManagerOrAdmin`). **Crear un producto directamente (sin pasar por Compras) y
  eliminarlo siguen restringidos a manager/admin** — no se tocó ese endpoint. En el frontend,
  `ProductosComponent` separa `puedeEditar` (ahora `true` para los 3 roles) de `puedeEliminar`
  (sigue `esManagerOAdmin()`), mostrando/ocultando los botones Editar y Eliminar por separado.
- **Campo `proveedor` en `productos`** (nuevo, opcional) — a diferencia del `proveedor` de
  `compras_inventario` (que es histórico, por cada compra individual), este es un dato propio
  del producto, editable desde el formulario de edición en Productos.
- **Lightbox en el catálogo público:** al hacer clic en una foto dentro del carrusel de una
  tarjeta, se abre una superposición a pantalla completa con la foto en grande, flechas/puntos
  de navegación si hay varias fotos, y se cierra con el botón ×, clic en el fondo, o `Escape`
  (`@HostListener('document:keydown', ...)` en `catalogo-publico.component.ts`).

### Categorías como texto libre (sin tabla, sin enum) — COMPLETO (2026-08-08)

Pedido explícito del usuario: no crear un módulo de gestión de categorías con su propia tabla
— más simple, `categoria` pasa a ser texto libre en `productos`, editable como cualquier otro
campo, y las categorías que se muestran para filtrar/sugerir se derivan de las que ya están en
uso en vez de una lista fija en código.

- **Migración de enum a texto** (`categoria_texto_libre`): cambiar un enum de Postgres con
  datos existentes a texto **no se puede hacer con un simple diff de Prisma** — el
  auto-generado quería hacer `DROP COLUMN` + `ADD COLUMN NOT NULL` (habría fallado o perdido
  datos). Se generó con `prisma migrate dev --create-only` y se reescribió a mano:
  `ALTER TABLE productos ALTER COLUMN categoria TYPE TEXT USING categoria::text` (cast
  enum→text que preserva los valores) seguido de `DROP TYPE "CategoriaProducto"`. Verificado
  comparando el `SELECT codigo, categoria FROM productos` antes y después del migrate — idéntico.
- **Backend:** `Producto.categoria` es `String` en el schema (ya no hay enum
  `CategoriaProducto`). Los endpoints de creación/edición de producto y de `productoNuevo` en
  Compras validan `categoria` con `z.string().min(1)` en vez de `z.enum(CATEGORIAS_PRODUCTO)`.
  `backend/src/lib/constantes.ts` (la lista fija) se eliminó por completo, ya no tiene uso.
- **Frontend:** el tipo `Categoria` en `domain.models.ts` pasó de union literal
  (`'arete' | 'anillo' | ...`) a `string`. En vez de un `<select>` con opciones fijas, el campo
  categoría en el formulario de edición de Productos y en "producto nuevo" de Compras es un
  `<input>` con `<datalist>` — sugiere autocompletar con las categorías ya usadas
  (`categoriasSugeridas = computed(...)` derivado de la lista de productos ya cargada en cada
  componente, sin pegarle a un endpoint nuevo) pero permite escribir cualquier valor nuevo. Los
  chips de filtro del catálogo público (`catalogo-publico.component.ts`) se calculan igual, como
  `computed()` sobre los productos públicos ya cargados — escribir una categoría nueva en un
  producto la hace aparecer automáticamente como chip de filtro la próxima vez que alguien entre
  al catálogo, sin tocar código.
- Probado end-to-end: editar un producto con una categoría nueva ("Edición Especial") desde
  Productos → aparece sugerida en el datalist junto a las categorías previas → guarda bien →
  aparece como chip nuevo en el catálogo público junto a las demás.

### Edición de compras + más columnas en el historial — COMPLETO (2026-08-08)

Pedido explícito del usuario: la tabla de historial de Compras mostraba muy poco contexto del
producto (solo nombre), y no había forma de corregir una compra ya registrada.

- **Historial de compras** ahora también muestra código, categoría y valor de venta del
  producto (unidos desde la lista de productos ya cargada, sin pegarle a un endpoint nuevo),
  además de lo que ya tenía (cantidad, valor unitario, proveedor, fecha).
- **Editar una compra** (`PUT /api/compras/:id`, abierto a los 3 roles igual que el resto de
  Compras) permite corregir cantidad, valor unitario, proveedor y fecha de una compra ya
  registrada. La parte delicada: el costo promedio ponderado depende del **orden cronológico**
  de las compras, así que a diferencia de `registrarCompra` (que solo suma incrementalmente
  sobre el costo actual — válido porque una compra nueva siempre es la más reciente), editar
  una compra **recalcula el costo promedio desde cero repasando todo el historial de compras
  del producto** en orden de `fecha_compra`, y luego resta el total vendido para obtener el
  stock final. Bloqueado con 400 si el cambio dejaría el stock en negativo (ej. reducir la
  cantidad de una compra por debajo de lo que ya se vendió de ese lote).
- Probado end-to-end: editar la cantidad de una compra existente (10 → 15 unidades) y confirmar
  que tanto `stock_actual` como `costo_promedio` del producto quedaron exactamente iguales al
  cálculo manual esperado.

### Margen por producto: costo de compra real en vez de costo promedio — COMPLETO (2026-08-08)

Pedido explícito del usuario: para reportes externos no aceptan el `costo_promedio` ponderado
como base del margen ("no refleja lo que realmente costó ese stock" — mezcla compras viejas y
nuevas a distinto precio). Se pidió usar el precio de compra real, y agregar una fila de totales
(sumatoria) a las columnas de precio de venta y costo de compra, igual que ya se sumaba el
precio de venta.

- `backend/src/services/metrics.service.ts` (`margenPorProducto`): en vez de leer
  `productos.costo_promedio`, trae todas las `compras_inventario` ordenadas por
  `fecha_compra desc, id desc` y se queda con la primera (= más reciente) por producto —
  ese `valor_compra_unitario` es el "costo de compra" usado tanto para mostrarlo en la tabla
  como para calcular el margen (`(valor_venta - costo_compra) / valor_venta`). Si un producto no
  tiene ninguna compra registrada (no debería pasar, ya que todo producto nace de una Compra —
  ver "Productos alimentado desde Compras" arriba) cae de vuelta a `costo_promedio` como
  fallback, solo para no romper la fila.
- Campo renombrado de `costoPromedio` a `costoCompra` en la respuesta de
  `GET /api/metrics/margen-productos` y en el modelo `MargenProducto` del frontend — el nombre
  ya no debía sugerir un promedio.
- Frontend (`dashboard.component.html`): columna "Costo prom." renombrada a "Costo compra", y se
  agregó un `<tfoot>` con la fila "Total" (colspan sobre Producto/Categoría) sumando Precio
  venta y Costo compra de todos los productos listados — `margenTotales` es un `computed()` en
  `dashboard.component.ts` derivado de `margenProductos()`. Estilo compartido `.fila-total` en
  `styles.scss` (borde superior, negrita) reutilizable por cualquier otra tabla que necesite una
  fila de totales en el futuro.

### Productos y Compras: orden por nombre, numeración de filas, edición en modal — COMPLETO (2026-08-09)

Pedido explícito del usuario: en Productos y Compras, ordenar por nombre del producto y agregar
una columna de numeración (1, 2, 3…) a cada tabla; además, que en Compras se pueda editar
**todos** los campos de una compra (antes no se podía reasignar a otro producto), y que en
ambas páginas el formulario de edición no quede fijo arriba de la vista — el usuario aceptó
explícitamente que fuera "una ventana flotante" en vez de una fila inline, la opción más simple
de implementar de forma robusta (evita el manejo de `colspan` dinámico dentro de la tabla).

- **Orden:** `productos.service.ts` (`listarProductos`) cambió `orderBy: { codigo: "asc" }` a
  `{ nombre: "asc" }`. `compras.service.ts` (`listarCompras`) cambió `orderBy: { fechaCompra:
  "desc" }` a `orderBy: [{ producto: { nombre: "asc" } }, { fechaCompra: "desc" }]` (ordena por
  nombre de producto vía la relación, con fecha descendente como criterio secundario dentro del
  mismo producto) — Prisma soporta `orderBy` anidado sobre una relación *-a-uno.
- **Numeración:** columna `#` nueva al inicio de ambas tablas, usando el `$index` implícito del
  `@for` de Angular (`let i = $index`, `{{ i + 1 }}`) — no requirió cambios de backend.
- **Editar compra: todos los campos, incluida la reasignación de producto.**
  `ActualizarCompraInput` ganó `codigoProducto?: string` (opcional — si no se manda, se conserva
  el producto original). `actualizarCompra` en `compras.service.ts` se reestructuró extrayendo
  `recalcularProducto(tx, codigoProducto)` (la misma lógica de repasar todo el historial de
  compras en orden cronológico que ya existía, ahora factorizada en una función reutilizable).
  Si `codigoProducto` cambia, se recalculan **los dos productos** dentro de la misma transacción
  — el de origen (ya sin esa compra) y el de destino (ahora con ella) — cada uno con su propio
  guard de stock negativo. Probado end-to-end vía API: mover una compra de `SEED-ARE-01` (stock
  24) a `SEED-ARE-02` (stock 11) dejó origen en 4 y destino en 31, con el costo promedio
  ponderado de ambos recalculado correctamente; revertir el cambio devolvió a los dos productos
  exactamente a sus valores originales. También se confirmó que el guard de stock negativo se
  dispara igual al reasignar (probado con una compra cuyo producto de origen no tenía suficiente
  stock para cubrir lo ya vendido).
- **Formularios de edición como modal flotante:** el shell de modal que ya existía solo para el
  login (`.modal-backdrop`/`.modal-panel`/`.modal-close`, antes en `app.scss`, con ámbito
  exclusivo al componente `App`) se promovió a `styles.scss` (global) para poder reutilizarlo en
  Productos y Compras — se ensanchó el `max-width` por defecto (340px → 480px, más cómodo para
  formularios con más campos) y se agregó `max-height: calc(100vh - 48px)` + `overflow-y: auto`
  al panel (por si el formulario de Productos, con la sección de fotos, no cabe en pantallas
  bajas), preservando el ancho angosto original del login vía una clase modificadora
  `.modal-panel-angosto`. `productos.component.html` y `compras.component.html` movieron sus
  tarjetas de edición (antes fijas arriba de la tabla) a este modal, controlado por las mismas
  señales que ya existían (`editandoCodigo()` / `editandoCompraId()`) — cerrar con la × o con
  clic en el fondo llama al mismo método `cancelarEdicion()`/`cancelarEdicionCompra()` de
  siempre.

### Bug de timezone: fechas de venta/cuotas se guardaban hasta 5h (a veces 1 día) adelantadas — CORREGIDO (2026-08-09)

Reportado por el usuario: registró datos el 8 de agosto y la fecha guardada ya mostraba 9 de
agosto. **Causa raíz:** `fecha_venta`, `fecha_pago` y `fecha_vencimiento` son columnas Postgres
`timestamp`/`date` **sin timezone** ("naive"). Prisma trata esas columnas como si siempre fueran
UTC, tanto al leer como al escribir — **ignora el timezone de sesión de Postgres** (que sí está
bien configurado en `America/Bogota`, tanto local como en producción, pero eso solo afecta a los
defaults `DEFAULT CURRENT_TIMESTAMP` que resuelve el propio Postgres, no a los valores que la
app arma en Node con `new Date()` y le pasa a Prisma). Colombia es UTC-5, así que cualquier venta
o pago registrado en Node y escrito directamente quedaba con la hora UTC real en vez de la hora
de Bogotá — 5 horas adelantada, y para cualquier evento después de las ~7pm, un día completo
adelantado. El bug se **confirmó también en `fecha_vencimiento`** de las cuotas (`generarCuotas`
en `ventas.service.ts`, que hacía la aritmética de "sumar N días" con getters/setters *locales*
sobre un `Date` cuya semántica real ya no coincidía) — o sea, no era solo cosmético: podía
adelantar un día el vencimiento real de una cuota para ventas nocturnas, afectando cuándo se
marca "atrasada" y cuándo dispara el recordatorio de WhatsApp.

**Nota importante:** el bug NO afecta a Compras — `fecha_compra` cuando se manda explícita viene
de un `<input type="date">` (solo día, sin hora), y un string `"yyyy-mm-dd"` se parsea en JS
como medianoche UTC, que es exactamente lo que Prisma termina escribiendo — coincide por
construcción, sin necesidad de ningún ajuste.

- **Fix (decisión explícita del usuario: corregir el código hacia adelante, sin migración de
  base de datos ni corrección de datos históricos ya guardados):** `backend/src/lib/fecha-
  bogota.ts`, función `comoBogota(instanteReal: Date): Date` — dado un instante real, devuelve
  un `Date` desplazado -5h tal que sus **getters/setters UTC** (no los locales — deliberado, así
  no depende de qué timezone tenga configurado el proceso Node del servidor) coinciden con la
  hora de Bogotá. Ese valor se pasa directo a Prisma; cualquier aritmética de fechas posterior
  sobre él debe usar getters/setters UTC, nunca locales.
- `ventas.service.ts` (`registrarVenta`): `fechaVenta = input.fechaVenta ?? new Date()` ahora se
  envuelve en `comoBogota(...)` — cubre tanto el caso real (venta sin fecha explícita, el 100%
  de las ventas desde la UI hoy) como el caso interno del script de seed (que sí manda
  `fechaVenta` explícita para simular ventas pasadas). `generarCuotas` se ajustó para sumar los
  días de cada cuota con `getUTCDate()/setUTCDate()` en vez de `getDate()/setDate()`, ya que
  ahora opera sobre un `Date` ya desplazado por `comoBogota()`.
- `cuotas.service.ts` (`marcarCuotaPagada`): `fechaPago: new Date()` → `fechaPago:
  comoBogota(new Date())`.
- **Verificado en vivo** (con la hora real en 9:36pm Bogotá, la ventana exacta donde el bug se
  manifestaba): se registró una venta real vía API y se confirmó en la fila cruda de Postgres
  (`psql`) que `fecha_venta` quedó en `2026-08-09 21:37:57` (coincide exacto con la hora real,
  antes habría quedado `2026-08-10 02:37:57`), y que `fecha_vencimiento` de sus cuotas cayó en
  el día calendario correcto. Se repitió la verificación marcando una cuota como pagada
  (`fecha_pago`) con el mismo resultado. Ambas pruebas se revirtieron después para no ensuciar
  los datos de desarrollo.
- **Alcance de lo que quedó SIN corregir, a propósito:** los registros históricos ya guardados
  (sobre todo `ventas.fecha_venta`, ya que ese código siempre construía la fecha con el bug) se
  dejaron intactos por decisión explícita del usuario — pueden seguir mostrando hasta 5h/1 día de
  más para ventas anteriores a este fix. Otros `new Date()` de menor impacto (fecha_envio/
  fecha_fin de envíos masivos de WhatsApp, fecha_creacion) tienen la misma clase de bug pero no
  se tocaron — quedan fuera del alcance que el usuario aprobó (ventas, compras, vencimiento de
  cuotas) y son metadata operativa de bajo riesgo, no registros financieros.

### Ganancia por costo de última compra, compra por lote, busquedas, ajustes a los modales de edición — COMPLETO (2026-08-09)

Ronda de ajustes tras usar en la práctica los modales de edición de Productos/Compras del
batch anterior:

- **Ganancia de ventas: costo de la última compra en vez de promedio ponderado (decisión
  explícita del usuario).** Antes solo el panel "Margen por producto" del dashboard usaba el
  costo de la última compra; ahora `ganancia` en cada venta nueva también — es un cambio
  financiero real, no cosmético (afecta comisiones y reportes de ganancia hacia adelante). Ver
  el ajuste en el modelo de datos de `ventas` arriba. `backend/src/services/compras.service.ts`
  expone `costoUltimaCompra(tx, codigoProducto)` (consulta la compra más reciente por
  `fecha_compra desc, id desc` — mismo criterio que ya usaba `margenPorProducto`);
  `ventas.service.ts` (`registrarVenta`) la usa para `costoPromedioAlMomento`, con fallback al
  `producto.costoPromedio` solo si el producto no tiene ninguna compra (no debería pasar).
  `actualizarVenta` no cambió — sigue conservando el `costoPromedioAlMomento` original de la
  venta, nunca lo recalcula (mismo patrón de snapshot histórico de siempre).
- **Compras: al crear un producto nuevo desde una compra, el producto hereda el proveedor de
  esa compra** (`registrarCompraEnTx` en `compras.service.ts`) — antes quedaba en `null` siempre
  (el campo `proveedor` de producto es reciente y nada lo poblaba al crear vía Compras), lo que
  hacía que el formulario de edición de Productos se viera "vacío" para todo producto nunca
  editado a mano. Solo aplica hacia adelante — los productos ya existentes con `proveedor = null`
  no se tocaron.
- **Modal de edición de Compras — ahora también edita Categoría y Valor de venta del producto**
  (pedido explícito: "no deja editar... categoria" / "me permite editar valor de compra y no
  valor de venta"). Estos dos son campos del **producto**, no de la compra — al guardar, primero
  se hace `PUT /api/compras/:id` (cantidad/valor unitario/proveedor/fecha/producto) y luego,
  sobre el `codigoProducto` que haya quedado seleccionado, un `PUT /api/productos/:codigo` parcial
  con solo `{ categoria, valorVenta }` (el backend ya soportaba updates parciales — se ajustó el
  tipo `ActualizarProductoInput` del frontend, antes marcaba esos campos como obligatorios sin
  necesidad). Si se reasigna la compra a otro producto con el selector, los campos
  Categoría/Valor de venta se refrescan al instante (`onCambioProductoEdicion()`) para reflejar
  el producto recién elegido, no el original. El título del modal pasó de "Editar compra #N" a
  simplemente "Editar compra" — el ID de compra no aparece en ningún lado de la tabla (que ahora
  ordena por nombre de producto, no por ID), así que mostrarlo confundía. Se quitó también la
  palabra "costo promedio" de los mensajes visibles (hint y toast de éxito) del módulo de
  Compras — sigue siendo internamente el promedio ponderado el que se recalcula y guarda en
  `productos.costo_promedio` (compras.service.ts no cambió esa parte), pero ya no se le nombra
  al usuario para no generar la confusión de que sea el mismo número que ahora usa Ganancia.
- **Barra de búsqueda con autocompletado en Productos y Compras** — filtra por nombre o código
  (pedido explícito: "que la busqueda pueda ser por nombre y codigo"), con un `<datalist>`
  alimentado por los nombres/códigos ya registrados (`computed()` sobre la lista ya cargada, sin
  endpoint nuevo) para autocompletar mientras se escribe. `productosFiltrados`/`comprasFiltradas`
  son `computed()` derivados de `busqueda()` + la lista completa — la numeración de filas (`#`)
  y el conteo del encabezado (`Productos (N)` / `Historial de compras (N)`) se recalculan sobre
  la lista ya filtrada.
- **Compra por lote** (pedido explícito: cargar 15-20 productos de un mismo proveedor en una
  sola compra) — pantalla nueva en `/compras/lote` (link "Usa la compra por lote →" desde
  Compras), con Proveedor/Fecha compartidos arriba y filas dinámicas abajo (botón "+ Agregar
  línea" / "Quitar línea" por fila; cada fila puede ser un producto existente o, con un
  checkbox, un producto nuevo con su propio código/nombre/categoría/valor de venta/stock
  mínimo). Al guardar, **todas las líneas se registran en una sola transacción** — o se
  registran todas o ninguna, para no dejar la compra a medias si una línea falla. Backend:
  `POST /api/compras/lote` (`registrarCompraLoteSchema` en `compras.routes.ts`,
  `registrarCompraLote` en `compras.service.ts`) reutiliza la lógica de `registrarCompra` sin
  duplicarla — se extrajo `registrarCompraEnTx(tx, input)` (recibe el `tx` de la transacción en
  vez de abrir una propia) de la que ahora cuelgan tanto `registrarCompra` (abre su propia
  transacción de una sola línea, sin cambios de comportamiento) como `registrarCompraLote`
  (abre una transacción y llama `registrarCompraEnTx` en un loop, una vez por línea, con el
  proveedor/fecha del lote aplicados a cada una). Probado end-to-end: lote de 2 líneas (un
  producto existente + un producto nuevo) registró ambas compras, el producto nuevo quedó creado
  con el proveedor del lote, y una venta posterior del producto existente tomó como costo la
  compra más reciente (la del lote), no el promedio ponderado — confirmando que también quedó
  bien conectado con el cambio de Ganancia de este mismo batch.

### Selector de producto con filtro (Ventas, Compras, Compra por lote) — COMPLETO (2026-08-17)

Pedido explícito del usuario: al registrar una venta, poder buscar el producto escribiendo
letras del nombre o el código en vez de scrollear un `<select>` con todos los productos.
Confirmado con el usuario aplicarlo también en Compras (registrar y reasignar en el modal de
edición) y en Compra por lote, ya que tenían el mismo problema.

- `frontend/src/app/shared/producto-selector/producto-selector.component.ts` — componente
  reutilizable con un `<input>` de texto + lista desplegable filtrada (no usa `<datalist>`,
  porque el valor real que necesita el formulario es el `codigo` del producto, no el texto
  visible, y un `<datalist>` no distingue eso de forma confiable). API: `[productos]` (lista
  completa), `[(codigo)]` (dos vías, mismo patrón que `[(ngModel)]`), `(codigoChange)` opcional
  si el padre necesita reaccionar a la selección (ej. recalcular precio sugerido). Filtra por
  `nombre` o `codigo` (case-insensitive, substring) mientras se escribe; al hacer click en un
  resultado (con `(mousedown)`, no `(click)`, para que corra antes del `blur` del input) fija el
  `codigo` y muestra `"Nombre (CODIGO)"`; si el usuario escribe algo y sale del campo sin elegir
  un resultado de la lista, el texto se descarta y vuelve a mostrar el producto ya seleccionado
  (o queda vacío) — el `codigo` real nunca cambia por texto libre, solo por click explícito.
- Reemplaza el `<select>` de producto en: `ventas.component.html` (Nueva venta),
  `compras.component.html` (Registrar compra, y el selector de reasignación de producto dentro
  del modal "Editar compra"), y `compra-lote.component.html` (cada línea). No se tocó el
  `<select>` de Compradores/Vendedores/Canal/etc. — el pedido era específicamente sobre el
  volumen de productos.
- Probado end-to-end: buscar "anillo"/"SEED-COL"/"manilla" filtra correctamente por nombre y
  código en las 3 páginas; una venta registrada eligiendo el producto por este selector calculó
  bien el precio sugerido y guardó el `codigo` correcto; una compra registrada de la misma forma
  quedó contra el producto correcto en la base de datos (verificado directamente por SQL).

### Auditoría del ciclo de vida de ventas/cuotas: editar fecha de cuota, eliminar venta — COMPLETO (2026-08-17)

Pedido explícito del usuario: validar que el ciclo de vida de ventas a cuotas fuera correcto
(una venta = un producto hoy, de dónde sale el recargo por cuotas, si comisión/ganancia
incluyen ese recargo, fechas de cuotas según frecuencia) y confirmar/agregar dos capacidades
que faltaban. Hallazgos de la auditoría (sin cambios de código, ya funcionaban así por diseño):
recargo se toma del global al crear y es ajustable solo al editar; comisión y ganancia SÍ se
calculan sobre `valor_total_venta` (incluye el recargo), tanto al crear como al editar; las
fechas de cuota son `fecha_venta + (7|15|30 × N)` días exactos — "mensual" es un paso fijo de
30 días, no "mismo día del próximo mes calendario" (a tener en cuenta, no es un bug); editar
una venta a cuotas borra y regenera TODAS sus cuotas, pero está bloqueado si alguna ya fue
pagada o la comisión ya se liquidó, así que nunca se pierde historial de pago.

Dos capacidades confirmadas como faltantes y construidas en esta ronda:

- **Editar la fecha de vencimiento de UNA cuota puntual**, sin regenerar las demás cuotas de
  esa venta. `cuotas.service.ts` (`actualizarFechaCuota`) — bloqueado con 400 si la cuota ya
  está pagada; al cambiar la fecha se resetea `recordatorio_enviado` a `false` (para que el
  cron de WhatsApp reevalúe la nueva fecha) y `estado` vuelve a `pendiente`
  (`marcarAtrasadas()` la reclasifica a `atrasada` en la próxima consulta si corresponde).
  `PATCH /api/cuotas/:id/fecha`, sin restricción de rol adicional a nivel de API pero el botón
  "Editar fecha" en el frontend solo se muestra a manager/admin (mismo nivel que editar la
  venta). UI: edición inline en la fila de la tabla "Cuotas pendientes" (input de fecha +
  Guardar/Cancelar), mismo patrón que otras ediciones inline de la app.
- **Eliminar una venta completamente (solo admin).** `ventas.service.ts` (`eliminarVenta`) —
  mismo guard que `actualizarVenta` (bloqueada si la comisión ya se liquidó o si alguna cuota
  ya está pagada), y además revierte el stock (`stock_actual += cantidad`) y borra las cuotas
  de la venta antes de borrar la venta misma (el schema no tiene `onDelete: Cascade` en esa
  relación), todo en una sola transacción. `DELETE /api/ventas/:id` con `requireAdmin` (a
  diferencia de editar, que es manager/admin — el usuario pidió explícitamente que el borrado
  fuera exclusivo de admin). Botón "Eliminar" en la tabla de Ventas, con `confirm()` del
  navegador, visible solo si `auth.esAdmin()` y la venta cumple el mismo guard (no liquidada,
  sin cuotas pagadas) — `puedeEliminarVenta()` en el frontend espeja el guard del backend para
  no mostrar un botón que el backend va a rechazar.
- Probado end-to-end: editar la fecha de una cuota pendiente actualizó el campo correctamente
  (verificado en crudo contra la API); intentar editar la fecha de una cuota ya pagada devolvió
  400; intentar eliminar una venta con una cuota pagada devolvió 400; eliminar una venta sin
  cuotas pagadas restauró el stock exacto (24 → 21 al vender 3 unidades → 24 de nuevo al
  eliminar), borró sus cuotas, y un `GET` posterior a esa venta devolvió 404.

El pendiente de diseño mencionado en esta auditoría (ventas con varias líneas de producto) se
implementó en la misma ronda — ver siguiente sección.

### Ventas multi-línea: varios productos por venta — COMPLETO (2026-08-17)

Pedido explícito del usuario, planeado con `EnterPlanMode` antes de tocar código dado el
alcance (toca el schema, `metrics.service.ts` casi completo, `ventas.service.ts`, y el
formulario de Ventas). Contexto que simplificó la migración: en producción solo había 2 ventas
(una duplicada del mismo cliente) y el usuario las borró antes de migrar — no hubo que
preservar datos históricos, solo confirmar `ventas` vacía antes del `DROP COLUMN`.

**Decisiones de diseño confirmadas con el usuario:**
1. **Precio editable por línea, sin total libre de toda la venta.** Antes se podía escribir
   cualquier "Valor a cobrar" total (descuento general). Con varios productos de distinto costo
   en una venta, no hay forma de repartir ese descuento sin inventar una regla arbitraria de
   ganancia por producto — cada línea tiene su propio `valor_unitario` editable (por defecto el
   precio de catálogo, mismo patrón que ya usa Compra por lote), y el total de la venta se
   **deriva** como la suma de `valor_unitario × cantidad` de todas las líneas.
2. **Editar una venta permite agregar/quitar/cambiar productos**, no solo ajustar cantidad/precio
   de lo que ya estaba — ver diseño abajo.

**Schema:** nuevo modelo `VentaItem` (ver `venta_items` en el modelo de datos arriba),
`onDelete: Cascade` desde `Venta`. `Venta` pierde `codigoProducto`/`cantidad`/
`costoPromedioAlMomento` y su relation directa a `Producto`; gana `items VentaItem[]`. Migración
generada con `prisma migrate dev --create-only` (mismo patrón que `categoria_texto_libre`) — en
este caso el SQL autogenerado ya era seguro de aplicar tal cual porque la tabla estaba vacía
(sin `USING` cast necesario, a diferencia de la migración de categoría que sí tenía datos que
preservar).

**`ventas.service.ts` — `registrarVenta`/`registrarVentaEnTx`:** input pasa de
`{ codigoProducto, cantidad, valorContado? }` a `{ items: [{ codigoProducto, cantidad,
valorUnitario? }] }`. La cantidad se agrupa por producto **antes** de validar/descontar stock
(un mismo producto puede aparecer en dos líneas — validar/descontar por línea en vez de por
producto agregado dejaría pasar combinaciones que en total superan el stock). Por línea:
`valorUnitario = item.valorUnitario ?? producto.valorVenta`; `costoUnitarioAlMomento =
costoUltimaCompra(tx, codigo) ?? producto.costoPromedio` (reutiliza el helper que ya existía en
`compras.service.ts`, ahora llamado por línea en vez de una vez). `generarCuotas` **no
cambió** — ya solo dependía del `valorTotalVenta` agregado y el id de venta.

**`actualizarVenta` — la parte más delicada:** el usuario pidió poder agregar/quitar/cambiar
productos al editar, no solo ajustar los que ya estaban. Diseño: cada línea del input trae un
`id` opcional — presente si es una línea existente que se ajusta (preserva su
`costoUnitarioAlMomento` histórico, igual que antes se preservaba `costoPromedioAlMomento` a
nivel de venta), ausente si es una línea nueva (calcula costo fresco con `costoUltimaCompra`,
igual que en creación). El stock se recalcula por **diferencia agregada por producto** (no por
línea): se agrupa cantidad vieja y nueva por `codigoProducto` en todo el conjunto de líneas, y
para cada producto afectado `stockFinal = stockActual + totalViejo - totalNuevo` — evita bugs
de aritmética incremental cuando un producto se mueve entre líneas o queda duplicado. Luego se
borran todas las líneas viejas (`deleteMany`) y se crean las nuevas ya con su costo resuelto —
más simple y menos propenso a bugs que parchear cada línea incrementalmente. Cuotas: se siguen
borrando y regenerando igual que siempre.

**`eliminarVenta`:** restaura stock agrupando por producto sobre `existente.items` (antes era
un solo `cantidad`); las filas de `VentaItem` ya no necesitan borrado manual — se van solas por
la cascada del schema (a diferencia de `cuotas`, que se sigue borrando a mano).

**Fix crítico, fácil de pasar por alto:** `compras.service.ts` → `recalcularProducto` calculaba
el stock de un producto restando `tx.venta.aggregate({ where: { codigoProducto }, _sum: {
cantidad: true } })`. Con `Venta` sin esos campos ya no compila — se corrigió a
`tx.ventaItem.aggregate(...)`. El error de compilación fue la red de seguridad real de esta
migración: quitar campos de `Venta` rompe el build en cada sitio que los usaba, así que `tsc`
encontró solo en dos scripts (`seed-datos-prueba.ts`, `limpiar-datos-prueba.ts`) los usos que
faltaban — ningún otro sitio se pasó por alto silenciosamente.

**Métricas reescritas** (`metrics.service.ts`) — las que hacían JOIN directo a
`ventas.codigo_producto`/`cantidad` pivotaron a `venta_items`: `topProductos`,
`rotacionInventario`, `analisisAbc`, `stockMuerto`. Nota en `topProductos`: los "ingresos" por
producto ya no incluyen el recargo por cuotas (antes, con un producto por venta, el total de la
venta con recargo se le atribuía a ese único producto — ahora es `SUM(valor_unitario ×
cantidad)` por línea, más correcto, pero el número cambió). `carteraCuotas` amplió el `include`
de la venta anidada para traer `items` en vez de un `codigoProducto` único.
`margenPorProducto`, `gananciaAcumulada`, `ticketPromedio`, `contadoVsCuotas`,
`historialCostosProveedor` no necesitaron cambios — ya operaban sobre agregados de `Venta`.

**Resumen de productos — una sola convención reutilizada en todos lados:** "Nombre del primer
producto" si la venta tiene 1 línea, `"Nombre + N más"` si tiene varias. Implementado una vez
en `backend/src/lib/venta-resumen.ts` (usado en `pdf-liquidacion.ts` y en el texto del
recordatorio de WhatsApp de `recordatorios.ts`) y otra vez en
`frontend/src/app/shared/venta-resumen.ts` (usado en la tabla de Ventas, la tabla de cuotas
pendientes, la cartera del dashboard, y la liquidación de comisiones) — en vez de 4 formas
distintas de resumir "el producto" de una venta que ahora puede tener varios.

**Frontend — formulario de Ventas con líneas dinámicas:** "Nueva venta" y "Editar venta"
comparten el mismo patrón ya usado en Compra por lote: campos compartidos arriba (comprador,
canal, medio de pago, cuotas/frecuencia, vendedor) y un array de líneas con "+ Agregar
producto"/"Quitar" por línea, cada una con `<app-producto-selector>` (reutilizado tal cual) +
cantidad + valor unitario (autosugerido al precio de catálogo al elegir el producto, editable).
La diferencia entre crear y editar es solo el estado inicial: crear arranca con una línea vacía
sin `id`; editar arranca con `venta.items`, cada línea con su `id` para que el backend sepa qué
preservar. Bug encontrado y corregido durante las pruebas: el selector de producto de la línea
en el formulario de **edición** no tenía conectado el `(codigoChange)` que autosugiere el
precio de catálogo (sí lo tenía el de "Nueva venta") — una línea nueva agregada durante una
edición se quedaba sin precio y bloqueaba el guardado con "valor obligatorio".

**Probado end-to-end** (creación, edición y eliminación reales, verificando stock y montos
contra cálculo manual, no solo que la UI no tirara error):
- Venta nueva de 2 líneas (Aretes Luna x2 + Anillo Trenzado x1): stock descontado correcto por
  producto, `valorContado`/`valorTotalVenta`/`ganancia` cuadraron exacto con la suma calculada
  a mano, cuotas generadas sobre el total agregado con el espaciado de días correcto según la
  frecuencia.
- Edición de esa venta: se quitó una línea (Anillo Trenzado — stock restaurado), se subió la
  cantidad de una línea que se mantuvo (Aretes Luna 2→5 — costo histórico preservado exacto,
  sin recalcularse), se agregó una línea nueva (Collar Gargantilla — costo fresco de la compra
  más reciente). Los tres productos quedaron con el stock exacto esperado y los totales
  recalculados cuadraron con la suma manual.
- Eliminación de esa venta: stock de los dos productos restantes volvió exactamente a su valor
  original, las cuotas y las líneas (`venta_items`, vía cascada) desaparecieron, y un `GET`
  posterior a la venta devolvió 404.
- Los 10 endpoints de métricas respondieron 200 con datos coherentes contra el seed
  multi-línea; cero errores de consola navegando Dashboard, Productos, Compras, Compra por
  lote, Comisiones, Compradores, Ventas y Usuarios.

**Seed** (`seed-datos-prueba.ts`): de las 19 ventas de prueba, 4 son ahora genuinamente
multi-línea (2, 2, 2 y 3 productos respectivamente, mezclando contado y cuotas) para ejercitar
el camino de código nuevo en desarrollo, no solo envolver cada venta existente en un array de 1.
`limpiar-datos-prueba.ts` actualizado para buscar ventas por `items: { some: { codigoProducto }
}` en vez de la igualdad escalar que ya no existe.

### Botón "Preguntar por WhatsApp" en el catálogo público — COMPLETO (2026-08-17)

Pedido explícito del usuario: un botón por producto en el catálogo público que abra WhatsApp
(web o app) con un mensaje precargado, para que un comprador pregunte por disponibilidad o
indique que quiere comprarlo. Limitación real de la plataforma (no del proyecto): el link
`wa.me` solo puede precargar **texto**, no puede adjuntar la foto automáticamente — el mensaje
incluye nombre, código y precio del producto para que quede claro de qué se pregunta.

El número de destino **se lee directo de la sesión de WhatsApp ya vinculada** (Baileys expone
`socket.user.id`, formato `"<numero>:<dispositivo>@s.whatsapp.net"`) — decisión explícita del
usuario en vez de agregar un campo de configuración manual: así queda siempre sincronizado con
el número realmente conectado, sin duplicar el dato en ningún lado.

- `backend/src/whatsapp/client.ts`: nueva función interna `numeroVinculado()` que extrae los
  dígitos de `socket.user.id`; `obtenerEstado()` ahora también devuelve `numero` (solo cuando
  `estado === "conectado"`).
- `backend/src/routes/publico.routes.ts`: nuevo `GET /api/publico/whatsapp-numero` (sin
  `requireAuth`, mismo patrón que `/catalogo`) — expone **solo** el número, nunca el QR ni el
  resto del estado interno (eso sigue exclusivo de `GET /api/whatsapp/status`, autenticado).
- Frontend `catalogo-publico.component.ts`: `linkWhatsapp(p)` arma
  `https://wa.me/<numero>?text=<mensaje codificado>`; el botón (`.boton-whatsapp`, verde estilo
  WhatsApp) solo se muestra si hay un número vinculado — si WhatsApp está desconectado, el
  catálogo sigue funcionando normal sin el botón.
- Bonus: la página `/whatsapp` (autenticada) ahora también muestra el número vinculado
  (`+<numero>`) junto al estado de la conexión, para que el admin confirme a simple vista qué
  número está usando el catálogo.
- Probado end-to-end: `GET /api/publico/whatsapp-numero` devolvió el número real de la sesión
  vinculada en desarrollo; los 9 productos del catálogo mostraron el botón con el link
  correctamente armado (`https://wa.me/<numero>?text=Hola! Quisiera preguntar por: <nombre>
  (<código>) — <precio>`); la página `/whatsapp` mostró el mismo número.

### Recargo por venta con vista previa + módulo Cuotas consolidado — COMPLETO (2026-08-17)

Todo lo relacionado con cuotas estaba repartido en 3 páginas (tabla de cuotas pendientes al
final de Ventas, recordatorios automáticos en WhatsApp, cartera en el Dashboard), lo cual
preocupaba operativamente al usuario. En paralelo, validando el formulario de Ventas, salió un
problema relacionado: el recargo por cuotas se tomaba en silencio de
`configuracion_app.recargo_cuotas_global` al crear la venta, sin poder verlo ni ajustarlo hasta
editarla después. Pedido explícito del usuario, con permisos confirmados igual a los de hoy:
mantener cuotas abierto a los 3 roles (ver/pagar), cartera/recordatorios/recargo-por-defecto
solo manager/admin; quitar la tabla de "Cuotas pendientes" de Ventas y dejar solo un link;
**mantener la cartera duplicada tanto en Dashboard como en el módulo nuevo** (decisión explícita
del usuario, no la opción recomendada de quitarla del Dashboard — *"Dejarlo en los dos
lugares"*); y que el recargo se pueda fijar **por venta, al momento de crearla**, con vista
previa de cuánto queda cada cuota (mismo redondeo a la centena que ya usa `generarCuotas`).

- **Backend (`ventas.service.ts`/`ventas.routes.ts`):** `RegistrarVentaInput` gana
  `recargoCuotas?: number` opcional (`z.number().nonnegative().optional()` en el schema). Si se
  manda, gana sobre el global: `input.recargoCuotas !== undefined ? new Prisma.Decimal(...) :
  (config?.recargoCuotasGlobal ?? 0)` — si no se manda, el comportamiento de siempre (tomar el
  global) queda intacto. `actualizarVenta` no cambió, ya aceptaba `recargoCuotas` al editar.
- **Vista previa de cuotas — helper compartido** (`frontend/src/app/shared/cuotas-preview.ts`,
  nuevo): `previsualizarCuotas(valorTotalVenta, numCuotas)` replica en el frontend, en JS puro,
  exactamente la misma regla de redondeo de `generarCuotas()` en el backend (cada cuota salvo la
  última a la centena más cercana, la última absorbe el resto) — usado en vivo en los formularios
  de "Nueva venta" y "Editar venta" de `ventas.component.html`, recalculado en cada cambio de
  líneas/recargo/num_cuotas sin necesidad de golpear el backend. Verificado que ambos lados
  (backend real vía API y el helper del frontend) producen exactamente los mismos valores para
  los mismos montos.
- **"Nueva venta"** ahora tiene el campo "Recargo por cuotas" (antes solo estaba en "Editar
  venta", quitado de "Nueva venta" el 2026-08-06) — prellenado con el valor global vigente
  (`GET /api/comisiones/configuracion`, solo para manager/admin; el rol `user` no tiene acceso a
  ese endpoint así que el campo le queda vacío, lo cual sigue funcionando bien porque el backend
  aplica el mismo global si no llega nada).
- **Módulo nuevo `/cuotas`** (`frontend/src/app/cuotas/`, ruta con `authGuard`, link de nav
  visible para los 3 roles junto a Ventas) — **sin endpoints nuevos**, todo reutilizado:
  - Lista completa de cuotas (`GET /api/cuotas`, antes solo se veía "la próxima por venta" en
    Ventas) con chips de filtro por estado y búsqueda con autocompletado por comprador/producto;
    pagar (los 3 roles) y editar fecha (manager/admin en el frontend — ver nota abajo), moviendo
    la lógica que antes vivía en `ventas.component.ts`.
  - Cartera (`GET /api/metrics/cartera-cuotas`, manager/admin): mismos KPIs que ya existían en el
    Dashboard, **mantenidos también ahí** por decisión explícita del usuario — es la única
    sección de este módulo con duplicación intencional.
  - Recordatorios automáticos (`GET/PUT /api/whatsapp/config`,
    `POST /api/whatsapp/recordatorios/enviar-ahora`, manager/admin) — movido de WhatsApp, que
    conserva conexión/QR, envío manual, difusión masiva e historial sin cambios.
  - Recargo por cuotas por defecto (`GET/PUT /api/comisiones/configuracion`, manager/admin) —
    movido de Comisiones, que conserva solo lo propio de comisiones de vendedores.
- **Nota de permisos encontrada durante la verificación (no introducida en este cambio, ya
  existía):** `PATCH /api/cuotas/:id/fecha` nunca tuvo guard de rol a nivel de API — solo el
  botón "Editar fecha" está oculto para el rol `user` en el frontend
  (`@if (auth.esManagerOAdmin())`). No se tocó porque está fuera del alcance de este cambio, pero
  queda registrado por si en el futuro se decide cerrarlo también en el backend.
- Probado end-to-end vía API con los 3 roles reales del entorno de desarrollo (admin, manager
  `30399617`, user `dahi`): registrar una venta a cuotas con `recargoCuotas` explícito distinto
  al global confirma que gana el valor enviado (cuotas de 11700/11700/11599 sobre un total de
  34999, exacto); registrar otra sin mandarlo confirma la caída al global (15000/15000 sobre
  30000); `GET /api/cuotas` da 200 para `user` pero `GET /api/metrics/cartera-cuotas` y
  `GET /api/comisiones/configuracion` dan 403; marcar una cuota pagada como `user` funciona;
  editar la fecha de otra como `manager` funciona; los endpoints de WhatsApp/Comisiones
  reutilizados responden igual desde la nueva página. Typecheck limpio en backend y frontend.

### Comprobante de venta en PDF para el cliente — COMPLETO (2026-08-17)

Pedido explícito del usuario: un documento tipo factura (sin llamarlo "factura") que el
vendedor pueda generar y enviarle al comprador — con los items (código de producto incluido,
para que a futuro el cliente pueda pedir de nuevo por código), el valor total, y si la venta es
a cuotas, el valor y estado de cada una. Decisión explícita: primera versión **on-demand** — un
botón en Ventas que el vendedor abre cuando quiere, sin envío automático por WhatsApp (eso queda
para una eventual segunda vuelta).

- **Backend:** `backend/src/lib/pdf-comprobante.ts` (nuevo, mismo patrón que
  `pdf-liquidacion.ts` con `pdfkit`) — `generarPdfComprobanteVenta()` recibe un objeto ya
  reducido a **solo lo seguro de mostrarle a un cliente**: código/nombre/cantidad/valor unitario
  de cada línea, subtotal, recargo por cuotas (si aplica), total, y — si es a cuotas — cada
  cuota con su valor/fecha de vencimiento/estado/fecha de pago. Nunca incluye
  `costoUnitarioAlMomento`, `ganancia`, `comision` ni datos del vendedor (mismo criterio que ya
  usa el catálogo público para no exponer `costoPromedio`). `ventas.service.ts` expone
  `obtenerVentaParaComprobante(id)` que arma ese objeto reducido (reutiliza `obtenerVenta()` +
  busca el comprador por separado, ya que `Venta` no tiene relación directa a `Comprador`).
  Ruta nueva `GET /api/ventas/:id/comprobante` (sin restricción de rol adicional, mismo nivel que
  `GET /api/ventas/:id` — los 3 roles pueden generar el comprobante de cualquier venta que ya
  puedan ver), `Content-Disposition: inline` para que abra en una pestaña nueva como preview.
- **Frontend:** `ventasService.urlComprobante(id)` + botón "Comprobante" (columna nueva en la
  tabla de Ventas, visible para los 3 roles — a diferencia de Editar/Eliminar/Comisión, que
  siguen exclusivos de manager/admin) que hace `window.open(url, '_blank')`; el vendedor decide
  si descargarlo/enviarlo y cuándo, sin ningún envío automático.
- **Bug de timezone encontrado y corregido en el camino (afectaba también el PDF de liquidación
  de comisiones, ya en producción):** `pdf-comprobante.ts` y `pdf-liquidacion.ts` formateaban
  fechas con `new Intl.DateTimeFormat("es-CO", {...})` sin fijar `timeZone`. Las fechas de venta/
  cuota/liquidación ya vienen desplazadas por `comoBogota()` (o, en el caso de
  `fecha_liquidacion`, por el default `CURRENT_TIMESTAMP` de Postgres con la sesión en
  `America/Bogota` — mismo efecto: sus getters **UTC** ya representan la hora de Bogotá, ver el
  bug de timezone documentado arriba). Formatear sin forzar `timeZone: "UTC"` usa la zona
  horaria **local del proceso Node**, y si esa zona ya es `America/Bogota` (como en esta
  máquina de desarrollo), le resta 5h una segunda vez — para una fecha de cuota anclada a
  medianoche (`00:00:00.000Z`), eso cruza la medianoche y muestra el día anterior. Fix: agregar
  `timeZone: "UTC"` al formateador en ambos archivos (mismo criterio que ya usa el frontend con
  `date: 'dd/MM/yyyy':'UTC'` en los `DatePipe`). Confirmado con `pypdf` extrayendo el texto real
  del PDF antes/después del fix: una cuota con `fecha_vencimiento = 2026-09-01T00:00:00.000Z`
  mostraba "31 de ago" antes del fix y "01 de sept" después, coincidiendo con el valor crudo de
  la base de datos.
- Probado end-to-end vía API con `pypdf` (extracción de texto real del PDF, no solo que
  devolviera 200): venta a cuotas de 1 línea (código, nombre, cantidad, valor unit., subtotal,
  recargo, total, y las 2 cuotas con su vence/estado/fecha de pago correctos); venta de contado
  con comprador real (nombre correcto, sin sección de recargo ni cuotas); venta multi-línea de 3
  productos (los 3 códigos/nombres/subtotales correctos, total cuadrando exacto con recargo
  incluido, y las 3 cuotas redondeadas a la centena sumando exacto al total). Confirmado 200
  para los 3 roles, 401 sin sesión, 404 con una venta inexistente. Typecheck limpio en backend y
  frontend.
- **Rediseño con identidad de marca (mismo día, ajuste posterior):** la primera versión salía en
  texto plano (Helvetica negro sobre blanco). Pedido explícito del usuario: "que este documento
  tenga vida y sello de Camelia" — usar las imágenes de marca y los colores corporativos que ya
  existen en `frontend/public/brand/`. Como el backend y el frontend son carpetas separadas (y
  en el servidor de producción están bajo el mismo `/var/www/camelia/` pero no hay garantía de
  que esa relación relativa se mantenga siempre), el logo se copió a
  `backend/src/assets/brand/logo-maestro.png` — un asset propio del backend, no una referencia
  cruzada al directorio del frontend — y `backend/package.json` (`build`) ahora también copia
  `src/assets/brand` a `dist/assets/brand`, mismo patrón que ya usaba para
  `src/generated/prisma`.
  - Paleta: crema `#fbf7f6` (el mismo fondo horneado del PNG del logo — al pintar la página
    completa de ese crema, el logo se funde sin bordes visibles), dorado `#b8863e` (muestreado
    del propio logo con Pillow) para líneas/títulos/el monto del total, tinta `#0b0b0b` para
    texto principal — mismos tonos que `--brand-cream` en `styles.scss`. El estado de cada
    cuota usa los mismos colores semánticos que el badge de la web (`--good`/`--warning`/
    `--serious`), aunque con un ámbar más oscuro para "pendiente" (`#c98a0a` en vez de
    `#fab219`) porque el amarillo puro del badge web pierde contraste sobre fondo crema en vez
    de blanco.
  - Tipografía: no existe una fuente serif propia embebida en la app (el logo es un PNG
    terminado, sin `@font-face` en ningún lado) — se usa `Times-Bold`/`Times-Italic` (fuente
    built-in de pdfkit, no requiere embeber un archivo `.ttf`) para títulos y el tagline, como
    análogo elegante razonable sin perseguir un pixel-match imposible de la tipografía exacta
    del logo.
  - Estructura: logo centrado arriba (fondo del PNG idéntico al fondo de la página, sin caja
    visible) → línea dorada → título serif → línea de metadata (fecha · cliente · medio de
    pago) centrada → tabla de items con encabezado en banda dorada clara → bloque de totales
    alineado a la derecha con el total en dorado, más grande → (si aplica) tabla de cuotas con
    el estado coloreado → línea dorada de cierre → tagline "Detalles que te hacen especial" en
    dorado itálico. Páginas de continuación (venta con muchos items, poco común dado el límite
    de 3 cuotas) repintan el fondo crema y muestran una marca de agua discreta ("CAMELIA" en
    dorado, esquina superior derecha) en vez de repetir el logo grande.
  - Verificado visualmente (no solo con extracción de texto): PDF renderizado a PNG con `sips`
    para dos casos — venta multi-línea a cuotas (3 productos, cuotas en pendiente/pagada/
    atrasada mostrando sus 3 colores correctos) y venta de contado con comprador real (sin
    sección de recargo ni cuotas, sin huecos de layout). El PDF de liquidación de comisiones
    (`pdf-liquidacion.ts`) no se tocó en este rediseño — sigue con el estilo plano anterior; el
    usuario puede pedir el mismo tratamiento ahí después si lo quiere.

### Panel de Cuotas: agrupar por venta con desplegable + ocultar deudas saldadas — COMPLETO (2026-08-17)

Usando el módulo `/cuotas` en la práctica, el usuario encontró dos problemas de la primera
versión: con el filtro "Todas", una venta a 3 cuotas ocupaba 3 filas sueltas sin relación visual
entre sí (más difícil de leer que "esta venta debe $X repartido en estas cuotas"), y una venta
ya completamente pagada seguía apareciendo mezclada con las que sí tenían saldo. Pedido explícito
del usuario, confirmado en la conversación: agrupar por **venta** con un desplegable que muestre
sus cuotas — pero solo cuando el filtro es "Todas"; con un estado puntual (Pendiente/Atrasada/
Pagada) se mantiene la lista plana de cuotas individuales de siempre, que sigue siendo la vista
correcta para "qué cuotas están en tal estado" cruzando ventas.

- **Sin cambios de backend.** `GET /api/cuotas` (`listarCuotas` en `cuotas.service.ts`) incluye
  `venta.items` pero no `venta.cuotas` — sin embargo, como la llamada sin filtro ya trae **todas**
  las cuotas (una fila por cuota), agrupar el array plano ya cargado en el frontend por
  `idVenta` reconstruye el set completo de cuotas de cada venta sin pedirle nada nuevo a la API.
- `cuotas.component.ts`: nuevo `computed()` `ventasConSaldo` — agrupa `cuotas()` por `idVenta`,
  calcula por grupo `saldoPendiente` (suma de `valorCuota` de las cuotas no pagadas),
  `proximoVencimiento` (la fecha más próxima entre las no pagadas) y `tieneAtrasada`, **filtra
  fuera los grupos con `saldoPendiente === 0`** (esto implementa "deudas activas por defecto" —
  las ventas ya saldadas simplemente no entran al array, no es un toggle aparte) y ordena por
  urgencia. `cuotasFiltradas` (la lista plana, usada solo cuando el filtro no es "todas") se
  simplificó — ya no filtra por búsqueda, solo por estado.
- Se quitó el buscador por comprador/producto (`busqueda`/`busquedaSugerencias` y su `<input>` +
  `<datalist>`) — decisión explícita del usuario, validada en la conversación: con la vista
  agrupada + deudas saldadas ocultas por defecto, la lista visible ya es corta y el buscador
  dejó de aportar.
- `cuotas.component.html`: la sección de la tabla ahora es `@if (filtroEstado() === 'todas')`
  (vista agrupada) `@else` (vista plana, exactamente el markup que ya existía). La vista
  agrupada muestra Venta #/Comprador/Producto/Total venta/Saldo pendiente/Próx. vencimiento/
  Estado (badge "atrasada" si `tieneAtrasada`, si no "pendiente") + una columna de chevron;
  click en la fila alterna `ventaExpandidaId` (signal `number | null`, un solo desplegable
  abierto a la vez — mismo patrón que `editandoVentaId` en Ventas) y revela una fila
  `<tr><td colspan="8">` con una sub-tabla (`.tabla-anidada`) con las cuotas de esa venta,
  mismas columnas/acciones (Marcar pagada/Editar fecha) que la vista plana de siempre.
- El encabezado "Cuotas (N)" muestra la cantidad relevante en cada caso: cantidad de ventas con
  saldo cuando está agrupado, cantidad de cuotas cuando está filtrado (como antes).
- Probado contra datos reales del entorno de desarrollo (no solo visualmente, ya que no había un
  navegador headless disponible en esta sesión): se replicó la lógica de agrupación en un script
  de Node contra `GET /api/cuotas` crudo, confirmando que el saldo pendiente de una venta con 1
  cuota pagada + 1 pendiente cuadraba exacto; se marcó su cuota restante como pagada vía API y se
  confirmó que la venta pasa a `saldoPendiente = 0` y queda excluida del grupo "con saldo" (8 → 7
  ventas), mientras que `GET /api/cuotas?estado=pagada` sigue devolviendo sus 2 cuotas pagadas —
  confirma que no queda permanentemente oculta, solo fuera de la vista por defecto. Typecheck
  limpio en frontend.

### Identidad de marca — COMPLETO (2026-08-02)

Assets de marca ya existentes en `frontend/public/brand/files/` (logo maestro, monograma,
tarjeta de agradecimiento, sticker de empaque, foto de perfil de WhatsApp — estos tres últimos
son piezas de marketing físico/impresión, no se usan en la app). Ninguno tiene canal alpha: los
PNG traen un fondo crema sólido horneado (`#FBF7F6`, muestreado con Pillow ya que no había
ImageMagick disponible — `pip3 install Pillow`).

- Copias con nombre limpio para referenciar desde código: `frontend/public/brand/logo-maestro.png`
  y `frontend/public/brand/monograma.png`.
- Favicon: `frontend/public/brand/icons/` (favicon-16/32/48.png + apple-touch-icon.png,
  recortados/redimensionados desde el monograma con `sips`, ya que `convert`/`magick` no estaban
  instalados). Reemplaza el `favicon.ico` default de Angular (eliminado) en `index.html`, con
  `<link rel="icon" type="image/png" sizes="...">` (formato moderno) + `apple-touch-icon`.
  **Ajuste 2026-08-02:** el fondo crema solido se veia mal en la pestaña del navegador (bajo
  contraste, se leia como una mancha). Se generó `monograma-transparente.png` con Pillow
  (color-key: cualquier pixel cercano a `#FBF7F6` pasa a alpha 0) y los favicon-16/32/48 se
  regeneraron desde ahí — verificado sin fringing en fondos claros y oscuros. El
  `apple-touch-icon` sí mantiene fondo solido (`#FBF7F6`) porque iOS rellena la transparencia
  con negro, lo cual se veía peor que el crema. `monograma-square.png` (fondo crema, sin
  transparencia) quedó obsoleto y se eliminó; `monograma-transparente.png` es ahora la fuente
  para regenerar iconos a futuro.
- Clase global `.logo-badge` / `.nav-logo` en `styles.scss`, con `background: var(--brand-cream)`
  (`#fbf7f6`, hardcodeado — no ligado a `--surface-1`) para que el fondo crema del PNG se lea
  como una tarjeta de logo intencional también en modo oscuro, en vez de un bug de transparencia.
  Verificado visualmente con Playwright en ambos modos.
  - Login (`login.component.html`): logo maestro completo (ya incluye "CAMELIA" + tagline).
  - Cambiar contraseña: monograma pequeño arriba del `<h1>` (se mantiene el `<h1>` porque es
    específico de la página, no identidad de marca).
  - Nav principal (`app.html`): monograma pequeño en `.nav-logo`, reemplaza el texto plano
    `<span class="brand">Camelia</span>`.

### Despliegue — COMPLETO (2026-08-08)

En producción en `https://camelia.ramelo.app`, mismo VPS Contabo que Ramelo (Nginx + PM2, sin
Docker). El paso a paso completo (Postgres, `.env`, PM2, bloque de Nginx, Certbot) vive en
`DEPLOY.md` — no se repite aquí. Repo en GitHub: `https://github.com/Dagonnet1988/camelia`
(público).

**Bugs reales encontrados en el primer despliegue (ya corregidos, documentados con detalle en
`DEPLOY.md`) — relevantes si se despliega de nuevo en otro servidor:**

1. El generador de Prisma (`prisma-client`) necesita `moduleFormat = "cjs"` explícito en
   `schema.prisma` — sin eso emite ESM (`import.meta.url`) que `node` puro no puede cargar
   (aunque `tsx` en dev sí lo tolera).
2. `tsc` no copia `src/generated/prisma/` a `dist/` — el script `build` de
   `backend/package.json` lo hace explícitamente después de compilar.
3. `dotenv` no sobreescribe variables ya presentes en `process.env` por defecto — el VPS tenía
   `PORT`/`NODE_ENV` heredados del entorno compartido con Ramelo. Se usa
   `dotenv.config({ override: true })`, aislado en `backend/src/lib/env.ts` e importado como
   *primera línea* de `index.ts` (un `import` normal, no una llamada suelta en medio de otros
   imports — con `tsx`/esbuild los imports se "hoistean" por encima del código normal, así que
   una llamada suelta a `dotenv.config()` intercalada entre imports se ejecuta *después* de que
   otros módulos ya intentaron leer `process.env`, dependiendo del orden textual).
4. En Nginx, un `location` por **regex** (`~* \.png$` etc., para cachear assets estáticos)
   le gana a un `location` de **prefijo simple** (`/uploads/`, `/api/`) sin importar el orden
   en el archivo — hacía que las fotos de productos dieran 404 aunque existieran en disco y el
   backend las sirviera bien. Se soluciona con el modificador `^~` en esos prefijos.
5. Postgres traía `Europe/Berlin` como timezone del servidor (default de fábrica del VPS, nada
   que ver con Ramelo). Se ajustó **solo para la base de Camelia**
   (`ALTER DATABASE bisuteria_db SET timezone TO 'America/Bogota'`), sin tocar la config global
   de Postgres ni la base de Ramelo.

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
