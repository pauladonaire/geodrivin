/* ============================================================
   pendientesSheet.js — Registro de fechas de ingreso de pendientes
   Sheet: "DireccionesPendientes" con columnas: code | fecha_ingreso
   ============================================================ */

const PendientesSheet = (() => {

  const HEADERS = ['code', 'fecha_ingreso'];

  // Map<code, fecha_ingreso> cargado en memoria
  let _map = null;

  function _sheetId()  { return (typeof CONFIG !== 'undefined') ? CONFIG.PENDIENTES_SHEET_ID  : null; }
  function _tabName()  { return (typeof CONFIG !== 'undefined') ? (CONFIG.PENDIENTES_SHEET_TAB || 'DireccionesPendientes') : 'DireccionesPendientes'; }

  // ── Leer todo el Sheet y cargar en _map ───────────────────
  async function cargar() {
    const sheetId = _sheetId();
    if (!sheetId) { _map = new Map(); return _map; }
    const { rows } = await Sheets.leerSheet(sheetId, _tabName());
    _map = new Map();
    rows.filter(r => r.code).forEach(r => _map.set(r.code, r.fecha_ingreso || ''));
    return _map;
  }

  // Devuelve el mapa actual (sin re-leer)
  function getMap() {
    return _map || new Map();
  }

  // ── Guardar _map completo al Sheet ────────────────────────
  async function _guardar() {
    const sheetId = _sheetId();
    if (!sheetId) return;
    const filas = [..._map.entries()].map(([code, fecha]) => [code, fecha]);
    await Sheets.sobreescribirSheet(sheetId, _tabName(), HEADERS, filas);
  }

  // ── Registrar codes nuevos con fecha de hoy ───────────────
  // Siempre re-lee desde el Sheet para tener el estado más fresco
  // (evita conflictos si otra usuaria agregó datos mientras tanto)
  async function registrarNuevos(codes) {
    if (!_sheetId()) { _map = new Map(); return; }

    // Leer siempre fresco desde el Sheet
    await cargar();

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let changed = false;

    for (const code of codes) {
      if (code && !_map.has(code)) {
        _map.set(code, today);
        changed = true;
      }
    }

    if (changed) await _guardar();
  }

  // ── Eliminar un code del Sheet ────────────────────────────
  async function eliminar(code) {
    if (!_sheetId()) return;
    const map = _map || await cargar();
    if (!map.has(code)) return;
    map.delete(code);
    await _guardar();
  }

  // ── Eliminar varios codes a la vez (un solo write) ────────
  async function eliminarVarios(codes) {
    if (!_sheetId()) return;
    const map = _map || await cargar();
    let changed = false;
    for (const code of codes) {
      if (map.has(code)) { map.delete(code); changed = true; }
    }
    if (changed) await _guardar();
  }

  return { cargar, getMap, registrarNuevos, eliminar, eliminarVarios };
})();

window.PendientesSheet = PendientesSheet;
