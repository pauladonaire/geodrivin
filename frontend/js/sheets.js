/* ============================================================
   sheets.js — Lector/escritor de Google Sheets
   Lectura : CSV export (sheet "anyone with link can view")
   Escritura: Sheets API v4 con API Key (solo fijas)
   ============================================================ */

const Sheets = (() => {

  function _key() {
    return (typeof CONFIG !== 'undefined' && CONFIG.SHEETS_API_KEY) ? CONFIG.SHEETS_API_KEY : null;
  }

  // ── Parser CSV (maneja campos con comas y comillas) ────────
  function _parseLine(line) {
    const cells = [];
    let cell = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if (c === ',' && !inQ) {
        cells.push(cell); cell = '';
      } else {
        cell += c;
      }
    }
    cells.push(cell);
    return cells;
  }

  function _parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = _parseLine(lines[0]).map(h => h.trim());
    const rows = lines.slice(1)
      .map(line => {
        const vals = _parseLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
        return obj;
      })
      .filter(r => Object.values(r).some(v => v !== ''));
    return { headers, rows };
  }

  // ── Leer Sheet vía CSV público ─────────────────────────────
  // gidOrTab: número (gid) o string (nombre de pestaña). Default: 0 = primera pestaña.
  async function leerSheet(sheetId, gidOrTab = 0) {
    const tabParam = typeof gidOrTab === 'string'
      ? `sheet=${encodeURIComponent(gidOrTab)}`
      : `gid=${gidOrTab}`;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&${tabParam}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`No se pudo leer el Sheet (${r.status}). Verificá que sea público ("Anyone with link can view").`);
    const text = await r.text();
    return _parseCSV(text);
  }

  // ── Sobreescribir Sheet (limpiar + reescribir todo) ────────
  // Usada para crear / actualizar / eliminar filas en fijas.
  // headers: array de strings con los nombres de columna
  // filas: array de arrays con los valores (sin la fila de headers)
  async function sobreescribirSheet(sheetId, tabName, headers, filas) {
    const key = _key();
    if (!key) throw new Error('SHEETS_API_KEY no está configurada en config.js');

    const encTab = encodeURIComponent(tabName);

    // 1. Limpiar la pestaña
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encTab}:clear?key=${key}`;
    const cr = await fetch(clearUrl, { method: 'POST' });
    if (!cr.ok) {
      const e = await cr.json().catch(() => ({}));
      throw new Error(e.error?.message || `Error al limpiar el Sheet (${cr.status})`);
    }

    // 2. Escribir headers + datos
    const values = [headers, ...filas];
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encTab}?valueInputOption=USER_ENTERED&key=${key}`;
    const wr = await fetch(writeUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values })
    });
    if (!wr.ok) {
      const e = await wr.json().catch(() => ({}));
      throw new Error(e.error?.message || `Error al escribir en el Sheet (${wr.status})`);
    }
    return wr.json();
  }

  return { leerSheet, sobreescribirSheet };
})();

window.Sheets = Sheets;
