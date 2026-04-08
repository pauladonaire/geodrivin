// ============================================================
//  config.example.js — PLANTILLA de configuración
//  Copiá este archivo como "config.js" y completá los valores.
//  config.js está en .gitignore y NUNCA se debe commitear.
// ============================================================

const CONFIG = {

  // ── Google Sheets API Key ──────────────────────────────────
  // Obtenela en: Google Cloud Console → APIs → Credentials
  // Restricción recomendada: solo "Google Sheets API" + referrer de tu dominio
  SHEETS_API_KEY: 'AIzaSyBqsKySJZCQJ08eImBuMGyDjaISldwD0v4',

  // ── IDs de los Google Sheets ───────────────────────────────
  // Encontrás el ID en la URL del Sheet:
  // https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit

  FIJAS_SHEET_ID:     '1eAKCw1xuJ9qFYFDnc7HpZ986Nn34rljdJOc0MgOTm1M',
  DEPOSITOS_SHEET_ID: '1yjgGOPMWxjodE16CfYXwcq6of6ydMROZ0VgituXGUXg',
  USUARIOS_SHEET_ID:  '1BjujCArFJMz1qiOWoVXhhi70GtJoDtPx2iV3WvScuAY',

  // ── Nombres de las pestañas en cada Sheet ─────────────────
  // Deben coincidir exactamente con el nombre de la pestaña (tab)
  // visible en la parte inferior del Sheet.
  FIJAS_SHEET_TAB:       'Fijas',
  DEPOSITOS_SHEET_TAB:   'Depositos',
  USUARIOS_SHEET_TAB:    'Usuarios',

  // ── Sheet de fechas de ingreso de pendientes ───────────────
  // Sheet con 2 columnas: code | fecha_ingreso
  PENDIENTES_SHEET_ID:   '1DmAhLJlqBR2pWoqym5nstwI_kb0SwbMUvl70VCFDEOI',
  PENDIENTES_SHEET_TAB:  'DireccionesPendientes',

};
