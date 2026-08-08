# Despliegue de Camelia al VPS Contabo

Guía paso a paso para desplegar Camelia en el mismo VPS donde ya corre Ramelo
(Nginx + PM2, sin Docker), en `camelia.ramelo.app`.

Valores ya confirmados contra la configuración real de Ramelo
(`sudo nginx -T`, revisado 2026-08-06):

- **Dominio:** `camelia.ramelo.app`.
- **Ruta del repo:** `/var/www/camelia` (mismo patrón que `/var/www/vetplus` de Ramelo — ajústalo si prefieres otra convención, solo mantenlo consistente en toda esta guía).
- **Puerto del backend:** `4000`. El backend de Ramelo ya usa el `3000` (`proxy_pass http://127.0.0.1:3000` en el bloque `api.ramelo.app`), así que Camelia necesita un puerto distinto. Confirma que el `4000` esté libre antes de arrancar: `sudo ss -tlnp | grep 4000` (no debería devolver nada).
- **Certificado TLS:** ya existe uno wildcard en `/etc/letsencrypt/live/ramelo-wildcard/` que cubre `*.ramelo.app` — **no hace falta correr Certbot de nuevo**, Camelia reutiliza el mismo certificado (ver sección 8).
- **DNS:** como el certificado es wildcard (requiere validación DNS-01), `*.ramelo.app` ya está wildcardeado en Cloudflare — `camelia.ramelo.app` ya debería resolver al VPS sin crear un registro DNS nuevo. Verifica con `dig camelia.ramelo.app` antes de la sección 8; si no resuelve, revisa el panel de Cloudflare.
- **Repo:** `https://github.com/Dagonnet1988/camelia.git` (ya con todo el código pusheado).

## 0. Antes de empezar

- Confirma la versión de Node del servidor: `node -v`. Este proyecto se desarrolló con Node 24 y no fija un mínimo explícito (`engines` no está declarado) — si el servidor tiene una versión más vieja (ej. 18 LTS), debería funcionar igual, pero avísame si ves errores raros al instalar dependencias o correr `prisma generate`.
- `pm2` y `nginx` ya están instalados y corriendo (para Ramelo).
- `sudo ss -tlnp | grep 4000` → debe salir vacío (puerto libre para Camelia).
- `dig camelia.ramelo.app` → debe resolver a la misma IP que `ramelo.app`.

## 1. Base de datos Postgres

Camelia usa la **misma instancia** de Postgres del servidor, pero una base de
datos y un usuario **separados** de los de Ramelo. Prisma **no crea la base
de datos ni el usuario automáticamente** — solo aplica las migraciones
(tablas) dentro de una base que ya exista. Este paso es manual, una sola vez.

Conéctate como el usuario `postgres` del sistema y corre:

```bash
sudo -u postgres psql
```

Dentro de `psql`:

```sql
CREATE USER camelia_user WITH PASSWORD 'genera-una-contraseña-fuerte-aqui';
CREATE DATABASE bisuteria_db OWNER camelia_user;
GRANT ALL PRIVILEGES ON DATABASE bisuteria_db TO camelia_user;
\q
```

Guarda esa contraseña — la necesitas para el `.env` del paso 3.

