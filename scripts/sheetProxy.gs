/**
 * sheetProxy.gs — Proxy para escritura en Google Sheets
 *
 * INSTRUCCIONES DE DEPLOY:
 *  1. Abrí: https://script.google.com → "Nuevo proyecto"
 *  2. Borrá el código de ejemplo y pegá TODO este archivo
 *  3. Clic en "Implementar" → "Nueva implementación"
 *     · Tipo: "Aplicación web"
 *     · Ejecutar como: "Yo (tu cuenta de Google)"
 *     · Quién tiene acceso: "Cualquier persona"
 *  4. Autorizá los permisos que pide Google
 *  5. Copiá la URL que termina en /exec y pegala en config.js como APPS_SCRIPT_URL
 *
 * IMPORTANTE: Cada vez que modifiques este código, hacé una NUEVA implementación
 * (no "editar implementación existente") para que los cambios tomen efecto.
 */

// IDs de los Sheets autorizados a modificar (seguridad básica)
const ALLOWED_SHEET_IDS = [
  '1eAKCw1xuJ9qFYFDnc7HpZ986Nn34rljdJOc0MgOTm1M', // Fijas
  '1DmAhLJlqBR2pWoqym5nstwI_kb0SwbMUvl70VCFDEOI', // DireccionesPendientes
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { sheetId, tabName, headers, filas } = body;

    // Validaciones básicas
    if (!sheetId)  return _error('Falta sheetId');
    if (!tabName)  return _error('Falta tabName');
    if (!headers)  return _error('Faltan headers');
    if (!filas)    return _error('Faltan filas');

    // Verificar que el sheetId esté en la lista blanca
    if (!ALLOWED_SHEET_IDS.includes(sheetId)) {
      return _error('sheetId no autorizado: ' + sheetId);
    }

    const ss    = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return _error('Pestaña "' + tabName + '" no encontrada en el Sheet');

    // Limpiar contenido actual
    sheet.clearContents();

    // Escribir headers + datos
    const values = [headers, ...filas];
    if (values.length > 0 && values[0].length > 0) {
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }

    return _ok();

  } catch (err) {
    return _error(err.message || 'Error desconocido');
  }
}

// Respuesta CORS-compatible para peticiones OPTIONS (preflight)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, msg: 'Sheet Proxy activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function _ok() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function _error(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}
