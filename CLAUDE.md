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

## Primeros pasos sugeridos para Claude Code
1. Inicializar el proyecto con el stack definido (Node backend, Angular frontend, Postgres).
2. Definir esquema de base de datos (migraciones) según el modelo de arriba.
3. Construir API CRUD para productos, compras_inventario, compradores, ventas, cuotas.
4. Implementar la lógica de recálculo de costo_promedio en cada compra.
5. Implementar la lógica de generación de cuotas al crear una venta a cuotas.
6. Construir endpoints/queries para las métricas listadas.
7. Construir dashboard frontend simple.