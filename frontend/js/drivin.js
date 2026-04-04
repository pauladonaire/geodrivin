/* ============================================================
   drivin.js — Llamadas directas a Driv.in + Mapbox (sin backend)
   ============================================================ */

const DRIVIN_API_KEY  = '69191355-f4d1-40e4-bc2f-087b4451f59d';
const DRIVIN_BASE_URL = 'https://external.driv.in/api/external/v2';
// Token público de Mapbox (pk. = public, seguro para incluir en frontend)
const _mbt = ['pk.eyJ1IjoicGRvbmFpcmUwMSIsImEiOiJjbW5rZjd6', 'emMxMDMzMnhxMnhxcXI3c2U3In0.5WHjO4wylXbW1Kg8FodT_A'];
const MAPBOX_TOKEN = _mbt[0] + _mbt[1];

window.MAPBOX_TOKEN = MAPBOX_TOKEN;

const CACHE_KEY      = 'andesmar_cache';
const CORREGIDAS_KEY = 'andesmar_corregidas';

// ── Normalizar texto (tildes → sin tildes, minúsculas) ──
function normalizar(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// ── Cargar depositos.json ──
let _depositosCache = null;
async function getDepositosConfig() {
  if (_depositosCache) return _depositosCache;
  const r = await fetch('./config/depositos.json');
  const data = await r.json();
  _depositosCache = data.depositos;
  return _depositosCache;
}

// ── Asignar depósito a una dirección ──
function asignarDeposito(addr, depositos) {
  const zip  = (addr.zip_code || '').toString().trim();
  const city = normalizar(addr.city);

  // Prioridad 1: código postal exacto
  for (const dep of depositos) {
    const { codigos_postales = [], codigos_postales_extra = [] } = dep.reglas;
    const todos = [...codigos_postales, ...codigos_postales_extra];
    if (zip && todos.length > 0 && todos.includes(zip)) return dep.id;
  }

  // Prioridad 2: ciudad (con exclusión de CP)
  for (const dep of depositos) {
    const { ciudades = [], excluir_codigos_postales = [] } = dep.reglas;
    const ciudadesNorm = ciudades.map(normalizar);
    if (ciudadesNorm.includes(city)) {
      if (excluir_codigos_postales.length > 0 && zip && excluir_codigos_postales.includes(zip)) continue;
      return dep.id;
    }
  }

  return 'sin_asignar';
}

// ── localStorage helpers ──
function getCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
}
function setCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}
function getCorregidas() {
  try { return JSON.parse(localStorage.getItem(CORREGIDAS_KEY) || '[]'); } catch { return []; }
}
function addCorregida(item) {
  const list = getCorregidas();
  list.unshift(item);
  localStorage.setItem(CORREGIDAS_KEY, JSON.stringify(list));
}

// ══════════════════════════════════════════════════════════
//  API Driv.in
// ══════════════════════════════════════════════════════════

