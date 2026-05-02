/* ============================================================
   dashboard.js — Controlador principal del panel
   ============================================================ */

(async function () {
  'use strict';

  // ── Verificar autenticación ──
  const user = await Auth.requireAuth();
  if (!user) return;

  // ── Estado global ──
  const state = {
    allDirecciones: [],   // todas las direcciones cargadas
    filtered: [],         // después de filtros
    page: 1,
    perPage: 50,
    selectedCodes: new Set(),
    depositoActivo: user.rol === 'admin' ? 'all' : user.deposito_id,
    currentGeoDir: null,  // dirección siendo georreferenciada
    currentPrecision: null,
    selectedGeoAddress: null, // { address1, city } del resultado Mapbox elegido
    viewOnlyDir: null,
    depositos: [],
    fijasLoaded: false,
    sort: { field: null, dir: 1 }  // dir: 1 = asc, -1 = desc
  };

  // ── UI helpers ──
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmt(v) { return v !== null && v !== undefined ? String(v) : '—'; }

  // ── Inicializar topbar ──
  document.getElementById('topbar-deposito-name').textContent = user.deposito_nombre || user.deposito_id;
  document.getElementById('topbar-username').textContent = user.username;

  // ── Cerrar sesión ──
  document.getElementById('btn-logout').addEventListener('click', () => Auth.logout());

  // ── Hamburger (mobile) ──
  document.getElementById('btn-hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  });

  // ── Escape key para modales ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    Mapa.destroyGeoMap();
    Mapa.destroyViewMap();
  }

  // ══════════════════════════════════════════════════════════
  //  CARGA DE DATOS
  // ══════════════════════════════════════════════════════════

  async function cargarDirecciones(forzarFetch = false) {
    showTableLoader(true);
    try {
      if (forzarFetch) {
        const toast = Toast.info('Consultando Driv.in...', 'Actualizando');
        await Drivin.fetchFromDrivin();
        Toast.remove(toast);
        Toast.info('Datos actualizados desde Driv.in', 'Actualizado');
      }

      const data = await Drivin.getDirecciones({
        deposito: state.depositoActivo !== 'all' ? state.depositoActivo : undefined
      });

      state.allDirecciones = data.direcciones || [];
      await actualizarMetricas();
      aplicarFiltros();
      await cargarDepositos();
      poblarFiltroClientes();

    } catch (err) {
      console.error(err);
      Toast.error('Error al cargar direcciones: ' + err.message);
      showTableLoader(false);
    }
  }

  async function actualizarMetricas() {
    try {
      const stats = await Drivin.getEstadisticas();
      document.getElementById('metric-total').textContent      = fmt(stats.total_cache);
      document.getElementById('metric-aprox').textContent      = fmt(stats.coords_aprox);
      document.getElementById('metric-sin-coords').textContent = fmt(stats.sin_coords);
      document.getElementById('metric-hoy').textContent        = fmt(stats.corregidas_hoy);
    } catch { /* silencioso */ }
  }

  async function cargarDepositos() {
    try {
      const data = await Drivin.getDepositos();
      state.depositos = data.depositos || [];
      renderSidebarDepositos(state.depositos, data.sin_asignar);
    } catch { /* silencioso */ }
  }

  function poblarFiltroClientes() {
    const sel = document.getElementById('filter-cliente');
    const clientes = [...new Set(
      state.allDirecciones
        .map(d => d.client)
        .filter(Boolean)
    )].sort();

    const current = sel.value;
    sel.innerHTML = '<option value="all">Todos los clientes</option>';
    clientes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (c === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  SIDEBAR DEPÓSITOS
  // ══════════════════════════════════════════════════════════

  function renderSidebarDepositos(depositos, sinAsignar) {
    const container = document.getElementById('depositos-list');
    container.innerHTML = '';

    const todos = [
      ...(user.rol === 'admin' ? [{ id: 'all', nombre: 'Todos los depósitos', color: '#01feff', stats: {} }] : []),
      ...depositos,
      sinAsignar
    ].filter(Boolean);

    todos.forEach(dep => {
      const el = document.createElement('div');
      el.className = `deposito-item${dep.id === state.depositoActivo ? ' active' : ''}`;
      el.innerHTML = `
        <div class="deposito-item-left">
          <div class="deposito-dot" style="background:${dep.color || '#666'};"></div>
          <span class="deposito-name">${esc(dep.nombre)}</span>
        </div>
        <span class="deposito-count">${dep.stats?.total || 0}</span>
      `;
      el.addEventListener('click', () => {
        state.depositoActivo = dep.id;
        state.page = 1;
        document.querySelectorAll('.deposito-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        cargarDirecciones(false);
      });
      container.appendChild(el);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  FILTROS
  // ══════════════════════════════════════════════════════════

  // ── Ordenamiento de columnas ──
  function aplicarSort(arr) {
    const { field, dir } = state.sort;
    if (!field) return arr;
    return [...arr].sort((a, b) => {
      const va = String(a[field] ?? '').toLowerCase();
      const vb = String(b[field] ?? '').toLowerCase();
      if (va < vb) return -dir;
      if (va > vb) return  dir;
      return 0;
    });
  }

  function updateSortHeaders() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
      const f = th.dataset.sort;
      const isActive = state.sort.field === f;
      const arrow = isActive ? (state.sort.dir === 1 ? ' ▲' : ' ▼') : ' ↕';
      // Preservar el texto base sin el indicador anterior
      const base = th.textContent.replace(/ [▲▼↕]$/, '');
      th.textContent = base + arrow;
      th.style.color = isActive ? 'var(--cyan)' : '';
    });
  }

  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.addEventListener('click', () => {
      const f = th.dataset.sort;
      if (state.sort.field === f) {
        state.sort.dir = state.sort.dir === 1 ? -1 : 1;
      } else {
        state.sort.field = f;
        state.sort.dir = 1;
      }
      state.page = 1;
      updateSortHeaders();
      renderTabla();
    });
  });

  function aplicarFiltros() {
    const q       = document.getElementById('filter-search').value.toLowerCase().trim();
    const estado  = document.getElementById('filter-estado').value;
    const cliente = document.getElementById('filter-cliente').value;
    const desde   = document.getElementById('filter-desde').value;
    const hasta   = document.getElementById('filter-hasta').value;
    const soloSel = document.getElementById('chk-solo-sel').checked;

    state.filtered = state.allDirecciones.filter(d => {
      if (q) {
        const hay = [d.code, d.name, d.client, d.address1, d.city]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (estado !== 'all' && d.estado !== estado) return false;
      if (cliente !== 'all' && d.client !== cliente) return false;
      if (desde && d.dispatch_date && d.dispatch_date < desde) return false;
      if (hasta && d.dispatch_date && d.dispatch_date > hasta) return false;
      if (soloSel && !state.selectedCodes.has(d.code)) return false;
      return true;
    });

    state.page = 1;
    renderTabla();
  }

  ['filter-search','filter-estado','filter-cliente','chk-solo-sel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', aplicarFiltros);
    if (el) el.addEventListener('change', aplicarFiltros);
  });

  ['filter-desde','filter-hasta'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', aplicarFiltros);
  });

  document.getElementById('btn-clear-dates').addEventListener('click', () => {
    document.getElementById('filter-desde').value = '';
    document.getElementById('filter-hasta').value = '';
    aplicarFiltros();
  });

  // ══════════════════════════════════════════════════════════
  //  TABLA
  // ══════════════════════════════════════════════════════════

  function showTableLoader(show) {
    document.getElementById('table-loader').style.display = show ? 'flex' : 'none';
    document.getElementById('main-table').style.display   = show ? 'none' : '';
    document.getElementById('table-empty').style.display  = 'none';
  }

  function estadoBadge(estado) {
    const map = {
      'sin_coords':  ['status-sin-coords',  '● Sin coords'],
      'coords_aprox':['status-coords-aprox','◎ Coords aprox'],
      'corregida':   ['status-corregida',   '✔ Corregida'],
      'error_envio': ['status-error-envio', '✖ Error envío'],
    };
    const [cls, label] = map[estado] || ['status-sin-asignar', '? Sin estado'];
    return `<span class="status-badge ${cls}">${label}</span>`;
  }

  function botonesAccion(d) {
    if (d.estado === 'corregida') {
      return `<button class="btn btn-ghost btn-sm" onclick="Dashboard.openViewModal('${esc(d.code)}')">Ver</button>`;
    }
    if (d.estado === 'coords_aprox') {
      return `
        <button class="btn btn-ghost btn-sm" onclick="Dashboard.openViewModal('${esc(d.code)}')">Ver mapa</button>
        <button class="btn btn-primary btn-sm" onclick="Dashboard.openGeoModal('${esc(d.code)}')">Corregir</button>
      `;
    }
    return `<button class="btn btn-primary btn-sm" onclick="Dashboard.openGeoModal('${esc(d.code)}')">Georreferenciar</button>`;
  }

  function renderTabla() {
    const tbody   = document.getElementById('table-body');
    const empty   = document.getElementById('table-empty');
    const countEl = document.getElementById('table-count-info');

    if (!state.filtered.length) {
      document.getElementById('main-table').style.display = 'none';
      document.getElementById('table-loader').style.display = 'none';
      empty.style.display = 'flex';
      countEl.textContent = '0 resultados';
      renderPaginacion(0);
      return;
    }

    document.getElementById('main-table').style.display = '';
    document.getElementById('table-loader').style.display = 'none';
    empty.style.display = 'none';

    const total  = state.filtered.length;
    const start  = (state.page - 1) * state.perPage;
    const sorted = aplicarSort(state.filtered);
    const slice  = sorted.slice(start, start + state.perPage);

    countEl.textContent = `${total} resultado${total !== 1 ? 's' : ''} · página ${state.page} de ${Math.ceil(total / state.perPage)}`;

    tbody.innerHTML = slice.map(d => {
      const lat = d.lat_nueva ?? d.lat;
      const lng = d.lng_nueva ?? d.lng;
      const coords = (lat && lng)
        ? `<span style="font-family:monospace;font-size:11px;">${parseFloat(lat).toFixed(4)}<br>${parseFloat(lng).toFixed(4)}</span>`
        : '<span class="text-muted">—</span>';

      return `
        <tr class="${state.selectedCodes.has(d.code) ? 'selected' : ''}" data-code="${esc(d.code)}">
          <td class="col-check">
            <input type="checkbox" ${state.selectedCodes.has(d.code) ? 'checked' : ''}
                   onchange="Dashboard.toggleSelect('${esc(d.code)}', this.checked)" />
          </td>
          <td class="td-code" data-label="Código">${esc(d.code)}</td>
          <td class="td-name" data-label="Nombre">
            <div class="td-name-main">${esc(d.name || '—')}</div>
            <div class="td-name-client">${esc(d.client || '')}</div>
          </td>
          <td class="td-address" data-label="Dirección">
            <div class="td-address-text" title="${esc(d.address1)}">${esc(d.address1 || '—')}</div>
          </td>
          <td data-label="Ciudad">${esc(d.city || '—')}</td>
          <td data-label="CP" style="font-size:11px;">${esc(d.zip_code || '—')}</td>
          <td class="td-coords" data-label="Lat/Lng">${coords}</td>
          <td class="td-date" data-label="Dispatch">${esc(d.dispatch_date || '—')}</td>
          <td data-label="Estado">${estadoBadge(d.estado)}</td>
          <td class="td-actions" data-label="Acciones">${botonesAccion(d)}</td>
        </tr>
      `;
    }).join('');

    renderPaginacion(total);
    actualizarCheckAll();
  }

  function renderPaginacion(total) {
    const pagEl = document.getElementById('pagination');
    if (!total) { pagEl.innerHTML = ''; return; }

    const pages = Math.ceil(total / state.perPage);
    if (pages <= 1) { pagEl.innerHTML = ''; return; }

    let html = `<button onclick="Dashboard.goPage(${state.page - 1})" ${state.page === 1 ? 'disabled' : ''}>&#8592;</button>`;

    // Mostrar máximo 7 botones
    let start = Math.max(1, state.page - 3);
    let end   = Math.min(pages, start + 6);
    start = Math.max(1, end - 6);

    if (start > 1) html += `<button onclick="Dashboard.goPage(1)">1</button><span style="color:rgba(255,255,255,0.3)">…</span>`;
    for (let i = start; i <= end; i++) {
      html += `<button onclick="Dashboard.goPage(${i})" class="${i === state.page ? 'active' : ''}">${i}</button>`;
    }
    if (end < pages) html += `<span style="color:rgba(255,255,255,0.3)">…</span><button onclick="Dashboard.goPage(${pages})">${pages}</button>`;

    html += `<button onclick="Dashboard.goPage(${state.page + 1})" ${state.page === pages ? 'disabled' : ''}>&#8594;</button>`;
    html += `<span class="pagination-info">${total} registros</span>`;
    pagEl.innerHTML = html;
  }

  function goPage(p) {
    const pages = Math.ceil(state.filtered.length / state.perPage);
    if (p < 1 || p > pages) return;
    state.page = p;
    renderTabla();
    document.getElementById('table-scroll').scrollTop = 0;
  }

  // ── Selección de filas ──
  function toggleSelect(code, checked) {
    if (checked) state.selectedCodes.add(code);
    else state.selectedCodes.delete(code);
    actualizarCheckAll();
    const row = document.querySelector(`tr[data-code="${code}"]`);
    if (row) row.classList.toggle('selected', checked);
  }

  function actualizarCheckAll() {
    const chkAll = document.getElementById('chk-all');
    if (!chkAll) return;
    const pageItems = state.filtered.slice((state.page - 1) * state.perPage, state.page * state.perPage);
    const allSelected = pageItems.length > 0 && pageItems.every(d => state.selectedCodes.has(d.code));
    chkAll.checked = allSelected;
    chkAll.indeterminate = !allSelected && pageItems.some(d => state.selectedCodes.has(d.code));
  }

  document.getElementById('chk-all').addEventListener('change', (e) => {
    const pageItems = state.filtered.slice((state.page - 1) * state.perPage, state.page * state.perPage);
    pageItems.forEach(d => {
      if (e.target.checked) state.selectedCodes.add(d.code);
      else state.selectedCodes.delete(d.code);
    });
    renderTabla();
  });

  // ══════════════════════════════════════════════════════════
  //  MODAL GEOREFERENCIACIÓN
  // ══════════════════════════════════════════════════════════

  function openGeoModal(code) {
    const dir = state.allDirecciones.find(d => d.code === code);
    if (!dir) return;
    state.currentGeoDir = dir;
    state.currentPrecision = null;
    state.selectedGeoAddress = null;

    // Llenar datos originales
    document.getElementById('geo-code').textContent     = dir.code || '—';
    document.getElementById('geo-name').textContent     = dir.name || '—';
    document.getElementById('geo-client').textContent   = dir.client || '—';
    document.getElementById('geo-address1').textContent = dir.address1 || '—';
    document.getElementById('geo-city').textContent     = dir.city || '—';
    document.getElementById('geo-state').textContent    = dir.state || '—';
    document.getElementById('geo-zip').textContent      = dir.zip_code || '—';
    document.getElementById('geo-obs-preview').textContent = `Dir. original: ${dir.address1 || ''}, ${dir.city || ''}`;

    const coordsEl = document.getElementById('geo-coords-original');
    if (dir.lat && dir.lng) {
      coordsEl.textContent = `${dir.lat}, ${dir.lng}`;
      coordsEl.className = 'geo-field-value coords-aprox';
    } else {
      coordsEl.textContent = 'Sin coordenadas';
      coordsEl.className = 'geo-field-value sin-coords';
    }

    // Mejor coord disponible (corregida > aproximada)
    const initLat = dir.lat_nueva ?? dir.lat ?? null;
    const initLng = dir.lng_nueva ?? dir.lng ?? null;

    // Reset búsqueda y resultados
    document.getElementById('geo-search-input').value = `${dir.address1 || ''} ${dir.city || ''}`.trim();
    document.getElementById('geo-autocomplete').innerHTML = '';
    document.getElementById('geo-autocomplete').classList.remove('visible');
    document.getElementById('result-precision').textContent = '—';
    document.getElementById('result-precision').style.color = '';

    const btnEnviar = document.getElementById('btn-geo-enviar');
    btnEnviar.disabled = true;

    // Pre-llenar inputs con la mejor coord disponible
    if (initLat !== null && initLng !== null) {
      document.getElementById('result-lat').value = parseFloat(initLat).toFixed(6);
      document.getElementById('result-lng').value = parseFloat(initLng).toFixed(6);
      document.getElementById('result-precision').textContent = 'Aproximada';
      document.getElementById('result-precision').style.color = '#F59E0B';
    } else {
      document.getElementById('result-lat').value = '';
      document.getElementById('result-lng').value = '';
    }

    document.getElementById('modal-geo').classList.add('active');
    document.getElementById('modal-geo-title').textContent = `Georeferenciación — ${dir.code}`;

    // Inicializar mapa con la mejor coord disponible
    const opts = {
      lat: initLat,
      lng: initLng,
      onCoordsChange: (lat, lng, precision) => {
        state.currentPrecision = precision;
        btnEnviar.disabled = false;
      }
    };
    Mapa.initGeoMap('geo-map', opts);

    // Inicializar geocoder autocomplete
    Geocoder.initAutocomplete({
      inputEl: document.getElementById('geo-search-input'),
      listEl:  document.getElementById('geo-autocomplete'),
      onSelect: (item) => {
        state.currentPrecision = 'Alta';
        state.selectedGeoAddress = { address1: item.address1, city: item.city };
        Mapa.setGeoPin(item.lat, item.lng, 'Alta');
        btnEnviar.disabled = false;
      }
    });
  }

  // Edición directa de lat/lng — mueve el pin igual que el desplegable
  function onCoordInputChange() {
    const latVal = parseFloat(document.getElementById('result-lat').value);
    const lngVal = parseFloat(document.getElementById('result-lng').value);
    if (!isNaN(latVal) && !isNaN(lngVal)) {
      Mapa.setGeoPin(latVal, lngVal, 'Manual');
    }
  }
  document.getElementById('result-lat').addEventListener('change', onCoordInputChange);
  document.getElementById('result-lng').addEventListener('change', onCoordInputChange);

  document.getElementById('modal-geo-close').addEventListener('click', () => {
    document.getElementById('modal-geo').classList.remove('active');
    Mapa.destroyGeoMap();
  });

  document.getElementById('btn-geo-cancelar').addEventListener('click', () => {
    document.getElementById('modal-geo').classList.remove('active');
    Mapa.destroyGeoMap();
  });

  // Enviar desde modal geo
  document.getElementById('btn-geo-enviar').addEventListener('click', async () => {
    const coords = Mapa.getGeoCoords();
    if (!coords) { Toast.warning('Seleccioná una ubicación en el mapa'); return; }

    const btn = document.getElementById('btn-geo-enviar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      const payload = Drivin.buildPayload(state.currentGeoDir, coords.lat, coords.lng, state.currentPrecision, state.selectedGeoAddress);
      const result = await Drivin.enviar([payload]);

      if (result.exitosos > 0) {
        Toast.success('Dirección enviada correctamente a Driv.in');
        document.getElementById('modal-geo').classList.remove('active');
        Mapa.destroyGeoMap();
        await cargarDirecciones(false);
      } else {
        const err = result.resultados?.[0]?.error || 'Error desconocido';
        Toast.error(`No se pudo enviar a Driv.in: ${err}. Revisá esta dirección y hacelo manualmente desde el sistema.`);
      }
    } catch (err) {
      Toast.error('Error al conectar con el servidor: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '↑ Enviar a Driv.in';
    }
  });

  // Guardar como fija desde modal geo
  document.getElementById('btn-geo-guardar-fija').addEventListener('click', () => {
    const coords = Mapa.getGeoCoords();
    if (!coords) { Toast.warning('Primero seleccioná una ubicación en el mapa'); return; }
    const dir = state.currentGeoDir;
    if (!dir) return;

    abrirModalNuevaFija({
      nombre:   dir.name || dir.client || dir.code || '',
      address1: dir.address1 || '',
      city:     dir.city || '',
      zip:      dir.zip_code || '',
      lat:      coords.lat,
      lng:      coords.lng
    });
  });

  // ══════════════════════════════════════════════════════════
  //  MODAL VER MAPA (coords aprox)
  // ══════════════════════════════════════════════════════════

  function openViewModal(code) {
    const dir = state.allDirecciones.find(d => d.code === code);
    if (!dir) return;
    state.viewOnlyDir = dir;

    const lat = dir.lat_nueva ?? dir.lat;
    const lng = dir.lng_nueva ?? dir.lng;
    if (!lat || !lng) { openGeoModal(code); return; }

    document.getElementById('modal-mapa-title').textContent = `Ubicación: ${dir.code}`;
    document.getElementById('modal-mapa').classList.add('active');
    Mapa.initViewMap('view-only-map', lat, lng,
      `<b>${dir.name || dir.code}</b><br>${dir.address1 || ''}<br>${dir.city || ''}`);
  }

  document.getElementById('modal-mapa-close').addEventListener('click', () => {
    document.getElementById('modal-mapa').classList.remove('active');
    Mapa.destroyViewMap();
  });
  document.getElementById('btn-mapa-cerrar').addEventListener('click', () => {
    document.getElementById('modal-mapa').classList.remove('active');
    Mapa.destroyViewMap();
  });
  document.getElementById('btn-mapa-corregir').addEventListener('click', () => {
    document.getElementById('modal-mapa').classList.remove('active');
    Mapa.destroyViewMap();
    if (state.viewOnlyDir) openGeoModal(state.viewOnlyDir.code);
  });

  // ══════════════════════════════════════════════════════════
  //  ENVÍO MASIVO
  // ══════════════════════════════════════════════════════════

  document.getElementById('btn-send-sel').addEventListener('click', async () => {
    if (!state.selectedCodes.size) {
      Toast.warning('Seleccioná al menos una dirección');
      return;
    }
    const toSend = state.allDirecciones.filter(d =>
      state.selectedCodes.has(d.code) && d.estado !== 'corregida'
    );
    if (!toSend.length) {
      Toast.warning('Las direcciones seleccionadas ya están corregidas o no tienen coordenadas');
      return;
    }

    // Solo las que tienen coords
    const conCoords = toSend.filter(d => {
      const lat = d.lat_nueva ?? d.lat;
      const lng = d.lng_nueva ?? d.lng;
      return lat && lng;
    });

    if (!conCoords.length) {
      Toast.warning('Ninguna dirección seleccionada tiene coordenadas. Georeferencialas primero.');
      return;
    }

    const btn = document.getElementById('btn-send-sel');
    btn.disabled = true;
    const warnToast = Toast.warning(`Enviando ${conCoords.length} direcciones...`, 'Procesando', 0);

    try {
      const payloads = conCoords.map(d => {
        const lat = d.lat_nueva ?? d.lat;
        const lng = d.lng_nueva ?? d.lng;
        return Drivin.buildPayload(d, lat, lng, 'mapbox');
      });

      const result = await Drivin.enviar(payloads);
      Toast.remove(warnToast);

      if (result.exitosos > 0) {
        Toast.success(`${result.exitosos} dirección${result.exitosos !== 1 ? 'es' : ''} enviada${result.exitosos !== 1 ? 's' : ''} correctamente`);
        state.selectedCodes.clear();
        await cargarDirecciones(false);
      }
      if (result.fallidos > 0) {
        Toast.error(`${result.fallidos} dirección${result.fallidos !== 1 ? 'es' : ''} fallida${result.fallidos !== 1 ? 's' : ''}. Revisalas en el filtro "Error al enviar".`, 'Error parcial', 7000);
      }
    } catch (err) {
      Toast.remove(warnToast);
      Toast.error('Error al enviar: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ══════════════════════════════════════════════════════════
  //  EXPORTAR
  // ══════════════════════════════════════════════════════════

  document.getElementById('btn-export-sel').addEventListener('click', () => {
    const toExport = state.selectedCodes.size > 0
      ? state.allDirecciones.filter(d => state.selectedCodes.has(d.code))
      : state.filtered;

    if (!toExport.length) { Toast.warning('No hay datos para exportar'); return; }

    const headers = ['code','name','client','address1','city','state','zip_code','lat','lng','dispatch_date','estado'];
    const csv = [
      headers.join(','),
      ...toExport.map(d => headers.map(h => {
        const v = d[h] ?? '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `andesmar_direcciones_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.success(`${toExport.length} registros exportados`);
  });

  // ══════════════════════════════════════════════════════════
  //  DIRECCIONES FIJAS
  // ══════════════════════════════════════════════════════════

  // ── Campo depósito en modal fija ──
  function configurarCampoDeposito(depositoIdActual = null) {
    const container = document.getElementById('fija-deposito-container');
    if (!container) return;

    if (user.rol === 'admin') {
      // Admin: select con todos los depósitos
      const deps = [
        { id: '', nombre: '— Sin depósito (compartida) —' },
        ...state.depositos
      ];
      const select = document.createElement('select');
      select.className = 'form-select';
      select.id = 'fija-deposito-select';
      deps.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.nombre;
        if (d.id === (depositoIdActual || '')) opt.selected = true;
        select.appendChild(opt);
      });
      container.innerHTML = '';
      container.appendChild(select);
    } else {
      // No-admin: solo lectura con su depósito
      container.innerHTML = `
        <div class="form-input" style="background:rgba(255,255,255,0.04); cursor:default; color:rgba(255,255,255,0.5);">
          ${esc(user.deposito_nombre || user.deposito_id)}
        </div>
      `;
    }
  }

  function getDepositoIdDelModal() {
    if (user.rol === 'admin') {
      return document.getElementById('fija-deposito-select')?.value || null;
    }
    return user.deposito_id || null;
  }

  function abrirModalNuevaFija(preData = {}) {
    const modal = document.getElementById('modal-nueva-fija');
    delete modal.dataset.editId;
    modal.querySelector('.modal-title').textContent = 'Nueva dirección fija';
    document.getElementById('fija-nombre').value   = preData.nombre   || '';
    document.getElementById('fija-address1').value = preData.address1 || '';
    document.getElementById('fija-city').value     = preData.city     || '';
    document.getElementById('fija-zip').value      = preData.zip      || '';
    document.getElementById('fija-lat').value      = preData.lat      ?? '';
    document.getElementById('fija-lng').value      = preData.lng      ?? '';
    configurarCampoDeposito(null);
    modal.classList.add('active');
  }

  async function mostrarVista(vista) {
    document.getElementById('view-table').style.display = vista === 'table' ? '' : 'none';
    document.getElementById('view-fijas').style.display = vista === 'fijas' ? '' : 'none';
    if (vista === 'fijas' && !state.fijasLoaded) {
      await DireccionesFijas.cargar();
      DireccionesFijas.renderTabla();
      state.fijasLoaded = true;
    }
  }

  document.getElementById('btn-show-fijas').addEventListener('click', () => mostrarVista('fijas'));
  document.getElementById('btn-back-to-table').addEventListener('click', () => mostrarVista('table'));
  document.getElementById('btn-nueva-fija').addEventListener('click', () => abrirModalNuevaFija());

  // Modal nueva/editar fija
  document.getElementById('modal-nueva-fija').addEventListener('fija-edit-open', (e) => {
    configurarCampoDeposito(e.detail.depositoId);
  });

  document.getElementById('modal-nueva-fija-close').addEventListener('click', () => {
    document.getElementById('modal-nueva-fija').classList.remove('active');
  });
  document.getElementById('btn-fija-cancelar').addEventListener('click', () => {
    document.getElementById('modal-nueva-fija').classList.remove('active');
  });

  document.getElementById('btn-fija-guardar').addEventListener('click', async () => {
    const nombre = document.getElementById('fija-nombre').value.trim();
    const lat    = parseFloat(document.getElementById('fija-lat').value);
    const lng    = parseFloat(document.getElementById('fija-lng').value);

    if (!nombre) { Toast.warning('El nombre de referencia es requerido'); return; }
    if (isNaN(lat) || isNaN(lng)) { Toast.warning('Latitud y longitud son requeridas'); return; }

    const datos = {
      nombre_referencia: nombre,
      address1:    document.getElementById('fija-address1').value.trim() || null,
      city:        document.getElementById('fija-city').value.trim() || null,
      zip_code:    document.getElementById('fija-zip').value.trim() || null,
      deposito_id: getDepositoIdDelModal(),
      lat, lng
    };

    const modal = document.getElementById('modal-nueva-fija');
    const editId = modal.dataset.editId;

    try {
      if (editId) {
        await DireccionesFijas.actualizar(parseInt(editId), datos);
        Toast.success('Dirección fija actualizada');
      } else {
        await DireccionesFijas.crear(datos);
        Toast.success('Dirección fija guardada');
      }
      modal.classList.remove('active');
      DireccionesFijas.renderTabla();
      state.fijasLoaded = false;
    } catch (err) {
      Toast.error('Error al guardar: ' + err.message);
    }
  });

  // Botón en header de filtros
  document.getElementById('btn-guardar-fija-header').addEventListener('click', () => abrirModalNuevaFija());

  // ── Aplicar fija a selección ──
  document.getElementById('btn-aplicar-fija-sel').addEventListener('click', async () => {
    if (!state.selectedCodes.size) {
      Toast.warning('Seleccioná al menos una dirección');
      return;
    }
    await DireccionesFijas.cargar();
    DireccionesFijas.renderSelectorList('fijas-selector-list', () => {
      document.getElementById('btn-aplicar-fija-confirmar').disabled = false;
    });
    document.getElementById('modal-aplicar-fija').classList.add('active');
  });

  function cerrarModalAplicarFija() {
    document.getElementById('modal-aplicar-fija').classList.remove('active');
    const s = document.getElementById('fijas-selector-search');
    if (s) s.value = '';
  }

  document.getElementById('modal-aplicar-fija-close').addEventListener('click', cerrarModalAplicarFija);
  document.getElementById('btn-aplicar-fija-cancelar').addEventListener('click', cerrarModalAplicarFija);

  document.getElementById('btn-aplicar-fija-confirmar').addEventListener('click', async () => {
    const fija = DireccionesFijas.getSelected();
    if (!fija) { Toast.warning('Seleccioná una dirección fija'); return; }

    const toSend = state.allDirecciones.filter(d =>
      state.selectedCodes.has(d.code) && d.estado !== 'corregida'
    );

    if (!toSend.length) {
      Toast.warning('No hay direcciones pendientes en la selección');
      return;
    }

    const btn = document.getElementById('btn-aplicar-fija-confirmar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      await DireccionesFijas.registrarUso(fija.id);

      const newAddress = (fija.address1 || fija.city)
        ? { address1: fija.address1, city: fija.city }
        : null;

      const payloads = toSend.map(d => {
        const p = Drivin.buildPayload(d, fija.lat, fija.lng, 'mapbox', newAddress);
        p._tipo = 'fija';
        return p;
      });

      const result = await Drivin.enviar(payloads);
      cerrarModalAplicarFija();

      if (result.exitosos > 0) {
        Toast.success(`${result.exitosos} dirección${result.exitosos !== 1 ? 'es enviadas' : ' enviada'} con la dirección fija "${fija.nombre_referencia}"`);
        state.selectedCodes.clear();
        await cargarDirecciones(false);
      }
      if (result.fallidos > 0) {
        Toast.error(`${result.fallidos} fallida${result.fallidos !== 1 ? 's' : ''}. Revisalas en "Error al enviar".`);
      }
    } catch (err) {
      Toast.error('Error: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar a Driv.in';
    }
  });

  // ══════════════════════════════════════════════════════════
  //  TOP 10 FRECUENTES
  // ══════════════════════════════════════════════════════════

  function getTop10Frecuentes() {
    const counts = {};
    for (const d of state.allDirecciones) {
      if (!d.address1) continue;
      const key = normalizar(d.address1) + '|' + normalizar(d.city || '');
      if (!counts[key]) {
        // Buscar si alguna de las coincidencias tiene coords
        counts[key] = { address1: d.address1, city: d.city || '', count: 0, lat: null, lng: null };
      }
      counts[key].count++;
      if (!counts[key].lat && (d.lat_nueva ?? d.lat)) {
        counts[key].lat = d.lat_nueva ?? d.lat;
        counts[key].lng = d.lng_nueva ?? d.lng;
      }
    }
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  function renderTop10Modal() {
    const items = getTop10Frecuentes();
    const tbody = document.getElementById('top10-tbody');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;padding:20px;">Sin datos. Cargá las direcciones primero.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    items.forEach((item, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align:center; font-weight:600; color:var(--cyan);">${i + 1}</td>
        <td>${esc(item.address1)}</td>
        <td>${esc(item.city)}</td>
        <td style="text-align:center; font-weight:600;">${item.count}</td>
        <td style="text-align:center;"></td>
      `;
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-sm';
      btn.textContent = '★ Guardar fija';
      btn.addEventListener('click', () => guardarFijaDesdeTop10(item));
      tr.querySelector('td:last-child').appendChild(btn);
      tbody.appendChild(tr);
    });
  }

  function guardarFijaDesdeTop10(item) {
    document.getElementById('modal-top10').classList.remove('active');
    abrirModalNuevaFija({
      nombre:   item.address1 + (item.city ? ', ' + item.city : ''),
      address1: item.address1,
      city:     item.city,
      lat:      item.lat ?? '',
      lng:      item.lng ?? ''
    });
  }

  document.getElementById('btn-show-top10').addEventListener('click', () => {
    renderTop10Modal();
    document.getElementById('modal-top10').classList.add('active');
  });

  document.getElementById('modal-top10-close').addEventListener('click', () => {
    document.getElementById('modal-top10').classList.remove('active');
  });

  // ══════════════════════════════════════════════════════════
  //  ACTUALIZAR DESDE DRIV.IN
  // ══════════════════════════════════════════════════════════

  document.getElementById('btn-refresh-drivin').addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-drivin');
    btn.disabled = true;
    btn.textContent = 'Actualizando...';
    await cargarDirecciones(true);
    btn.disabled = false;
    btn.textContent = '⟳ Actualizar';
  });

  // ══════════════════════════════════════════════════════════
  //  EXPORTAR API PÚBLICA
  // ══════════════════════════════════════════════════════════

  window.Dashboard = {
    openGeoModal,
    openViewModal,
    toggleSelect,
    goPage
  };

  // ══════════════════════════════════════════════════════════
  //  INICIALIZAR
  // ══════════════════════════════════════════════════════════

  updateSortHeaders();
  await cargarDirecciones(false);

})();
