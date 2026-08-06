# Despliegue de Camelia al VPS Contabo

Guía paso a paso para desplegar Camelia en el mismo VPS donde ya corre Ramelo
(Nginx + PM2, sin Docker). Reemplaza los placeholders entre `<...>` por tus
valores reales antes de ejecutar cada bloque.

Placeholders usados en esta guía:

- `<DOMINIO>` — el dominio/subdominio de Camelia (ej. `camelia.tudominio.com`).
- `<RUTA_APP>` — carpeta donde vivirá el repo en el servidor (ej. `/home/<usuario>/apps/camelia` o `/var/www/camelia`, sugerido: el mismo patrón que ya usas para Ramelo).
- `<PUERTO_BACKEND>` — puerto interno donde escucha el backend de Camelia (sugerido `3100`, pero usa cualquiera que no choque con el puerto de Ramelo).
- `<REPO_URL>` — URL del repositorio en GitHub una vez lo crees y yo haga el push.

## 0. Antes de empezar

- Confirma la versión de Node del servidor: `node -v`. Este proyecto se desarrolló con Node 24 y no fija un mínimo explícito (`engines` no está declarado) — si el servidor tiene una versión más vieja (ej. 18 LTS), debería funcionar igual, pero avísame si ves errores raros al instalar dependencias o correr `prisma generate`.
- Confirma que `pm2` y `nginx` ya están instalados y corriendo (para Ramelo, así que deberían estarlo).
- Confirma el puerto donde escucha el backend de Ramelo (`pm2 list` o revisa su config) para no chocar con `<PUERTO_BACKEND>`.

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

## 2. Clonar el repositorio

```bash
git clone <REPO_URL> <RUTA_APP>
cd <RUTA_APP>
```

## 3. Backend: variables de entorno

```bash
cd <RUTA_APP>/backend
cp .env.example .env
```

Edita `.env` con los valores reales:

```bash
DATABASE_URL="postgresql://camelia_user:<contraseña-del-paso-1>@localhost:5432/bisuteria_db?schema=public"
PORT=<PUERTO_BACKEND>
JWT_SECRET="<genera-con: openssl rand -hex 48>"
NODE_ENV=production
```

`.env` nunca se commitea (está en `.gitignore`) — vive solo en el servidor.

## 4. Backend: instalar, migrar, construir

```bash
cd <RUTA_APP>/backend
npm ci
npx prisma migrate deploy
npm run build
```

`prisma migrate deploy` aplica las 12 migraciones existentes contra
`bisuteria_db` (crea todas las tablas). `npm run build` compila TypeScript a
`dist/`.

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

Desde `<RUTA_APP>/backend`:

```bash
pm2 start dist/index.js --name camelia-backend --time
pm2 save
```

`pm2 save` asegura que sobreviva a un reinicio del servidor (asumiendo que
ya tienes `pm2 startup` configurado para Ramelo — no hace falta repetirlo,
es a nivel de sistema).

Verifica que levantó bien:

```bash
pm2 logs camelia-backend --lines 50
curl http://localhost:<PUERTO_BACKEND>/health
```

Deberías ver `{"status":"ok"}`.

## 7. Frontend: build

```bash
cd <RUTA_APP>/frontend
npm ci
npm run build
```

Esto genera `<RUTA_APP>/frontend/dist/frontend/` — son archivos estáticos
que Nginx sirve directamente (no corre como proceso Node).

## 8. Nginx: bloque de servidor para <DOMINIO>

Crea `/etc/nginx/sites-available/camelia`:

```nginx
server {
    listen 80;
    server_name <DOMINIO>;

    root <RUTA_APP>/frontend/dist/frontend/browser;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:<PUERTO_BACKEND>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:<PUERTO_BACKEND>;
        proxy_set_header Host $host;
    }
}
```

> Confirmado localmente: el build genera `dist/frontend/browser/` (no
> `dist/frontend/` directo) — el `root` de arriba ya apunta ahí. Si en algún
> momento actualizas la versión de Angular y esto cambia, corrígelo con
> `ls <RUTA_APP>/frontend/dist/frontend/` después del build.

Actívalo:

```bash
sudo ln -s /etc/nginx/sites-available/camelia /etc/nginx/sites-enabled/camelia
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` valida la sintaxis antes de recargar — si falla, Nginx sigue
sirviendo Ramelo sin interrupción hasta que se corrija.

## 9. HTTPS con Certbot

```bash
sudo certbot --nginx -d <DOMINIO>
```

Esto obtiene el certificado y ajusta automáticamente el bloque de Nginx para
redirigir HTTP → HTTPS. **Este paso no es opcional**: el login de Camelia usa
una cookie `secure: true` en producción (`NODE_ENV=production`), que el
navegador rechaza en HTTP puro — sin HTTPS el login queda roto.

## 10. Verificación final

- Abre `https://<DOMINIO>/` — deberías ver el catálogo público.
- Entra con el usuario admin del paso 5.
- Revisa `pm2 logs camelia-backend` mientras navegas para confirmar que no
  hay errores.
- Confirma que Ramelo sigue funcionando normal en su propio dominio (no debería
  haberse tocado nada de su configuración).

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