> **Lección del primer despliegue:** si necesitas cambiar la contraseña después
> (`ALTER USER camelia_user WITH PASSWORD '...'` vía `psql -c "..."`), ten
> cuidado — si la contraseña tiene un carácter especial de shell (`$`, `` ` ``,
> `!`, etc.), bash puede interpretarlo *antes* de que psql lo vea, guardando
> una contraseña distinta a la que escribiste, aunque el `.env` tenga la
> correcta. Esto se manifiesta como `password authentication failed` en
> `prisma migrate deploy` incluso con el `.env` "bien". La forma segura de
> fijar/cambiar la contraseña es **interactiva**, sin pasar por el shell:
>
> ```bash
> sudo -u postgres psql
> ```
>
> y ya dentro:
>
> ```sql
> \password camelia_user
> ```

## 2. Clonar el repositorio

```bash
sudo mkdir -p /var/www/camelia
sudo chown $USER:$USER /var/www/camelia
git clone https://github.com/Dagonnet1988/camelia.git /var/www/camelia
cd /var/www/camelia
```

## 3. Backend: variables de entorno

```bash
cd /var/www/camelia/backend
cp .env.example .env
```

Edita `.env` con los valores reales:

```bash
DATABASE_URL="postgresql://camelia_user:<contraseña-del-paso-1>@localhost:5432/bisuteria_db?schema=public"
PORT=4000
JWT_SECRET="<genera-con: openssl rand -hex 48>"
NODE_ENV=production
```

`.env` nunca se commitea (está en `.gitignore`) — vive solo en el servidor.

## 4. Backend: instalar, migrar, generar cliente, construir

```bash
cd /var/www/camelia/backend
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
```

`prisma migrate deploy` aplica las migraciones existentes contra
`bisuteria_db` (crea todas las tablas) — **pero no regenera el cliente de
Prisma**, eso es un paso aparte (`prisma generate`). El cliente generado
vive en `backend/src/generated/prisma/` y está en `.gitignore` (es código
generado, no se commitea), así que esa carpeta no existe hasta correr este
comando explícitamente — si te saltas este paso, el backend arranca con
`Error: Cannot find module '../generated/prisma/client'` en los logs de
PM2. `npm run build` compila TypeScript a `dist/`.

> **Tres bugs reales encontrados en el primer despliegue** (ya corregidos en
> el repo, solo asegúrate de tener el código actualizado con `git pull`
> antes de este paso si clonaste antes del commit `a0c802d`):
>
> 1. El generador de Prisma (`provider = "prisma-client"`) sin
>    `moduleFormat` explícito emite código ESM (`import.meta.url`) aunque
>    el backend es `"type": "commonjs"`. `tsx` (usado en dev) lo tolera vía
>    su propio loader, pero `node` puro — lo que PM2 realmente ejecuta —
>    revienta con `SyntaxError: Cannot use 'import.meta' outside a module`.
>    Se agregó `moduleFormat = "cjs"` al `generator client` de
>    `schema.prisma`.
> 2. `tsc` solo compila los `.ts` propios del proyecto — nunca copia
>    `src/generated/prisma/` (la salida de `prisma generate`) a `dist/`. El
>    `require("../generated/prisma/client")` compilado en
>    `dist/lib/prisma.js` apuntaba a un `dist/generated/prisma/` que nunca
>    existió. El script `build` en `package.json` ahora copia esa carpeta a
>    `dist/generated/prisma` después de `tsc`.
> 3. El backend arrancaba en el puerto **3000** en vez del `4000` del
>    `.env`, pese a que el `.env` y el `exec cwd` de PM2 estaban correctos.
>    `dotenv` por defecto **nunca sobreescribe** una variable que ya exista
>    en `process.env` — y algo en el entorno heredado de PM2/la shell del
>    servidor (compartido con Ramelo) ya traía `PORT` definido, así que
>    Camelia ignoraba silenciosamente el de su propio `.env`. Se cambió a
>    `dotenv.config({ override: true })` en `index.ts` y `prisma.config.ts`
>    para que el `.env` propio de Camelia siempre gane sobre lo heredado.
>
> Los tres se manifiestan **solo** al correr el build compilado (`node
> dist/index.js`, como hace PM2) — nunca aparecen en `npm run dev` porque
> `tsx` corre el TypeScript directo desde `src/`. Verificados localmente
> corriendo `node dist/index.js` sin intermediarios.

## 5. Backend: usuario admin inicial

```bash
npm run seed:admin
```

Esto crea el usuario admin definido en `backend/src/scripts/seed-admin.ts`
(usuario `1054988359` / contraseña `Dagonnet1` tal como está en el script —
**cámbiala desde la app después del primer login si quieres una distinta**,
o edita el script antes de correrlo si prefieres otra contraseña desde el
inicio).

No corras `npm run seed:prueba` en producción — esos son datos de prueba
para desarrollo.

## 6. Backend: arrancar con PM2

Desde `/var/www/camelia/backend`:

```bash
pm2 start dist/index.js --name camelia-backend --time
pm2 save
```

`pm2 save` asegura que sobreviva a un reinicio del servidor (ya tienes
`pm2 startup` configurado a nivel de sistema para Ramelo — no hace falta
repetirlo).

Verifica que levantó bien:

```bash
pm2 logs camelia-backend --lines 50
curl http://localhost:4000/health
```

Deberías ver `{"status":"ok"}`.

## 7. Frontend: build

```bash
cd /var/www/camelia/frontend
npm ci
npm run build
```

Esto genera `/var/www/camelia/frontend/dist/frontend/browser/` — son
archivos estáticos que Nginx sirve directamente (no corre como proceso
Node). Confirmado localmente que el build cae en la subcarpeta `browser/`
(no `dist/frontend/` directo).

## 8. Nginx: bloque de servidor para camelia.ramelo.app

Ramelo ya tiene, en `/etc/nginx/sites-enabled/vetplus`, dos bloques con
`server_name ramelo.app *.ramelo.app;` (uno HTTP→HTTPS redirect, otro HTTPS
sirviendo el frontend de Ramelo). Nginx resuelve qué bloque usa por
**coincidencia exacta de `server_name` antes que comodín**, sin importar en
qué archivo esté declarado ni el orden de carga — así que un bloque nuevo
con `server_name camelia.ramelo.app;` (exacto) siempre gana sobre el
`*.ramelo.app` de Ramelo para ese host específico. El tráfico de
`camelia.ramelo.app` nunca llega a la lógica de tenants de Ramelo.

No hace falta un bloque nuevo en el puerto 80: el bloque existente de
Ramelo `server_name ramelo.app *.ramelo.app;` en el puerto 80 ya redirige
`camelia.ramelo.app` a HTTPS (usa `$host`, así que preserva el subdominio
correcto). Solo se necesita el bloque HTTPS.

Crea `/etc/nginx/sites-available/camelia`:

```nginx
server {
    listen 443 ssl http2;
    server_name camelia.ramelo.app;

    # Reutiliza el certificado wildcard existente de Ramelo (cubre *.ramelo.app) —
    # no se generó un certificado nuevo para este subdominio.
    ssl_certificate /etc/letsencrypt/live/ramelo-wildcard/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ramelo-wildcard/privkey.pem;

    client_max_body_size 25m;

    root /var/www/camelia/frontend/dist/frontend/browser;
    index index.html;

    gzip on;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_vary on;
    gzip_types
        text/plain
        text/css
        text/xml
        application/json
        application/javascript
        application/xml
        application/rss+xml
        image/svg+xml;

    location = /index.html {
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }

    # ^~ es obligatorio aqui: sin el, un location de prefijo simple pierde contra
    # cualquier location por regex (como el de extensiones .js/.css/.png de abajo) sin
    # importar el orden en el archivo. Sin ^~, una foto en /uploads/productos/x.png
    # cae en el bloque de regex de assets estaticos (que busca el archivo dentro de
    # dist/frontend/browser, donde no existe) en vez de proxearse al backend -> 404
    # aunque el archivo si exista en disco. Mismo motivo para /api/.
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ^~ /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }

    location ~* \.(?:js|css|woff2?|png|jpe?g|webp|svg|ico)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable" always;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Actívalo:

```bash
sudo ln -s /etc/nginx/sites-available/camelia /etc/nginx/sites-enabled/camelia
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` valida la sintaxis antes de recargar — si falla, Nginx sigue
sirviendo Ramelo sin interrupción hasta que se corrija.

> **Bug real encontrado en producción:** las fotos de productos daban 404
> aunque el archivo existía en disco y la URL pedida por el navegador era
> exactamente correcta (`/uploads/productos/<uuid>.png`). Causa: en Nginx,
> un `location` por **regex** (`~*`) siempre le gana a un `location` de
> **prefijo simple** (`/uploads/`) sin importar el orden en que aparecen en
> el archivo — así que cualquier URL terminada en `.png`/`.jpg`/etc caía en
> el bloque de cache de assets estáticos (que busca el archivo dentro de
> `dist/frontend/browser/`, donde nunca existió) en vez de proxearse al
> backend. El modificador `^~` en `/api/` y `/uploads/` fuerza a Nginx a
> usar esos bloques de una vez, sin evaluar los regex. Este es el bug real
> que corrigió el catálogo en producción — la config de arriba ya lo
> incluye.

**Verifica que el certificado wildcard realmente cubra el subdominio** antes
de dar esto por hecho:

```bash
sudo certbot certificates | grep -A3 ramelo-wildcard
```

Deberías ver `*.ramelo.app` (y probablemente también `ramelo.app`) en
"Domains". Si por alguna razón no aparece `*.ramelo.app` ahí, avísame antes
de continuar — en ese caso sí habría que emitir un certificado dedicado
(con `certbot certonly --dns-cloudflare` dado que es un dominio
Cloudflare-proxied, no el `--nginx` simple que usa HTTP-01).

## 9. Verificación final

- Abre `https://camelia.ramelo.app/` — deberías ver el catálogo público.
- Entra con el usuario admin del paso 5.
- Revisa `pm2 logs camelia-backend` mientras navegas para confirmar que no
  hay errores.
- Confirma que `https://ramelo.app/` y `https://api.ramelo.app/` siguen
  funcionando normal (no debería haberse tocado nada de su configuración,
  pero vale la pena confirmarlo tras el `reload` de Nginx).

## Notas para redeploys futuros

- `backend/uploads/` (fotos de productos) y `backend/whatsapp-session/`
  (sesión de WhatsApp) viven **fuera de git** y deben persistir entre
  despliegues — un `git pull` normal no los toca, pero **nunca borres esas
  carpetas** al actualizar.
- Flujo de actualización: `git pull` → `npm ci` (si cambiaron dependencias)
  → `npx prisma migrate deploy` (si hay migraciones nuevas) → `npm run
  build` → `pm2 restart camelia-backend`. Para el frontend: `npm run build`
  de nuevo (Nginx sirve los archivos directo, no hace falta reiniciar nada).
- El módulo de WhatsApp (Baileys) requiere volver a vincular el número
  (escanear QR) la primera vez que arranca en el servidor nuevo — la sesión
  del VPS de desarrollo no se puede copiar/reutilizar.
- El certificado wildcard de Ramelo se renueva automáticamente vía el timer
  de Certbot del sistema (`systemctl status certbot.timer`) — como Camelia
  solo referencia esos mismos archivos, se beneficia de la renovación
  automática sin configuración extra.
