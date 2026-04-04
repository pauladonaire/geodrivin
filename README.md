# Andesmar Geo — Direcciones Pendientes

Sistema interno de georeferenciación para Andesmar Cargas. Permite que cada depósito/CND consulte sus direcciones pendientes desde Driv.in, las corrija usando el buscador de Mapbox, y las envíe de vuelta georreferenciadas.

---

## Stack

- **Backend:** Node.js + Express + SQLite (better-sqlite3)
- **Frontend:** HTML5 + CSS3 puro + JavaScript vanilla
- **Mapa:** Leaflet.js (OpenStreetMap)
- **Geocoder:** Mapbox Geocoding API (gratuito, 100k req/mes)
- **Auth:** JWT + bcrypt

---

## Instalación rápida

### 1. Clonar y preparar

```bash
git clone <url-del-repo>
cd andesmar-geo/backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con los valores reales:

```env
DRIVIN_API_KEY=tu_api_key_de_drivin
MAPBOX_TOKEN=pk.eyJ1IjoiXXXX...    # ver sección Mapbox abajo
JWT_SECRET=una_cadena_larga_y_secreta_aqui
USE_SQLITE=true
PORT=3000
```

### 3. Crear base de datos y usuarios iniciales

```bash
# Desde la carpeta backend/
node scripts/seed.js
```

Esto crea todas las tablas y los usuarios por defecto:
- Usuarios CND: contraseña `Andesmar2025!`
- Admin: contraseña `AdminAndesmar2025!`

**⚠️ Cambiar estas contraseñas en producción.**

### 4. Iniciar el servidor

```bash
# Desarrollo (con recarga automática)
npm run dev

# Producción
npm start
```

El servidor queda en `http://localhost:3000`.

El frontend está servido por el mismo servidor: abrir `http://localhost:3000` en el navegador.

---

## Configurar Mapbox (gratis, sin tarjeta)

