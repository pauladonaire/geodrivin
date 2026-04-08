// ============================================================
//  config.example.js — PLANTILLA de configuración
//  Copiá este archivo como "config.js" y completá los valores.
//  config.js está en .gitignore y NUNCA se debe commitear.
// ============================================================

const CONFIG = {

  // ── Google Sheets API Key ──────────────────────────────────
  // Obtenela en: Google Cloud Console → APIs → Credentials
  // Restricción recomendada: solo "Google Sheets API" + referrer de tu dominio
  SHEETS_API_KEY: 'TU_API_KEY_AQUI',

  // ── IDs de los Google Sheets ───────────────────────────────
  // Encontrás el ID en la URL del Sheet:
  // https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit

  FIJAS_SHEET_ID:     '1eAKCw1xuJ9qFYFDnc7HpZ986Nn34rljdJOc0MgOTm1M',
  DEPOSITOS_SHEET_ID: '1yjgGOPMWxjodE16CfYXwcq6of6ydMROZ0VgituXGUXg',
  USUARIOS_SHEET_ID:  'PEGAR_ID_DEL_SHEET_DE_USUARIOS_AQUI',

  // ── Nombres de las pestañas en cada Sheet ─────────────────
  // Deben coincidir exactamente con el nombre de la pestaña (tab)
  // visible en la parte inferior del Sheet.
  FIJAS_SHEET_TAB:     'Fijas',
  DEPOSITOS_SHEET_TAB: 'Depositos',
  USUARIOS_SHEET_TAB:  'Usuarios',

};
