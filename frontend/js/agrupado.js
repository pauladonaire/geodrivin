/* ============================================================
   agrupado.js — Vista agrupada de direcciones pendientes
   ============================================================ */

// ── Módulo de lógica (sin UI) ─────────────────────────────────────
const GrupadoModule = (() => {
  'use strict';

  function normGrupo(str) {
    if (!str) return '';
    return str.toLowerCase().trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ');
  }

  function calcularGrupos(direcciones, modo) {
    const mapa = new Map();

    for (const d of direcciones) {
      if (d.estado === 'corregida') continue;

      let key, display;
      if (modo === 'destinatario') {
        key     = normGrupo(d.name || '');
        display = d.name || '(sin nombre)';
      } else {
        key     = normGrupo(d.address1 || '') + '||' + normGrupo(d.city || '');
        display = [d.address1, d.city].filter(Boolean).join(', ') || '(sin dirección)';
      }

      if (!mapa.has(key)) mapa.set(key, { key, display, items: [] });
      mapa.get(key).items.push(d);
    }

    const grupos  = [];
    const singles = [];

    for (const g of mapa.values()) {
      if (g.items.length >= 2) {
        g.sin_coords   = g.items.filter(d => d.estado === 'sin_coords').length;
        g.coords_aprox = g.items.filter(d => d.estado === 'coords_aprox').length;
        g.error_envio  = g.items.filter(d => d.estado === 'error_envio').length;
        grupos.push(g);
      } else {
        singles.push(...g.items);
      }
    }

    return { grupos, singles };
  }

  function ordenarGrupos(grupos, orden) {
    const copy = [...grupos];
    if (orden === 'menor')     copy.sort((a, b) => a.items.length - b.items.length);
    else if (orden === 'alfa') copy.sort((a, b) => a.display.localeCompare(b.display, 'es'));
    else                       copy.sort((a, b) => b.items.length - a.items.length);
    return copy;
  }

  function filtrarGrupos(grupos, q) {
    if (!q) return grupos;
    const qn = normGrupo(q);
    return grupos.filter(g =>
      normGrupo(g.display).includes(qn) ||
      g.items.some(d =>
        normGrupo(String(d.code   || '')).includes(qn) ||
        normGrupo(d.address1 || '').includes(qn)       ||
        normGrupo(d.city     || '').includes(qn)       ||
        normGrupo(d.name     || '').includes(qn)
      )
    );
  }

  return { normGrupo, calcularGrupos, ordenarGrupos, filtrarGrupos };
})();

window.GrupadoModule = GrupadoModule;


