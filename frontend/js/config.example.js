// ============================================================
//  config.example.js — PLANTILLA de configuración
//  Copiá este archivo como "config.js" y completá los valores.
//  config.js está en .gitignore y NUNCA se debe commitear.
// ============================================================

const CONFIG = {

  // ── Apps Script Web App (para escritura en Sheets) ────────
  // Los Google Sheets API Keys NO permiten escribir, solo leer.
  // La escritura se hace a través de un Google Apps Script desplegado
  // como Web App. Seguí estos pasos:
  //
  //  1. Abrí: https://script.google.com → "Nuevo proyecto"
  //  2. Borrá el código de ejemplo y pegá el código de sheetProxy.gs
  //     (está en la carpeta /scripts/ del proyecto)
  //  3. Clic en "Implementar" → "Nueva implementación"
  //     · Tipo: "Aplicación web"
  //     · Ejecutar como: "Yo (tu cuenta)"
  //     · Quién tiene acceso: "Cualquier persona"
  //  4. Autorizá los permisos cuando te lo pida
  //  5. Copiá la URL de la implementación (termina en /exec)
  //  6. Pegala como valor de APPS_SCRIPT_URL abajo
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwxGBg8eD6u8r6YVpRR9VgkvqCqsIMjPvyJ76k1Y084kKRIZTVGeHDaL9-sMZfyU7z0/exec',

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
