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

### ventas
- id (PK)
- codigo_producto (FK -> productos.codigo)
- comprador_celular (FK -> compradores.celular, nullable si es venta anónima)
- cantidad (int)
- valor_contado (decimal, = valor_venta del producto al momento × cantidad, antes de cualquier recargo)
- medio_pago (enum: 'contado', 'cuotas')
- num_cuotas (int, nullable — solo si medio_pago = 'cuotas'; máximo 3)
- frecuencia_cuotas (enum: 'semanal', 'quincenal', 'mensual'; nullable — solo si medio_pago =
  'cuotas'. Agregado 2026-08-06, define cada cuántos días vence cada cuota — 7/15/30
  respectivamente.)
- recargo_cuotas (decimal, nullable — valor extra cobrado por financiar. Al registrar la venta
  se toma de `configuracion_app.recargo_cuotas_global` (ajustable desde Comisiones); al editar
  una venta ya creada, se puede ajustar manualmente para esa venta puntual sin afectar el global.)
- valor_total_venta (decimal, = valor_contado + recargo_cuotas)
- costo_promedio_al_momento (decimal, copiado de productos.costo_promedio al momento de la venta, para que la ganancia histórica no se distorsione con recálculos futuros)
- ganancia (decimal, = valor_total_venta - (costo_promedio_al_momento × cantidad))
- canal (enum: 'whatsapp', 'presencial')
- fecha_venta
- vendedor_id (FK -> usuarios.id, nullable — quien registró la venta; lo asigna el backend a
  partir de la sesión autenticada, nunca lo manda el cliente. Agregado 2026-08-02.)
- comision_porcentaje (decimal, copiado de usuarios.porcentaje_comision al momento de la venta —
  mismo patrón que costo_promedio_al_momento, para que liquidaciones pasadas no se distorsionen
  si el % de un vendedor cambia después)
- comision (decimal, = valor_total_venta × comision_porcentaje / 100)
- comision_estado (enum: 'pendiente', 'liquidada')
- liquidacion_id (FK -> liquidaciones_comision.id, nullable — se llena cuando se liquida)

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