// ── UI ────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // ── State ──
  let _modo           = 'destinatario';
  let _orden          = 'mayor';
  let _grupoActual    = null;
  let _seleccion      = new Set();
  let _coordsActuales = null;
  let _grupalMap      = null;
  let _grupalMarker   = null;

  // ── Helpers ──
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function estadoBadge(estado) {
    const MAP = {
      sin_coords:   ['status-sin-coords',   '● Sin coords'],
      coords_aprox: ['status-coords-aprox', '◎ Coords aprox'],
      corregida:    ['status-corregida',    '✔ Corregida'],
      error_envio:  ['status-error-envio',  '✖ Error envío'],
    };
    const [cls, label] = MAP[estado] || ['status-sin-asignar', '? Sin estado'];
    return `<span class="status-badge ${cls}">${label}</span>`;
  }

  function getAllDirs() {
    return window.Dashboard?.getAllDirecciones?.() || [];
  }

  // ── Gestión de vistas ──
  function switchVista(vistaId) {
    ['view-table', 'view-fijas', 'view-excel', 'view-agrupado'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === vistaId ? '' : 'none';
    });
    const sidebarStats = document.getElementById('sidebar-agrupado-stats');
    if (sidebarStats) sidebarStats.style.display = vistaId === 'view-agrupado' ? '' : 'none';
  }

  // ── Render principal ──
  function render() {
    const dirs = getAllDirs();
    const q    = document.getElementById('agrupado-search')?.value || '';

    const { grupos: todosGrupos, singles } = GrupadoModule.calcularGrupos(dirs, _modo);
    const ordered  = GrupadoModule.ordenarGrupos(todosGrupos, _orden);
    const filtered = GrupadoModule.filtrarGrupos(ordered, q);

    renderStats(dirs, todosGrupos, singles);
    renderCards(filtered);
  }

  function renderStats(dirs, grupos, singles) {
    // Stats barra en la vista principal
    const mainEl = document.getElementById('agrupado-stats');
    if (mainEl) {
      const byDest = GrupadoModule.calcularGrupos(dirs, 'destinatario');
      const byDir  = GrupadoModule.calcularGrupos(dirs, 'direccion');
      const destT  = byDest.grupos.reduce((s, g) => s + g.items.length, 0);
      const dirT   = byDir.grupos.reduce((s,  g) => s + g.items.length, 0);

      mainEl.innerHTML = `
        <div class="agrupado-stat-item">
          <span class="agrupado-stat-label">Por destinatario:</span>
          <span class="agrupado-stat-value">${byDest.grupos.length} grupos</span>
          <span class="agrupado-stat-sub">(${destT} dir.)</span>
        </div>
        <div class="agrupado-stat-item">
          <span class="agrupado-stat-label">Por direcci&oacute;n:</span>
          <span class="agrupado-stat-value">${byDir.grupos.length} grupos</span>
          <span class="agrupado-stat-sub">(${dirT} dir.)</span>
        </div>
        <div class="agrupado-stat-item">
          <span class="agrupado-stat-label">Sin agrupar:</span>
          <span class="agrupado-stat-value">${byDest.singles.length} &uacute;nicos</span>
        </div>
      `;
    }

    // Stats en sidebar
    const sidebarContent = document.getElementById('sidebar-grupos-content');
    if (sidebarContent) {
      const byDest = GrupadoModule.calcularGrupos(dirs, 'destinatario');
      const byDir  = GrupadoModule.calcularGrupos(dirs, 'direccion');
      const destT  = byDest.grupos.reduce((s, g) => s + g.items.length, 0);
      const dirT   = byDir.grupos.reduce((s,  g) => s + g.items.length, 0);
      sidebarContent.innerHTML = `
        <div class="sidebar-grupo-stat">
          <span>Por destinatario</span>
          <span>${byDest.grupos.length} grupos <span style="opacity:.4">(${destT})</span></span>
        </div>
        <div class="sidebar-grupo-stat">
          <span>Por direcci&oacute;n</span>
          <span>${byDir.grupos.length} grupos <span style="opacity:.4">(${dirT})</span></span>
        </div>
        <div class="sidebar-grupo-stat">
          <span>Sin agrupar</span>
          <span>${byDest.singles.length} &uacute;nicos</span>
        </div>
      `;
    }
  }

  function renderCards(grupos) {
    const container = document.getElementById('agrupado-list');
    if (!container) return;

    if (!grupos.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">&#9741;</div>
          <div class="empty-state-title">Sin grupos</div>
          <div class="empty-state-msg">No hay grupos con 2 o m&aacute;s registros. Intent&aacute; cambiar el modo o borrar el filtro.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    grupos.forEach(grupo => {
      const card = document.createElement('div');
      card.className = 'grupo-card';
      card.dataset.grupoKey = grupo.key;

      const badges = [
        grupo.sin_coords   > 0 ? `<span class="status-badge status-sin-coords">${grupo.sin_coords} sin coords</span>`    : '',
        grupo.coords_aprox > 0 ? `<span class="status-badge status-coords-aprox">${grupo.coords_aprox} aprox</span>`     : '',
        grupo.error_envio  > 0 ? `<span class="status-badge status-error-envio">${grupo.error_envio} error</span>`        : '',
      ].join('');

      card.innerHTML = `
        <div class="grupo-card-header">
          <div class="grupo-card-toggle">&#9658;</div>
          <div class="grupo-card-info">
            <div class="grupo-card-name">${esc(grupo.display)}</div>
            <div class="grupo-card-badges">${badges}</div>
          </div>
          <div class="grupo-card-count">${grupo.items.length} pendientes</div>
          <button class="btn btn-primary btn-sm grupo-btn-geo" type="button">Georreferenciar grupo</button>
        </div>
        <div class="grupo-card-body" style="display:none;">
          <table class="grupo-inner-table">
            <thead>
              <tr>
                <th class="col-check"><input type="checkbox" class="grupo-chk-header" checked /></th>
                <th>C&oacute;digo</th>
                <th>Direcci&oacute;n</th>
                <th>Ciudad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${grupo.items.map(d => `
                <tr>
                  <td class="col-check">
                    <input type="checkbox" class="grupo-item-chk" data-code="${esc(d.code)}" checked />
                  </td>
                  <td style="font-family:monospace;font-size:11px;">${esc(d.code)}</td>
                  <td class="grupo-td-addr" title="${esc(d.address1)}">${esc(d.address1 || '—')}</td>
                  <td style="font-size:12px;">${esc(d.city || '—')}</td>
                  <td>${estadoBadge(d.estado)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      container.appendChild(card);
      bindCardEvents(card, grupo);
    });
  }

  function bindCardEvents(card, grupo) {
    const header = card.querySelector('.grupo-card-header');
    const body   = card.querySelector('.grupo-card-body');
    const toggle = card.querySelector('.grupo-card-toggle');
    const hdrChk = card.querySelector('.grupo-chk-header');

    // Toggle expand/collapse
    header.addEventListener('click', (e) => {
      if (e.target.closest('.grupo-btn-geo') || e.target.closest('input')) return;
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : '';
      toggle.innerHTML   = open ? '&#9658;' : '&#9660;';
    });

    // Header checkbox
    if (hdrChk) {
      hdrChk.addEventListener('change', (e) => {
        card.querySelectorAll('.grupo-item-chk').forEach(c => { c.checked = e.target.checked; });
      });
    }

    // Item checkboxes
    card.querySelectorAll('.grupo-item-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const all  = card.querySelectorAll('.grupo-item-chk');
        const selN = [...all].filter(c => c.checked).length;
        if (hdrChk) {
          hdrChk.checked       = selN === all.length;
          hdrChk.indeterminate = selN > 0 && selN < all.length;
        }
      });
    });

    // Georreferenciar button
    const btnGeo = card.querySelector('.grupo-btn-geo');
    if (btnGeo) {
      btnGeo.addEventListener('click', (e) => {
        e.stopPropagation();
        const checked = new Set();
        card.querySelectorAll('.grupo-item-chk:checked').forEach(c => checked.add(c.dataset.code));
        openGrupalModal(grupo, checked);
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  MODAL GEOREFERENCIACIÓN GRUPAL
  // ══════════════════════════════════════════════════════════

  function openGrupalModal(grupo, checkedCodes) {
    _grupoActual    = grupo;
    _seleccion      = checkedCodes && checkedCodes.size > 0
                        ? checkedCodes
                        : new Set(grupo.items.map(d => d.code));
    _coordsActuales = null;

    const titleEl = document.getElementById('modal-geo-grupal-title');
    if (titleEl) titleEl.textContent = `Georreferenciación grupal — ${grupo.display}`;

    // Reset to step 1
    setGrupalStep(1);

    // Fill items list
    renderGrupalItems(grupo);
    updateGrupalCounter();

    // Pre-fill search with first item address
    const firstItem = grupo.items[0];
    const searchEl  = document.getElementById('geo-grupal-search-input');
    if (searchEl && firstItem) {
      searchEl.value = `${firstItem.address1 || ''} ${firstItem.city || ''}`.trim();
    }

    const autoEl = document.getElementById('geo-grupal-autocomplete');
    if (autoEl) { autoEl.innerHTML = ''; autoEl.classList.remove('visible'); }

    resetGrupalCoordDisplay();

    document.getElementById('modal-geo-grupal').classList.add('active');

    // Center map: average of approx coords if available
    const conCoords = grupo.items.filter(d => (d.lat_nueva ?? d.lat) != null);
    const cLat = conCoords.length
      ? conCoords.reduce((s, d) => s + parseFloat(d.lat_nueva ?? d.lat), 0) / conCoords.length
      : null;
    const cLng = conCoords.length
      ? conCoords.reduce((s, d) => s + parseFloat(d.lng_nueva ?? d.lng), 0) / conCoords.length
      : null;

    initGrupalMap(cLat, cLng);

    Geocoder.initAutocomplete({
      inputEl: document.getElementById('geo-grupal-search-input'),
      listEl:  document.getElementById('geo-grupal-autocomplete'),
      onSelect: (item) => setGrupalPin(item.lat, item.lng, 'Alta'),
    });
  }

  function setGrupalStep(step) {
    const stepGeo     = document.getElementById('grupal-step-geo');
    const stepPreview = document.getElementById('grupal-step-preview');
    const btnCancelar    = document.getElementById('btn-grupal-cancelar');
    const btnVerResumen  = document.getElementById('btn-grupal-ver-resumen');
    const btnAtras       = document.getElementById('btn-grupal-atras');
    const btnConfirmar   = document.getElementById('btn-grupal-confirmar');

    if (step === 1) {
      if (stepGeo)     stepGeo.style.display     = '';
      if (stepPreview) stepPreview.style.display  = 'none';
      if (btnCancelar)   btnCancelar.style.display   = '';
      if (btnVerResumen) { btnVerResumen.style.display = ''; btnVerResumen.disabled = !_coordsActuales; }
      if (btnAtras)      btnAtras.style.display     = 'none';
      if (btnConfirmar)  btnConfirmar.style.display  = 'none';
      setTimeout(() => _grupalMap && _grupalMap.invalidateSize(), 120);
    } else {
      if (stepGeo)     stepGeo.style.display     = 'none';
      if (stepPreview) stepPreview.style.display  = '';
      if (btnCancelar)   btnCancelar.style.display   = 'none';
      if (btnVerResumen) btnVerResumen.style.display  = 'none';
      if (btnAtras)      btnAtras.style.display     = '';
      if (btnConfirmar) {
        const n = [..._seleccion].filter(code => _grupoActual?.items.some(d => d.code === code)).length;
        btnConfirmar.style.display  = '';
        btnConfirmar.textContent    = `↑ Confirmar y enviar ${n} a Driv.in`;
        btnConfirmar.disabled       = n === 0;
      }
    }
  }

  function resetGrupalCoordDisplay() {
    const latEl  = document.getElementById('grupal-result-lat');
    const lngEl  = document.getElementById('grupal-result-lng');
    const precEl = document.getElementById('grupal-result-precision');
    if (latEl)  latEl.value       = '';
    if (lngEl)  lngEl.value       = '';
    if (precEl) { precEl.textContent = '—'; precEl.style.color = ''; }
    const btnVerResumen = document.getElementById('btn-grupal-ver-resumen');
    if (btnVerResumen) btnVerResumen.disabled = true;
  }

  // ── Mapa grupal (Leaflet independiente de Mapa.js) ──
  function initGrupalMap(lat, lng) {
    const ARG = [-34.6, -63.6];
    if (_grupalMap) { _grupalMap.remove(); _grupalMap = null; _grupalMarker = null; }

    const useLat = (lat != null) ? lat : ARG[0];
    const useLng = (lng != null) ? lng : ARG[1];

    _grupalMap = L.map('geo-grupal-map', {
      center: [useLat, useLng],
      zoom: (lat != null) ? 14 : 4,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_grupalMap);

    if (lat != null && lng != null) {
      _grupalMarker = L.marker([lat, lng], { draggable: true }).addTo(_grupalMap);
      bindGrupalMarker(_grupalMarker);
      updateGrupalCoordDisplay(lat, lng, 'Aproximada');
      _coordsActuales = { lat, lng };
      const btn = document.getElementById('btn-grupal-ver-resumen');
      if (btn) btn.disabled = false;
    }

    _grupalMap.on('click', (e) => setGrupalPin(e.latlng.lat, e.latlng.lng, 'Manual'));
    setTimeout(() => _grupalMap && _grupalMap.invalidateSize(), 150);
  }

  function bindGrupalMarker(marker) {
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateGrupalCoordDisplay(pos.lat, pos.lng, 'Manual');
      _coordsActuales = { lat: pos.lat, lng: pos.lng };
      const btn = document.getElementById('btn-grupal-ver-resumen');
      if (btn) btn.disabled = false;
    });
  }

  function setGrupalPin(lat, lng, precision) {
    if (!_grupalMap) return;
    if (_grupalMarker) {
      _grupalMarker.setLatLng([lat, lng]);
    } else {
      _grupalMarker = L.marker([lat, lng], { draggable: true }).addTo(_grupalMap);
      bindGrupalMarker(_grupalMarker);
    }
    _grupalMap.setView([lat, lng], 16);
    updateGrupalCoordDisplay(lat, lng, precision);
    _coordsActuales = { lat, lng };
    const btn = document.getElementById('btn-grupal-ver-resumen');
    if (btn) btn.disabled = false;
  }

  function updateGrupalCoordDisplay(lat, lng, precision) {
    const latEl  = document.getElementById('grupal-result-lat');
    const lngEl  = document.getElementById('grupal-result-lng');
    const precEl = document.getElementById('grupal-result-precision');
    if (latEl)  latEl.value       = parseFloat(lat).toFixed(6);
    if (lngEl)  lngEl.value       = parseFloat(lng).toFixed(6);
    if (precEl) {
      precEl.textContent = precision || '—';
      precEl.style.color = precision === 'Alta'   ? '#22C55E' :
                           precision === 'Manual' ? '#EAB308' : '#9CA3AF';
    }
  }

  function destroyGrupalMap() {
    if (_grupalMap) { _grupalMap.remove(); _grupalMap = null; _grupalMarker = null; }
    _coordsActuales = null;
  }

  // ── Lista de items en el modal ──
  function renderGrupalItems(grupo) {
    const tbody = document.getElementById('grupal-items-tbody');
    if (!tbody) return;

    tbody.innerHTML = grupo.items.map(d => {
      const sel      = _seleccion.has(d.code);
      const hasAprox = d.estado === 'coords_aprox';
      return `
        <tr>
          <td class="col-check">
            <input type="checkbox" class="grupal-item-chk" data-code="${esc(d.code)}" ${sel ? 'checked' : ''} />
          </td>
          <td style="font-family:monospace;font-size:11px;">${esc(d.code)}</td>
          <td style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(d.address1)}">${esc(d.address1 || '—')}</td>
          <td style="font-size:12px;">${esc(d.city || '—')}</td>
          <td>${estadoBadge(d.estado)}${hasAprox ? ' <span class="agrupado-aprox-badge">↻ sobreescribe</span>' : ''}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.grupal-item-chk').forEach(chk => {
      chk.addEventListener('change', (e) => {
        if (e.target.checked) _seleccion.add(e.target.dataset.code);
        else                  _seleccion.delete(e.target.dataset.code);
        updateGrupalCounter();
        syncGrupalChkAll();
      });
    });

    const chkAll = document.getElementById('grupal-chk-all');
    if (chkAll) { chkAll.checked = _seleccion.size > 0; chkAll.indeterminate = false; }
  }

  function updateGrupalCounter() {
    const el = document.getElementById('grupal-counter');
    if (!el || !_grupoActual) return;
    const sel   = [..._seleccion].filter(c => _grupoActual.items.some(d => d.code === c)).length;
    const total = _grupoActual.items.length;
    el.textContent = `${sel} seleccionado${sel !== 1 ? 's' : ''} de ${total} totales`;
  }

  function syncGrupalChkAll() {
    const tbody  = document.getElementById('grupal-items-tbody');
    const chkAll = document.getElementById('grupal-chk-all');
    if (!tbody || !chkAll) return;
    const all  = tbody.querySelectorAll('.grupal-item-chk');
    const selN = [...all].filter(c => c.checked).length;
    chkAll.checked       = selN === all.length;
    chkAll.indeterminate = selN > 0 && selN < all.length;
  }

  // ── Paso 2: vista previa ──
  function mostrarResumenGrupal() {
    if (!_coordsActuales || !_grupoActual) return;
    const { lat, lng } = _coordsActuales;

    const tbody = document.getElementById('grupal-preview-tbody');
    if (tbody) {
      tbody.innerHTML = _grupoActual.items.map(d => {
        const incluido  = _seleccion.has(d.code);
        const rowStyle  = incluido ? '' : 'opacity:0.4; text-decoration:line-through;';
        let accion;
        if (!incluido) {
          accion = '<span class="status-badge status-sin-asignar">EXCLUIDA</span>';
        } else if (d.estado === 'coords_aprox') {
          accion = '<span class="status-badge status-coords-aprox">↻ sobreescribe aprox</span>';
        } else {
          accion = '<span class="status-badge status-corregida">→ se actualiza</span>';
        }
        return `
          <tr style="${rowStyle}">
            <td style="font-family:monospace;font-size:11px;">${esc(d.code)}</td>
            <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.address1 || '—')}</td>
            <td style="font-size:12px;">${esc(d.city || '—')}</td>
            <td>${accion}</td>
          </tr>
        `;
      }).join('');
    }

    const n       = [..._seleccion].filter(c => _grupoActual.items.some(d => d.code === c)).length;
    const titleEl = document.getElementById('grupal-preview-title');
    if (titleEl) {
      titleEl.innerHTML = `
        Vas a georreferenciar <strong>${n}</strong> dirección${n !== 1 ? 'es' : ''} con:
        &nbsp; <span style="font-family:monospace;color:var(--cyan);">LAT&nbsp;${parseFloat(lat).toFixed(7)}&nbsp;&nbsp;LNG&nbsp;${parseFloat(lng).toFixed(7)}</span>
      `;
    }

    setGrupalStep(2);
  }

  // ── Envío ──
  async function enviarGrupo() {
    if (!_coordsActuales || !_grupoActual) return;
    const { lat, lng } = _coordsActuales;

    const selItems = _grupoActual.items.filter(d => _seleccion.has(d.code));
    if (!selItems.length) { Toast.warning('Seleccioná al menos un registro'); return; }

    const btnConf = document.getElementById('btn-grupal-confirmar');
    if (btnConf) { btnConf.disabled = true; }

    const BATCH  = 50;
    let exitosos = 0, fallidos = 0;

    for (let i = 0; i < selItems.length; i += BATCH) {
      const batch    = selItems.slice(i, i + BATCH);
      const payloads = batch.map(d => {
        const p   = Drivin.buildPayload(d, lat, lng, 'mapbox');
        p._metodo = 'grupal';
        return p;
      });

      const n = Math.min(i + BATCH, selItems.length);
      if (btnConf) btnConf.textContent = `Enviando ${n}/${selItems.length}…`;

      try {
        const res = await Drivin.enviar(payloads);
        exitosos += res.exitosos;
        fallidos += res.fallidos;
      } catch {
        fallidos += batch.length;
      }
    }

    cerrarGrupalModal();

    if (exitosos > 0) {
      Toast.success(`${exitosos} dirección${exitosos !== 1 ? 'es' : ''} del grupo georreferenciada${exitosos !== 1 ? 's' : ''} correctamente.`);
    }
    if (fallidos > 0) {
      Toast.error(`${fallidos} con error. Revisálas en el filtro "Error al enviar".`, 'Error parcial', 7000);
    }

    if (window.Dashboard?.recargar) await window.Dashboard.recargar();
    render();
  }

  function cerrarGrupalModal() {
    document.getElementById('modal-geo-grupal')?.classList.remove('active');
    destroyGrupalMap();
    _grupoActual    = null;
    _seleccion      = new Set();
    _coordsActuales = null;
    setGrupalStep(1);
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', () => {
    bindSidebar();
    bindControls();
    bindModal();
  });

  function bindSidebar() {
    document.getElementById('btn-show-agrupado')?.addEventListener('click', () => {
      switchVista('view-agrupado');
      render();
    });
    document.getElementById('btn-agrupado-volver')?.addEventListener('click', () => {
      switchVista('view-table');
    });
  }

  function bindControls() {
    document.querySelectorAll('.agrupado-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.agrupado-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _modo = btn.dataset.modo;
        render();
      });
    });

    document.getElementById('agrupado-orden')?.addEventListener('change', (e) => {
      _orden = e.target.value;
      render();
    });

    document.getElementById('agrupado-search')?.addEventListener('input', () => render());
  }

  function bindModal() {
    document.getElementById('modal-geo-grupal-close')?.addEventListener('click', cerrarGrupalModal);
    document.getElementById('btn-grupal-cancelar')?.addEventListener('click', cerrarGrupalModal);
    document.getElementById('btn-grupal-ver-resumen')?.addEventListener('click', mostrarResumenGrupal);
    document.getElementById('btn-grupal-atras')?.addEventListener('click', () => setGrupalStep(1));
    document.getElementById('btn-grupal-confirmar')?.addEventListener('click', enviarGrupo);

    document.getElementById('grupal-chk-all')?.addEventListener('change', (e) => {
      document.querySelectorAll('#grupal-items-tbody .grupal-item-chk').forEach(chk => {
        chk.checked = e.target.checked;
        if (e.target.checked) _seleccion.add(chk.dataset.code);
        else                  _seleccion.delete(chk.dataset.code);
      });
      updateGrupalCounter();
    });

    function onCoordInput() {
      const lat = parseFloat(document.getElementById('grupal-result-lat')?.value);
      const lng = parseFloat(document.getElementById('grupal-result-lng')?.value);
      if (!isNaN(lat) && !isNaN(lng)) setGrupalPin(lat, lng, 'Manual');
    }
    document.getElementById('grupal-result-lat')?.addEventListener('change', onCoordInput);
    document.getElementById('grupal-result-lng')?.addEventListener('change', onCoordInput);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('modal-geo-grupal')?.classList.contains('active')) {
        cerrarGrupalModal();
      }
    });
  }

  // Exponer para que dashboard.js pueda cerrar el mapa si cierra todos los modales
  window.GrupadoUI = { cerrarModal: cerrarGrupalModal };

})();
