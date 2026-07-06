# TripSync

Itinerario de viaje colaborativo, en tiempo real, sin frameworks — HTML + CSS + Vanilla JS + Supabase, listo para Vercel como PWA instalable.

## 1. Configura Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta:

```sql
create table itinerario (
  id            uuid primary key default gen_random_uuid(),
  codigo_viaje  text not null,
  fecha         date not null,
  hora          time not null,
  titulo        text not null,
  ubicacion     text,
  notas         text,
  creado_por    text,
  created_at    timestamptz default now()
);

alter table itinerario enable row level security;

create policy "auth can read" on itinerario
  for select using (auth.role() = 'authenticated');
create policy "auth can write" on itinerario
  for insert with check (auth.role() = 'authenticated');
create policy "auth can update" on itinerario
  for update using (auth.role() = 'authenticated');
create policy "auth can delete" on itinerario
  for delete using (auth.role() = 'authenticated');
```

3. En **Authentication → Sign In / Up**, activa **Anonymous sign-ins**.
4. En **Database → Replication**, activa Realtime para la tabla `itinerario`.
5. En **Project Settings → API**, copia tu `Project URL` y tu `anon public key`.

> Nota sobre seguridad: como el código de viaje es una contraseña compartida
> informal (pensada para un grupo de amigos, no para datos sensibles), la
> protección real viene de exigir sesión (aunque sea anónima) + conocer el
> código. Cualquiera con el código y una sesión anónima puede leer/escribir
> los eventos de ese viaje — es el mismo modelo de confianza que un enlace
> de Google Docs "cualquiera con el link".

## 2. Pega tus credenciales

Abre `app.js` y reemplaza:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

## 3. Pruébalo localmente

Cualquier servidor estático sirve (el Service Worker necesita `http://` o `https://`, no `file://`):

```bash
npx serve .
# o
python3 -m http.server 8080
```

Abre `http://localhost:8080` (o el puerto que te indique) desde tu celular en la misma red, o usa las herramientas de dispositivo móvil de tu navegador.

## 4. Despliega en Vercel

```bash
npm i -g vercel
vercel
```

O conecta el repositorio desde el dashboard de Vercel — no requiere build step, es un proyecto estático (déjalo como "Other" framework preset, sin build command, output directory = `.`).

## 5. Instálalo en tu celular

- **Android (Chrome):** menú ⋮ → "Agregar a pantalla de inicio".
- **iOS (Safari):** botón compartir → "Agregar a pantalla de inicio".

## Estructura de archivos

```
tripsync/
├── index.html      # Splash, login, timeline y bottom sheet
├── styles.css       # Design system + estilos mobile-first
├── app.js           # Lógica: auth, CRUD, realtime, render
├── manifest.json     # Configuración PWA
├── sw.js             # Service Worker (cache-first + fallback offline)
├── offline.html      # Pantalla amigable sin conexión
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## Cómo funciona por dentro

- **Login:** el "código de viaje" agrupa los eventos (columna `codigo_viaje`). No hay contraseñas de usuario individuales — cada persona sólo pone su nombre, que se guarda como `creado_por`.
- **Tiempo real:** `app.js` se suscribe a `postgres_changes` en la tabla `itinerario` filtrando por `codigo_viaje`; cualquier INSERT/UPDATE/DELETE de un amigo llega a todos los demás sin recargar.
- **Offline:** el Service Worker cachea el "app shell" (HTML/CSS/JS/íconos) con estrategia cache-first, y `app.js` guarda una copia del último itinerario en `localStorage` para poder mostrarlo sin conexión.
- **Sin frameworks:** toda la interfaz se genera con `renderItinerary()` y funciones auxiliares que inyectan HTML directamente en el DOM.
