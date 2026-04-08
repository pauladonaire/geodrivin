/* ============================================================
   drivin.js — Llamadas directas a Driv.in + Mapbox (sin backend)
   ============================================================ */

const DRIVIN_API_KEY  = '69191355-f4d1-40e4-bc2f-087b4451f59d';
const DRIVIN_BASE_URL = 'https://external.driv.in/api/external/v2';
// Token público de Mapbox (pk. = public, seguro para incluir en frontend)
const _mbt = ['pk.eyJ1IjoicGRvbmFpcmUwMSIsImEiOiJjbW5rZjd6', 'emMxMDMzMnhxMnhxcXI3c2U3In0.5WHjO4wylXbW1Kg8FodT_A'];
const MAPBOX_TOKEN = _mbt[0] + _mbt[1];

window.MAPBOX_TOKEN = MAPBOX_TOKEN;

const CORREGIDAS_KEY = 'andesmar_corregidas';

// ── Cache en memoria (no localStorage — sin límite de tamaño) ──
let _memCache = [];

function getCache()      { return _memCache; }
function setCache(data)  { _memCache = data; }

// ── Normalizar texto (tildes → sin tildes, minúsculas) ──
function normalizar(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// ── Cargar depósitos (desde Google Sheets o fallback a JSON local) ──
let _depositosCache = null;
async function getDepositosConfig() {
  if (_depositosCache) return _depositosCache;
  const sheetId = (typeof CONFIG !== 'undefined') ? CONFIG.DEPOSITOS_SHEET_ID : null;
  if (sheetId) {
    const { rows } = await Sheets.leerSheet(sheetId);
    _depositosCache = rows.map(r => ({
      id:     r.id,
      nombre: r.nombre,
      color:  r.color,
      reglas: {
        provincias:                _split(r.provincias),
        ciudades:                  _split(r.ciudades),
        codigos_postales:          _split(r.codigos_postales),
        codigos_postales_extra:    _split(r.codigos_postales_extra),
        excluir_codigos_postales:  _split(r.excluir_codigos_postales),
      }
    }));
  } else {
    // Fallback: leer desde JSON local
    const res = await fetch('./config/depositos.json');
    const data = await res.json();
    _depositosCache = data.depositos;
  }
  return _depositosCache;
}

function _split(val) {
  if (!val) return [];
  return val.split(';').map(s => s.trim()).filter(Boolean);
}

// ── Asignar depósito a una dirección ──
// Prioridad: 1) código postal  2) provincia (state)  3) ciudad (city) como fallback
function asignarDeposito(addr, depositos) {
  const zip      = (addr.zip_code || '').toString().trim();
  const province = normalizar(addr.state);
  const city     = normalizar(addr.city);

  // Prioridad 1: código postal exacto (codigos_postales + codigos_postales_extra)
  for (const dep of depositos) {
    const { codigos_postales = [], codigos_postales_extra = [] } = dep.reglas;
    const todos = [...codigos_postales, ...codigos_postales_extra];
    if (zip && todos.length > 0 && todos.includes(zip)) return dep.id;
  }

  // Prioridad 2: provincia (state), con exclusión de CP
  if (province) {
    for (const dep of depositos) {
      const { provincias = [], excluir_codigos_postales = [] } = dep.reglas;
      const provinciasNorm = provincias.map(normalizar);
      if (provinciasNorm.includes(province)) {
        if (excluir_codigos_postales.length > 0 && zip && excluir_codigos_postales.includes(zip)) continue;
        return dep.id;
      }
    }
  }

  // Prioridad 3: ciudad (city) — fallback para cuando state viene vacío
  if (city) {
    for (const dep of depositos) {
      const { ciudades = [], excluir_codigos_postales = [] } = dep.reglas;
      const ciudadesNorm = ciudades.map(normalizar);
      if (ciudadesNorm.includes(city)) {
        if (excluir_codigos_postales.length > 0 && zip && excluir_codigos_postales.includes(zip)) continue;
        return dep.id;
      }
    }
  }

  return 'sin_asignar';
}

// ── Corregidas helpers (siguen en localStorage — son pocas) ──
function getCorregidas() {
  try { return JSON.parse(localStorage.getItem(CORREGIDAS_KEY) || '[]'); } catch { return []; }
}
const MAX_CORREGIDAS = 300;
function addCorregida(item) {
  const list = getCorregidas();
  list.unshift(item);
  if (list.length > MAX_CORREGIDAS) list.splice(MAX_CORREGIDAS);
  try {
    localStorage.setItem(CORREGIDAS_KEY, JSON.stringify(list));
  } catch {
    // Si aún excede la cuota, limpiar a la mitad más reciente
    const mitad = list.slice(0, Math.floor(list.length / 2));
    try { localStorage.setItem(CORREGIDAS_KEY, JSON.stringify(mitad)); } catch { /* ignorar */ }
  }
}

// ══════════════════════════════════════════════════════════
//  API Driv.in
// ══════════════════════════════════════════════════════════

const Drivin = (() => {

  async function fetchFromDrivin() {
    const depositos = await getDepositosConfig();

    // Paginar hasta traer todas las direcciones (la API devuelve 1000 por página)
    const PER_PAGE  = 1000;
    const MAX_PAGES = 30;
    let allAddresses = [];
    const seenCodes  = new Set();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetch(
        `${DRIVIN_BASE_URL}/addresses?georeferenced=0&page=${page}&per_page=${PER_PAGE}`,
        { headers: { 'X-API-Key': DRIVIN_API_KEY } }
      );
      if (!r.ok) throw new Error(`Error ${r.status} al consultar Driv.in`);

      const data  = await r.json();
      const batch = Array.isArray(data) ? data : (data.response || data.addresses || data.data || []);

      if (!batch.length) break;

      // DEBUG temporal: ver campos del primer objeto de la API
      if (page === 1 && batch.length > 0) {
        console.log('[Drivin DEBUG] Primer address recibido:', batch[0]);
        console.log('[Drivin DEBUG] Campos disponibles:', Object.keys(batch[0]));
      }

      // Detectar si la API no soporta paginación (devuelve siempre los mismos registros)
      const newItems = batch.filter(a => !seenCodes.has(a.code));
      if (!newItems.length) break;
      batch.forEach(a => seenCodes.add(a.code));
      allAddresses = allAddresses.concat(batch);

      if (batch.length < PER_PAGE) break; // última página
    }

    const corregidas = new Set(getCorregidas().map(c => c.code));
    const newCache = [];

    for (const addr of allAddresses) {
      const depositoId = asignarDeposito(addr, depositos);

      let estado;
      if (corregidas.has(addr.code)) {
        estado = 'corregida';
      } else if (addr.lat && addr.lng) {
        estado = 'coords_aprox';
      } else {
        estado = 'sin_coords';
      }

      newCache.push({
        code: addr.code,
        datos: {
          code:              addr.code,
          name:              addr.name              || null,
          client:            addr.client            || null,
          address1:          addr.address1          || null,
          address2:          addr.address2          || null,
          city:              addr.city              || null,
          state:             addr.state             || null,
          zip_code:          addr.zip_code          || null,
          country:           addr.country           || 'Argentina',
          lat:               addr.lat               || null,
          lng:               addr.lng               || null,
          dispatch_date:     addr.dispatch_date     || null,
          address_type:      addr.address_type      || null,
          phone:             addr.phone             || null,
          email:             addr.email             || null,
          service_time:      addr.service_time      || null,
          time_window_start: addr.time_window_start || null,
          time_window_end:   addr.time_window_end   || null,
        },
        deposito_id: depositoId,
        estado,
        ultima_actualizacion: new Date().toISOString()
      });
    }

    setCache(newCache);
    return { ok: true, total: allAddresses.length };
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
            method: 'POST',
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

      // Guardar corrección en historial
      const cache    = getCache();
      const item     = cache.find(c => c.code === addr.code);
      const original = item?.datos || {};

      addCorregida({
        code:              addr.code,
        address1_original: original.address1,
        city_original:     original.city,
        lat_nueva:         addr.lat,
        lng_nueva:         addr.lng,
        deposito_id:       item?.deposito_id,
        usuario:           Auth.getUser()?.username,
        fecha_correccion:  new Date().toISOString(),
        estado_envio:      ok ? 'ok' : 'error',
        error_detalle:     ok ? null : errorMsg
      });

      // Actualizar estado en cache en memoria
      if (item) {
        item.estado = ok ? 'corregida' : 'error_envio';
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

  // newAddress: { address1, city } — dirección corregida vía Mapbox (opcional)
  function buildPayload(direccion, lat, lng, precision = 'mapbox', newAddress = null) {
    const obs = `Dir. original: ${direccion.address1 || ''}, ${direccion.city || ''}`;
    return {
      code:          direccion.code,
      address1:      newAddress?.address1  || direccion.address1    || null,
      address2:      direccion.address2    || null,
      city:          newAddress?.city      || direccion.city        || null,
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
