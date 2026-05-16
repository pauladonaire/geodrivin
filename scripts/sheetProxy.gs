/**
 * sheetProxy.gs — Proxy para escritura en Google Sheets + Cache de Driv.in
 *
 * INSTRUCCIONES DE DEPLOY:
 *  1. Abrí: https://script.google.com → "Nuevo proyecto"
 *  2. Borrá el código de ejemplo y pegá TODO este archivo
 *  3. Clic en "Implementar" → "Nueva implementación"
 *     · Tipo: "Aplicación web"
 *     · Ejecutar como: "Yo (tu cuenta de Google)"
 *     · Quién tiene acceso: "Cualquier persona"
 *  4. Autorizá los permisos que pide Google (incluye Drive)
 *  5. Copiá la URL que termina en /exec y pegala en config.js como APPS_SCRIPT_URL
 *
 * PARA EL REFRESH AUTOMÁTICO A MEDIANOCHE:
 *  6. En el editor de Apps Script, abrí la consola de ejecución (▶)
 *  7. Seleccioná la función "crearTriggerMedianoche" y ejecutala UNA SOLA VEZ
 *  8. Listo — el trigger corre todos los días entre 00:00 y 01:00 sin necesitar el browser
 *
 * IMPORTANTE: Cada vez que modifiques este código, hacé una NUEVA implementación
 * (no "editar implementación existente") para que los cambios tomen efecto.
 */

// ── Sheets autorizados (seguridad básica) ──
const ALLOWED_SHEET_IDS = [
  '1eAKCw1xuJ9qFYFDnc7HpZ986Nn34rljdJOc0MgOTm1M', // Fijas
  '1DmAhLJlqBR2pWoqym5nstwI_kb0SwbMUvl70VCFDEOI', // DireccionesPendientes
];

// ── Driv.in (mismo key que el frontend — es público) ──
const DRIVIN_API_KEY_GAS  = '69191355-f4d1-40e4-bc2f-087b4451f59d';
const DRIVIN_BASE_URL_GAS = 'https://external.driv.in/api/external/v2';

// Nombre del archivo JSON de cache en Drive del usuario que ejecuta el script
const CACHE_FILE_NAME = 'andesmar_dir_cache.json';


// ══════════════════════════════════════════════════════════════════
//  ENDPOINTS HTTP
// ══════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const raw = (e.parameter && e.parameter.payload)
      ? e.parameter.payload
      : e.postData.contents;
    const body = JSON.parse(raw);
    const { sheetId, tabName, headers, filas } = body;

    if (!sheetId)  return _error('Falta sheetId');
    if (!tabName)  return _error('Falta tabName');
    if (!headers)  return _error('Faltan headers');
    if (!filas)    return _error('Faltan filas');

    if (!ALLOWED_SHEET_IDS.includes(sheetId)) {
      return _error('sheetId no autorizado: ' + sheetId);
    }

    const ss    = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return _error('Pestaña "' + tabName + '" no encontrada en el Sheet');

    sheet.clearContents();

    const values = [headers, ...filas];
    if (values.length > 0 && values[0].length > 0) {
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }

    return _ok();

  } catch (err) {
    return _error(err.message || 'Error desconocido');
  }
}

function doGet(e) {
  // El frontend pide el cache pre-cargado
  if (e.parameter && e.parameter.action === 'cache') {
    return _servirCache();
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, msg: 'Sheet Proxy activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}


// ══════════════════════════════════════════════════════════════════
//  CACHE DE DRIV.IN — función llamada por el trigger de medianoche
// ══════════════════════════════════════════════════════════════════

function refreshCacheGas() {
  try {
    const PER_PAGE  = 1000;
    const MAX_PAGES = 30;
    const seenCodes = {};
    let   allAddresses = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = DRIVIN_BASE_URL_GAS
        + '/addresses?georeferenced=0&page=' + page + '&per_page=' + PER_PAGE;

      const response = UrlFetchApp.fetch(url, {
        method:             'get',
        headers:            { 'X-API-Key': DRIVIN_API_KEY_GAS },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        Logger.log('Error HTTP ' + response.getResponseCode() + ' en página ' + page);
        break;
      }

      const data  = JSON.parse(response.getContentText());
      const batch = Array.isArray(data)
        ? data
        : (data.response || data.addresses || data.data || []);

      if (!batch.length) break;

      // Filtrar duplicados (por si la API no soporta paginación real)
      const newItems = batch.filter(function(a) { return a.code && !seenCodes[a.code]; });
      if (!newItems.length) break;
      newItems.forEach(function(a) { seenCodes[a.code] = true; });
      allAddresses = allAddresses.concat(newItems);

      if (batch.length < PER_PAGE) break;
    }

    const cacheData = {
      ok:          true,
      addresses:   allAddresses,
      fetched_at:  new Date().toISOString(),
      total:       allAddresses.length
    };

    _escribirCacheFile(JSON.stringify(cacheData));
    Logger.log('Cache Driv.in actualizado: ' + allAddresses.length + ' dir. — ' + cacheData.fetched_at);

  } catch (err) {
    Logger.log('Error en refreshCacheGas: ' + err.message);
  }
}

function _servirCache() {
  try {
    const content = _leerCacheFile();
    if (!content) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Cache no disponible aún' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(content)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return _error('Error al leer cache: ' + err.message);
  }
}

function _escribirCacheFile(json) {
  const files = DriveApp.getFilesByName(CACHE_FILE_NAME);
  if (files.hasNext()) {
    files.next().setContent(json);
  } else {
    DriveApp.createFile(CACHE_FILE_NAME, json, MimeType.PLAIN_TEXT);
  }
}

function _leerCacheFile() {
  const files = DriveApp.getFilesByName(CACHE_FILE_NAME);
  if (!files.hasNext()) return null;
  return files.next().getBlob().getDataAsString();
}


// ══════════════════════════════════════════════════════════════════
//  TRIGGER — ejecutar UNA VEZ manualmente desde el editor de GAS
// ══════════════════════════════════════════════════════════════════

function crearTriggerMedianoche() {
  // Eliminar triggers previos de refreshCacheGas para evitar duplicados
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'refreshCacheGas') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Trigger diario entre 00:00 y 01:00 (hora del script = Argentina si configurás la zona)
  ScriptApp.newTrigger('refreshCacheGas')
    .timeBased()
    .atHour(0)
    .nearMinute(0)
    .everyDays(1)
    .create();

  Logger.log('Trigger creado: refreshCacheGas se ejecuta todos los días entre 00:00 y 01:00');
}


// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════

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