1. Ir a [mapbox.com](https://www.mapbox.com/) → **Sign up** (gratis)
2. En el dashboard → **Tokens** → copiar el **Default public token** (empieza con `pk.`)
3. Pegarlo en el `.env` como `MAPBOX_TOKEN=pk.eyJ1...`

El free tier incluye **100,000 requests/mes** (más que suficiente para uso interno).

---

## Agregar o modificar depósitos

Editar `backend/config/depositos.json` — no requiere reiniciar el servidor, se lee en cada request.

Estructura de un depósito:

```json
{
  "id": "cnd_nuevo",
  "nombre": "CND Nuevo Depósito",
  "color": "#FF6B35",
  "reglas": {
    "ciudades": ["Ciudad1", "Ciudad2"],
    "codigos_postales": ["1234", "5678"],
    "codigos_postales_extra": [],
    "excluir_codigos_postales": []
  }
}
```

Luego crear el usuario correspondiente con el seed o directamente en la DB:

```bash
node scripts/seed.js
```

---

## Usuarios del sistema

| Usuario | Depósito | Rol |
|---------|----------|-----|
| `cnd_bsas` | CND Buenos Aires | user |
| `cnd_mendoza` | CND Mendoza | user |
| `cnd_surmen` | CND Sur Mendoza | user |
| `cnd_sanmartin` | CND San Martín | user |
| `cnd_tunuyan` | CND Tunuyán | user |
| `cnd_cordoba` | CND Córdoba | user |
| `cnd_neuquen` | CND Neuquén | user |
| `admin` | Todos | admin |

---

## Lógica de asignación de depósitos

1. **Prioridad 1:** Código postal exacto → si el `zip_code` está en `codigos_postales` o `codigos_postales_extra` de un depósito → asignar a ese depósito.
2. **Prioridad 2:** Ciudad (case-insensitive, sin tildes) → si `city` coincide con la lista `ciudades` de un depósito → asignar.
3. **Excepción Mendoza:** Si la ciudad es Mendoza pero el CP está en `excluir_codigos_postales` → no asignar a CND Mendoza (va a CND Sur, San Martín o Tunuyán por CP).
4. **Sin match:** → `sin_asignar`.

---

## Estructura del proyecto

```
andesmar-geo/
├── frontend/
│   ├── index.html          ← Login
│   ├── dashboard.html      ← Panel principal
│   ├── css/
│   │   ├── main.css        ← Variables, reset, utilidades
│   │   ├── login.css       ← Estilos del login
│   │   ├── dashboard.css   ← Layout, tabla, sidebar
│   │   └── components.css  ← Toasts, dropdowns, badges
│   ├── js/
│   │   ├── auth.js         ← Login y JWT
│   │   ├── dashboard.js    ← Controlador principal
│   │   ├── geocoder.js     ← Integración Mapbox
│   │   ├── mapa.js         ← Leaflet maps
│   │   ├── drivin.js       ← API proxy client
│   │   ├── direccionesFijas.js ← CRUD fijas
│   │   └── toast.js        ← Notificaciones
│   └── assets/
│       └── logo_andesmar.png
└── backend/
    ├── server.js
    ├── config/
    │   ├── depositos.json  ← Configuración editable
    │   └── db.js
    ├── routes/             ← Express routers
    ├── controllers/        ← Lógica de negocio
    ├── middleware/         ← Auth JWT
    ├── models/             ← (referencia de esquema DB)
    └── scripts/
        ├── migrate.js      ← Crear tablas
        └── seed.js         ← Usuarios iniciales
```

---

## Deploy en Railway (backend + DB)

1. Crear cuenta en [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub repo**
3. Seleccionar el repo → Railway detecta Node.js automáticamente
4. **Variables de entorno** (en Railway → Variables):
   - `DRIVIN_API_KEY`, `MAPBOX_TOKEN`, `JWT_SECRET`
   - `USE_SQLITE=true` (Railway provee persistencia de volúmenes)
   - `NODE_ENV=production`
5. En `Settings → Source` → Root directory: `backend`
6. Deploy → Railway genera una URL tipo `https://andesmar-geo.up.railway.app`

Para el frontend con **Vercel**:
1. Subir solo la carpeta `frontend/` a GitHub (o al mismo repo)
2. En `frontend/js/auth.js` cambiar `API_BASE` a la URL de Railway
3. Vercel → New Project → seleccionar carpeta `frontend`

---

## API Endpoints

| Método | URL | Descripción |
|--------|-----|-------------|
| POST | `/api/auth/login` | Login, devuelve JWT |
| GET | `/api/auth/verify` | Verificar token |
| POST | `/api/drivin/fetch` | Consultar Driv.in y actualizar caché |
| GET | `/api/drivin/direcciones` | Obtener direcciones del caché |
| PUT | `/api/drivin/enviar` | Enviar coordenadas a Driv.in |
| GET | `/api/drivin/mapbox-token` | Token Mapbox para el frontend |
| GET | `/api/direcciones/depositos` | Stats por depósito |
| GET | `/api/direcciones/estadisticas` | Métricas del dashboard |
| GET | `/api/fijas` | Listar direcciones fijas |
| POST | `/api/fijas` | Crear dirección fija |
| PUT | `/api/fijas/:id` | Actualizar fija |
| DELETE | `/api/fijas/:id` | Eliminar fija |
| POST | `/api/fijas/:id/usar` | Incrementar contador de uso |

---

## Notas de seguridad

- La **API Key de Driv.in** nunca se expone al frontend. Todas las llamadas van por el backend.
- El **token de Mapbox** sí puede estar en el frontend (es una clave pública). Configurar restricciones de URL en el dashboard de Mapbox para producción.
- Los JWT expiran en 8 horas. Cambiar `JWT_EXPIRES_IN` en `.env` si necesitás otro valor.
- Cambiar **todas las contraseñas** antes de pasar a producción.
