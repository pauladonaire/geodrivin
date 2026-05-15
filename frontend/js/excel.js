/* ============================================================
   excel.js — Carga masiva por Excel de cliente (TRF y futuros)
   ============================================================ */

// ── Formatos de clientes (extensible) ──────────────────────────
const FORMATOS_EXCEL = {
  TRF: {
    nombre:          'TRF Ecommerce',
    hojas_activas:   ['Amba', 'Interior'],
    hojas_ignorar:   ['Retornar a TRF'],
    col_numero:      'Numero',    // col A → match con name en Driv.in
    col_email:       'Email',     // col I → validación cruzada
    col_lat:         'Latitud',   // col J → coordenada entera
    col_lng:         'Longitud',  // col K → coordenada entera
  }
  // Agregar nuevos clientes acá: OTRO_CLIENTE: { ... }
};

// ── Módulo de lógica (sin UI) ───────────────────────────────────
const ExcelModule = (() => {
  'use strict';

  let _archivo     = null;
  let _resultado   = null;
  let _selectedCodes = new Set();

  // Convertir coord entera → decimal
  // Estrategia: insertar punto después del 2do dígito del valor absoluto
  // Ej: -329809081 → -32.9809081  /  -6887690 → -68.8769
  function convertirCoord(valor) {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    if (isNaN(n) || n === 0) return null;

    // Ya es float razonable (abs < 1000 = tiene punto decimal)
    if (Math.abs(n) < 1000) return n;

    // Entero → insertar punto después del 2do dígito del abs
    const strAbs = String(Math.abs(Math.round(n)));
    if (strAbs.length < 3) return null;  // inválido
    const resultado = parseFloat('-' + strAbs.slice(0, 2) + '.' + strAbs.slice(2));
    return isNaN(resultado) ? null : resultado;
  }

  // Leer archivo Excel en el browser y devolver filas como array de objetos
  async function leerExcel(file, formatoKey) {
    if (!window.XLSX) throw new Error('Librería XLSX no disponible. Recargá la página.');
    const formato = FORMATOS_EXCEL[formatoKey];
    if (!formato) throw new Error('Formato desconocido: ' + formatoKey);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.onload  = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb   = XLSX.read(data, { type: 'array' });

          const filas = [];
          for (const nombreHoja of formato.hojas_activas) {
            if (!wb.SheetNames.includes(nombreHoja)) continue;
            const ws   = wb.Sheets[nombreHoja];
            const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
            rows.forEach(r => filas.push({ ...r, _hoja: nombreHoja }));
          }
          resolve(filas);
        } catch (err) {
          reject(new Error('Error al parsear Excel: ' + err.message));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Hacer matching de filas del Excel contra el cache local de pendientes
  async function procesarMatches(filas, formatoKey) {
    const formato  = FORMATOS_EXCEL[formatoKey];
    const cacheResult = await Drivin.getDirecciones();
    // Solo pendientes (no corregidas, no de otro depósito — getDirecciones ya filtra por usuario)
    const pendientes  = cacheResult.direcciones.filter(d => d.estado !== 'corregida');

    let leidos = 0, conCoords = 0, sinCoords = 0;
    const matchCompleto = [], matchParcial = [], matchDudoso = [], sinMatch = [];
    const codesVistos = new Set(); // evitar duplicados si el mismo número aparece dos veces

    for (const fila of filas) {
      leidos++;
      const numero     = fila[formato.col_numero];
      const emailExcel = String(fila[formato.col_email] || '').trim().toLowerCase();
      const latRaw     = fila[formato.col_lat];
      const lngRaw     = fila[formato.col_lng];

      const lat = convertirCoord(latRaw);
      const lng = convertirCoord(lngRaw);

      if (!lat || !lng) { sinCoords++; continue; }
      conCoords++;

      if (!numero) continue;
      const numeroStr = String(numero).trim();

      // Buscar en pendientes: name contiene el número exacto como token
      const candidatos = pendientes.filter(d => {
        if (codesVistos.has(d.code)) return false;
        const name = String(d.name || '').trim();
        return (
          name === numeroStr ||
          name.startsWith(numeroStr + ' ') ||
          name.endsWith(' ' + numeroStr) ||
          name.includes(' ' + numeroStr + ' ')
        );
      });

      if (!candidatos.length) {
        sinMatch.push({ numero: numeroStr, lat, lng });
        continue;
      }

      const candidato   = candidatos[0];
      codesVistos.add(candidato.code); // evitar usar el mismo pendiente dos veces
      const emailDrivin = String(candidato.email || '').trim().toLowerCase();

      let tipoMatch;
      if (!emailExcel && !emailDrivin) {
        tipoMatch = 'parcial';
      } else if (!emailExcel || !emailDrivin) {
        tipoMatch = 'parcial';
      } else if (emailExcel === emailDrivin) {
        tipoMatch = 'completo';
      } else {
        tipoMatch = 'dudoso';
      }

      const item = {
        code:         candidato.code,
        numero:       numeroStr,
        nombre:       candidato.name      || '',
        address1:     candidato.address1  || '',
        city:         candidato.city      || '',
        email_excel:  emailExcel,
        email_drivin: emailDrivin,
        lat,
        lng,
        tipoMatch,
        _dir: candidato,  // objeto completo para buildPayload
      };

      if      (tipoMatch === 'completo') matchCompleto.push(item);
      else if (tipoMatch === 'parcial')  matchParcial.push(item);
      else                               matchDudoso.push(item);
    }

    return {
      leidos,
      conCoords,
      sinCoords,
      matchCompleto,
      matchParcial,
      matchDudoso,
      sinMatch,
      totalAplicables: matchCompleto.length + matchParcial.length,
    };
  }

  return {
    FORMATOS:      FORMATOS_EXCEL,
    convertirCoord,
    leerExcel,
    procesarMatches,
    get archivo()       { return _archivo; },
    set archivo(v)      { _archivo = v; },
    get resultado()     { return _resultado; },
    set resultado(v)    { _resultado = v; },
    get selectedCodes() { return _selectedCodes; },
    resetSelected()     { _selectedCodes = new Set(); },
  };
})();

window.ExcelModule = ExcelModule;


// ── UI del módulo Excel ─────────────────────────────────────────
(function () {
  'use strict';

  // ── Helpers ──
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showPanel(id) {
    ['view-table', 'view-fijas', 'view-excel', 'view-agrupado'].forEach(v => {
      const el = document.getElementById(v);
      if (el) el.style.display = v === id ? '' : 'none';
    });
    const sidebarStats = document.getElementById('sidebar-agrupado-stats');
    if (sidebarStats) sidebarStats.style.display = 'none';
    if (id === 'view-table') {
      document.getElementById('sidebar').classList.remove('mobile-open');
    }
  }

  // ── Inicialización ──
  document.addEventListener('DOMContentLoaded', () => {
    bindSidebar();
    initFormatoSelector();
    initDropzone();
    initSummaryButtons();
    initPreviewModal();
  });

  // ── Sidebar ──
  function bindSidebar() {
    const btnShow   = document.getElementById('btn-show-excel');
    const btnVolver = document.getElementById('btn-excel-volver');
    if (btnShow)   btnShow.addEventListener('click',   () => showPanel('view-excel'));
    if (btnVolver) btnVolver.addEventListener('click', () => showPanel('view-table'));
  }

  // ── Selector de formato ──
  function initFormatoSelector() {
    const sel  = document.getElementById('excel-formato');
    const desc = document.getElementById('excel-formato-desc');
    if (!sel) return;
    const actualizar = () => {
      if (!desc) return;
      const f = FORMATOS_EXCEL[sel.value];
      if (f) {
        desc.textContent =
          `Hojas: ${f.hojas_activas.join(', ')} · Match por columna: "${f.col_numero}"`;
      }
    };
    sel.addEventListener('change', actualizar);
    actualizar();

    const btnPlantilla = document.getElementById('btn-excel-descargar-plantilla');
    if (btnPlantilla) {
      btnPlantilla.addEventListener('click', () => descargarPlantilla(sel.value));
    }
  }

  // ── Plantilla descargable ──
  function descargarPlantilla(formatoKey) {
    if (!window.XLSX) { Toast.warning('Librería XLSX no disponible. Recargá la página.'); return; }
    const formato = FORMATOS_EXCEL[formatoKey];
    if (!formato) return;

    const wb = XLSX.utils.book_new();

    // Fila de encabezado + fila de ejemplo para cada hoja activa
    const headers = [formato.col_numero, formato.col_email, formato.col_lat, formato.col_lng];
    const ejemplo = [
      '12345678',
      'destinatario@ejemplo.com',
      -329809081,   // = -32.9809081 (Mendoza capital aprox.)
      -688413000,   // = -68.8413000
    ];

    for (const hoja of formato.hojas_activas) {
      const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);

      // Ancho de columnas orientativo
      ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];

      XLSX.utils.book_append_sheet(wb, ws, hoja);
    }

    const nombreArchivo = `plantilla_${formatoKey.toLowerCase()}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }

  // ── Dropzone ──
  function initDropzone() {
    const zone  = document.getElementById('excel-dropzone');
    const input = document.getElementById('excel-file-input');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    ['dragleave', 'dragend'].forEach(ev =>
      zone.addEventListener(ev, () => zone.classList.remove('dragover'))
    );
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) procesarArchivo(file);
    });

    input.addEventListener('change', (e) => {
      if (e.target.files?.[0]) procesarArchivo(e.target.files[0]);
      input.value = '';
    });
  }

  // ── Procesar archivo ──
  async function procesarArchivo(file) {
    if (!file.name.match(/\.xlsx?$/i)) {
      Toast.error('El archivo debe ser .xlsx o .xls');
      return;
    }

    const formatoKey = document.getElementById('excel-formato')?.value || 'TRF';
    const zone       = document.getElementById('excel-dropzone');

    zone.classList.add('loading');
    zone.querySelector('.excel-dropzone-title').textContent = 'Procesando…';

    try {
      // Verificar que el cache de Driv.in no esté vacío
      const cacheCheck = await Drivin.getDirecciones();
      if (!cacheCheck.direcciones || cacheCheck.direcciones.length === 0) {
        resetDropzone();
        Toast.warning(
          'No hay direcciones cargadas en el cache. Usá el botón "↻ Actualizar" del topbar primero.',
          'Cache vacío',
          6000
        );
        return;
      }

      ExcelModule.archivo = file.name;
      const filas = await ExcelModule.leerExcel(file, formatoKey);

      if (!filas.length) {
        Toast.warning('No se encontraron filas en las hojas activas del archivo.');
        resetDropzone();
        return;
      }

      const procesandoToast = Toast.info(`Procesando ${filas.length} filas del Excel…`);

      const resultado = await ExcelModule.procesarMatches(filas, formatoKey);
      ExcelModule.resultado = resultado;
      ExcelModule.resetSelected();

      // Pre-seleccionar completos y parciales (NO los dudosos)
      resultado.matchCompleto.forEach(m => ExcelModule.selectedCodes.add(m.code));
      resultado.matchParcial.forEach(m  => ExcelModule.selectedCodes.add(m.code));

      resetDropzone();
      if (procesandoToast && Toast.remove) Toast.remove(procesandoToast);

      mostrarResumen(resultado, file.name);

    } catch (err) {
      resetDropzone();
      Toast.error('Error al procesar: ' + err.message);
    }
  }

  function resetDropzone() {
    const zone = document.getElementById('excel-dropzone');
    if (!zone) return;
    zone.classList.remove('loading', 'dragover');
    const title = zone.querySelector('.excel-dropzone-title');
    if (title) title.textContent = 'Arrastrá el archivo Excel acá';
  }

  // ── Mostrar resumen ──
  function mostrarResumen(resultado, filename) {
    const zone    = document.getElementById('excel-dropzone');
    const summary = document.getElementById('excel-summary');
    const progEl  = document.getElementById('excel-progress');
    if (!summary) return;

    document.getElementById('excel-filename').textContent = filename;

    const grid = document.getElementById('excel-summary-grid');
    grid.innerHTML = `
      <div class="excel-stat-card">
        <div class="excel-stat-value">${resultado.leidos.toLocaleString()}</div>
        <div class="excel-stat-label">Filas leídas del Excel</div>
      </div>
      <div class="excel-stat-card">
        <div class="excel-stat-value">${resultado.conCoords.toLocaleString()}</div>
        <div class="excel-stat-label">Con coordenadas válidas</div>
      </div>
      <div class="excel-stat-card orange">
        <div class="excel-stat-value">${resultado.sinCoords.toLocaleString()}</div>
        <div class="excel-stat-label">Sin coords (lat=0) — ignoradas</div>
      </div>
      <div class="excel-stat-card green">
        <div class="excel-stat-value">${resultado.matchCompleto.length}</div>
        <div class="excel-stat-label">&#10003; Match completo (número + email)</div>
      </div>
      <div class="excel-stat-card yellow">
        <div class="excel-stat-value">${resultado.matchParcial.length}</div>
        <div class="excel-stat-label">&#9888; Match parcial (email vacío)</div>
      </div>
      <div class="excel-stat-card red">
        <div class="excel-stat-value">${resultado.matchDudoso.length}</div>
        <div class="excel-stat-label">&#10007; Match dudoso (email no coincide)</div>
      </div>
    `;

    const total = resultado.totalAplicables;
    const labelEl = document.getElementById('excel-aplicar-label');
    if (labelEl) {
      labelEl.textContent = total > 0
        ? `¿Aplicar georeferenciación a ${total} dirección${total !== 1 ? 'es' : ''}? (${resultado.matchCompleto.length} completos + ${resultado.matchParcial.length} parciales)`
        : 'Sin coincidencias para enviar en este depósito.';
    }

    const btnAplicar = document.getElementById('btn-excel-aplicar');
    if (btnAplicar) btnAplicar.disabled = total === 0;

    if (zone)    zone.style.display    = 'none';
    if (progEl)  progEl.style.display  = 'none';
    summary.style.display = '';
  }

  // ── Botones del resumen ──
  function initSummaryButtons() {
    const btnVerDetalle = document.getElementById('btn-excel-ver-detalle');
    const btnAplicar    = document.getElementById('btn-excel-aplicar');
    const btnReset      = document.getElementById('btn-excel-reset');

    if (btnVerDetalle) btnVerDetalle.addEventListener('click', abrirPreviewModal);
    if (btnAplicar)    btnAplicar.addEventListener('click',    aplicarDirecto);
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        ExcelModule.resultado = null;
        ExcelModule.resetSelected();
        document.getElementById('excel-summary').style.display = 'none';
        document.getElementById('excel-dropzone').style.display = '';
      });
    }
  }

  // ── Envío masivo con progress ──
  async function enviarMatches(matches, archivoNombre) {
    const progressEl   = document.getElementById('excel-progress');
    const progressText = document.getElementById('excel-progress-text');
    const progressFill = document.getElementById('excel-progress-fill');
    const summaryEl    = document.getElementById('excel-summary');
    const dropEl       = document.getElementById('excel-dropzone');

    if (progressEl)  progressEl.style.display  = '';
    if (summaryEl)   summaryEl.style.display    = 'none';
    if (progressFill) progressFill.style.width  = '0%';

    const total   = matches.length;
    let enviados  = 0, exitosos = 0, fallidos = 0;
    const BATCH   = 50;

    for (let i = 0; i < matches.length; i += BATCH) {
      const batch    = matches.slice(i, i + BATCH);
      const payloads = batch.map(m => {
        const p    = Drivin.buildPayload(m._dir, m.lat, m.lng, 'mapbox');
        p._metodo  = 'excel_cliente';
        return p;
      });

      try {
        const result = await Drivin.enviar(payloads);
        exitosos += result.exitosos;
        fallidos += result.fallidos;
      } catch {
        fallidos += batch.length;
      }

      enviados += batch.length;
      const pct = Math.round((enviados / total) * 100);
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressText) progressText.textContent  = `Enviando ${enviados}/${total}…`;
    }

    if (progressEl) progressEl.style.display = 'none';
    if (dropEl)     dropEl.style.display      = '';

    ExcelModule.resultado   = null;
    ExcelModule.resetSelected();

    if (exitosos > 0) {
      Toast.success(
        `${exitosos} dirección${exitosos !== 1 ? 'es' : ''} georreferenciada${exitosos !== 1 ? 's' : ''} desde Excel "${archivoNombre}".`
      );
    }
    if (fallidos > 0) {
      Toast.error(
        `${fallidos} dirección${fallidos !== 1 ? 'es' : ''} con error. Revisalas en el filtro "Error al enviar".`,
        'Error parcial',
        7000
      );
    }
  }

  async function aplicarDirecto() {
    const resultado = ExcelModule.resultado;
    if (!resultado) return;
    const todos = [...resultado.matchCompleto, ...resultado.matchParcial];
    const sel   = todos.filter(m => ExcelModule.selectedCodes.has(m.code));
    if (!sel.length) { Toast.warning('No hay coincidencias seleccionadas para enviar'); return; }
    await enviarMatches(sel, ExcelModule.archivo || 'Excel');
  }

  // ── Modal de preview ──
  function initPreviewModal() {
    const btnCerrar  = document.getElementById('modal-excel-close');
    const btnCancel  = document.getElementById('btn-excel-preview-cancelar');
    const btnEnviar  = document.getElementById('btn-excel-preview-enviar');
    const chkAll     = document.getElementById('excel-chk-all');

    const cerrar = () => {
      document.getElementById('modal-excel-preview')?.classList.remove('active');
    };

    if (btnCerrar)  btnCerrar.addEventListener('click',  cerrar);
    if (btnCancel)  btnCancel.addEventListener('click',  cerrar);
    if (btnEnviar)  btnEnviar.addEventListener('click',  enviarDesdePreview);

    if (chkAll) {
      chkAll.addEventListener('change', (e) => {
        document.querySelectorAll('.excel-row-chk').forEach(chk => {
          chk.checked = e.target.checked;
          const code  = chk.dataset.code;
          if (e.target.checked) ExcelModule.selectedCodes.add(code);
          else                  ExcelModule.selectedCodes.delete(code);
        });
      });
    }
  }

  function abrirPreviewModal() {
    const resultado = ExcelModule.resultado;
    if (!resultado) return;

    const todos  = [
      ...resultado.matchCompleto,
      ...resultado.matchParcial,
      ...resultado.matchDudoso,
    ];
    const tbody  = document.getElementById('excel-preview-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    todos.forEach(m => {
      const checked    = ExcelModule.selectedCodes.has(m.code);
      const badgeClass = m.tipoMatch === 'completo' ? 'status-corregida'
        : m.tipoMatch === 'parcial'  ? 'status-coords-aprox' : 'status-error-envio';
      const badgeLabel = m.tipoMatch === 'completo' ? '&#10003; Completo'
        : m.tipoMatch === 'parcial'  ? '&#9888; Parcial'     : '&#10007; Dudoso';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-check">
          <input type="checkbox" class="excel-row-chk"
                 data-code="${esc(m.code)}" ${checked ? 'checked' : ''} />
        </td>
        <td style="font-family:monospace; font-size:11px;">${esc(m.numero)}</td>
        <td class="td-name-main" style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
            title="${esc(m.nombre)}">${esc(m.nombre)}</td>
        <td style="font-size:11px;">${esc(m.address1)}${m.city ? ', ' + esc(m.city) : ''}</td>
        <td style="font-size:11px;">${m.email_excel ? esc(m.email_excel) : '<span class="text-muted">—</span>'}</td>
        <td style="font-family:monospace; font-size:11px;">${m.lat.toFixed(6)}</td>
        <td style="font-family:monospace; font-size:11px;">${m.lng.toFixed(6)}</td>
        <td><span class="status-badge ${badgeClass}">${badgeLabel}</span></td>
      `;
      tbody.appendChild(tr);
    });

    // Bind checkboxes individuales
    tbody.querySelectorAll('.excel-row-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const code = e.target.dataset.code;
        if (e.target.checked) ExcelModule.selectedCodes.add(code);
        else                  ExcelModule.selectedCodes.delete(code);
        // Actualizar chk-all
        const all  = tbody.querySelectorAll('.excel-row-chk');
        const selN = [...all].filter(c => c.checked).length;
        const chkAll = document.getElementById('excel-chk-all');
        if (chkAll) {
          chkAll.checked       = selN === all.length;
          chkAll.indeterminate = selN > 0 && selN < all.length;
        }
      });
    });

    document.getElementById('modal-excel-preview')?.classList.add('active');
  }

  async function enviarDesdePreview() {
    const resultado = ExcelModule.resultado;
    if (!resultado) return;
    const todos = [
      ...resultado.matchCompleto,
      ...resultado.matchParcial,
      ...resultado.matchDudoso,
    ];
    const sel = todos.filter(m => ExcelModule.selectedCodes.has(m.code));
    if (!sel.length) {
      Toast.warning('Seleccioná al menos una dirección para enviar');
      return;
    }
    document.getElementById('modal-excel-preview')?.classList.remove('active');
    await enviarMatches(sel, ExcelModule.archivo || 'Excel');
  }

})();