const Drivin = (() => {

  async function fetchFromDrivin() {
    const depositos = await getDepositosConfig();

    const r = await fetch(`${DRIVIN_BASE_URL}/addresses?georeferenced=0`, {
      headers: { 'X-API-Key': DRIVIN_API_KEY }
    });
    if (!r.ok) throw new Error(`Error ${r.status} al consultar Driv.in`);

    const data = await r.json();
    const addresses = Array.isArray(data) ? data : (data.addresses || data.data || []);

    const corregidas = new Set(getCorregidas().map(c => c.code));
    const cacheActual = getCache();
    const cacheMap = {};
    cacheActual.forEach(c => { cacheMap[c.code] = c; });

    for (const addr of addresses) {
      const depositoId = asignarDeposito(addr, depositos);
      const existing   = cacheMap[addr.code];

      let estado;
      if (existing && existing.estado === 'corregida') {
        estado = 'corregida'; // preservar si ya estaba corregida
      } else if (corregidas.has(addr.code)) {
        estado = 'corregida';
      } else if (addr.lat && addr.lng) {
        estado = 'coords_aprox';
      } else {
        estado = 'sin_coords';
      }

      cacheMap[addr.code] = {
        code: addr.code,
        datos: addr,
        deposito_id: depositoId,
        estado,
        ultima_actualizacion: new Date().toISOString()
      };
    }

    setCache(Object.values(cacheMap));
    return { ok: true, total: addresses.length };
  }

  async function getDirecciones(params = {}) {
    const user = Auth.getUser();
    let cache  = getCache();

    // Filtrar por depósito
    if (user.rol !== 'admin') {
      cache = cache.filter(c => c.deposito_id === user.deposito_id || c.deposito_id === 'sin_asignar');
    } else if (params.deposito && params.deposito !== 'all') {
      cache = cache.filter(c => c.deposito_id === params.deposito);
    }

    // Excluir corregidas por defecto
    cache = cache.filter(c => c.estado !== 'corregida');

    const corregidaMap = {};
    getCorregidas().forEach(c => { if (!corregidaMap[c.code]) corregidaMap[c.code] = c; });

    const direcciones = cache.map(c => ({
      ...c.datos,
      deposito_id:          c.deposito_id,
      estado:               c.estado,
      ultima_actualizacion: c.ultima_actualizacion,
      lat_nueva:            corregidaMap[c.code]?.lat_nueva,
      lng_nueva:            corregidaMap[c.code]?.lng_nueva,
      fecha_correccion:     corregidaMap[c.code]?.fecha_correccion,
    }));

    return { direcciones, total: direcciones.length };
  }

  async function enviar(addresses) {
    const resultados = [];

    for (const addr of addresses) {
      let ok = false;
      let errorMsg = null;

      for (let intento = 0; intento < 2; intento++) {
        if (intento > 0) await new Promise(r => setTimeout(r, 3000));
        try {
          const r = await fetch(`${DRIVIN_BASE_URL}/addresses`, {
            method: 'PUT',
            headers: {
              'X-API-Key': DRIVIN_API_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ addresses: [addr] })
          });
          if (r.ok) { ok = true; break; }
          errorMsg = `HTTP ${r.status}`;
        } catch (e) {
          errorMsg = e.message;
        }
      }

      // Guardar corrección
      const cache = getCache();
      const item  = cache.find(c => c.code === addr.code);
      const original = item?.datos || {};

      addCorregida({
        code:             addr.code,
        address1_original: original.address1,
        city_original:    original.city,
        lat_nueva:        addr.lat,
        lng_nueva:        addr.lng,
        deposito_id:      item?.deposito_id,
        usuario:          Auth.getUser()?.username,
        fecha_correccion: new Date().toISOString(),
        estado_envio:     ok ? 'ok' : 'error',
        error_detalle:    ok ? null : errorMsg
      });

      // Actualizar estado en cache
      const idx = cache.findIndex(c => c.code === addr.code);
      if (idx >= 0) {
        cache[idx].estado = ok ? 'corregida' : 'error_envio';
        setCache(cache);
      }

      resultados.push({ code: addr.code, ok, error: ok ? null : errorMsg });
    }

    const exitosos = resultados.filter(r => r.ok).length;
    const fallidos = resultados.filter(r => !r.ok).length;
    return { ok: fallidos === 0, exitosos, fallidos, resultados };
  }

  async function getDepositos() {
    const depositos = await getDepositosConfig();
    const user  = Auth.getUser();
    const cache = getCache();

    const countMap = {};
    cache.forEach(c => {
      if (!countMap[c.deposito_id]) {
        countMap[c.deposito_id] = { total: 0, sin_coords: 0, coords_aprox: 0, corregidas: 0, errores: 0 };
      }
      const st = countMap[c.deposito_id];
      st.total++;
      if (c.estado === 'sin_coords')   st.sin_coords++;
      if (c.estado === 'coords_aprox') st.coords_aprox++;
      if (c.estado === 'corregida')    st.corregidas++;
      if (c.estado === 'error_envio')  st.errores++;
    });

    let deps = depositos.map(d => ({
      ...d,
      stats: countMap[d.id] || { total: 0, sin_coords: 0, coords_aprox: 0, corregidas: 0, errores: 0 }
    }));

    if (user.rol !== 'admin') {
      deps = deps.filter(d => d.id === user.deposito_id);
    }

    const sinAsignar = {
      id: 'sin_asignar', nombre: 'Sin asignar', color: '#666666',
      stats: countMap['sin_asignar'] || { total: 0, sin_coords: 0, coords_aprox: 0, corregidas: 0, errores: 0 }
    };

    return { depositos: deps, sin_asignar: sinAsignar };
  }

  async function getEstadisticas() {
    const user  = Auth.getUser();
    let cache   = getCache();

    if (user.rol !== 'admin') {
      cache = cache.filter(c => c.deposito_id === user.deposito_id);
    }

    const today = new Date().toISOString().split('T')[0];
    const corregidas = getCorregidas().filter(c => {
      if (user.rol !== 'admin' && c.deposito_id !== user.deposito_id) return false;
      return c.fecha_correccion?.startsWith(today);
    });

    return {
      total_cache:      cache.length,
      sin_coords:       cache.filter(c => c.estado === 'sin_coords').length,
      coords_aprox:     cache.filter(c => c.estado === 'coords_aprox').length,
      corregidas_total: cache.filter(c => c.estado === 'corregida').length,
      corregidas_hoy:   corregidas.length
    };
  }

  function buildPayload(direccion, lat, lng, precision = 'mapbox') {
    const obs = `Dir. original: ${direccion.address1 || ''}, ${direccion.city || ''}`;
    return {
      code:          direccion.code,
      address1:      direccion.address1    || null,
      address2:      direccion.address2    || null,
      city:          direccion.city        || null,
      state:         direccion.state       || null,
      country:       direccion.country     || 'Argentina',
      zip_code:      direccion.zip_code    || null,
      lat:           parseFloat(lat),
      lng:           parseFloat(lng),
      name:          direccion.name        || null,
      client:        direccion.client      || null,
      client_code:   null,
      address_type:  direccion.address_type || null,
      contact_name:  null, phone: direccion.phone || null, email: direccion.email || null,
      approve_contact_name: null, approve_contact_phone: null, approve_contact_email: null,
      start_contact_name:   null, start_contact_phone:   null, start_contact_email:   null,
      near_contact_name:    null, near_contact_phone:    null, near_contact_email:    null,
      delivered_contact_name: null, delivered_contact_phone: null, delivered_contact_email: null,
      service_time:        direccion.service_time       || null,
      time_window_start:   direccion.time_window_start  || null,
      time_window_end:     direccion.time_window_end    || null,
      time_window_start_2: null, time_window_end_2: null,
      vehicle_code: null, exclusividad: null,
      observation:  obs,
      sales_zone_code: null, sales_zone_name: null,
      supplier_code:   null, supplier_name:   null,
      priority:     null,
      update_all:   true,
      _tipo:   'eventual',
      _metodo: precision === 'Alta' ? 'mapbox' : 'manual'
    };
  }

  return { fetchFromDrivin, getDirecciones, enviar, getDepositos, getEstadisticas, buildPayload };
})();

window.Drivin = Drivin;
