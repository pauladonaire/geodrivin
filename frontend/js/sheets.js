/* ============================================================
   sheets.js — Lector/escritor de Google Sheets
   Lectura : CSV export (sheet "anyone with link can view")
   Escritura: Sheets API v4 con API Key (solo fijas)
   ============================================================ */

const Sheets = (() => {

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

  // ── Sobreescribir Sheet vía Google Apps Script (proxy) ─────
  // La escritura directa con API Key no es soportada por Google.
  // Se usa un Apps Script desplegado como Web App (Execute as: Me,
  // Access: Anyone) que recibe los datos y escribe con tus credenciales.
  // headers: array de strings con los nombres de columna
  // filas: array de arrays con los valores (sin la fila de headers)
  async function sobreescribirSheet(sheetId, tabName, headers, filas) {
    const scriptUrl = (typeof CONFIG !== 'undefined' && CONFIG.APPS_SCRIPT_URL) ? CONFIG.APPS_SCRIPT_URL : null;
    if (!scriptUrl) throw new Error('APPS_SCRIPT_URL no está configurada en config.js. Seguí las instrucciones para crear el Apps Script.');

    const r = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ sheetId, tabName, headers, filas })
    });

    if (!r.ok) throw new Error(`Error al contactar el Apps Script (${r.status})`);

    const data = await r.json().catch(() => ({}));
    if (data.ok === false) throw new Error(data.error || 'Error desconocido en el Apps Script');
    return data;
  }

  return { leerSheet, sobreescribirSheet };
})();

window.Sheets = Sheets;
