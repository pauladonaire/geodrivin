/* ============================================================
   mapa.js — Leaflet map management
   ============================================================ */

const Mapa = (() => {
  let geoMap = null;
  let geoMarker = null;
  let viewMap = null;
  let viewMarker = null;
  let onCoordsChange = null;

  // Coordenadas centro Argentina
  const ARGENTINA_CENTER = [-34.6, -63.6];
  const ARGENTINA_ZOOM = 4;

  function initGeoMap(containerId, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Destruir instancia previa si existe
    if (geoMap) {
      geoMap.remove();
      geoMap = null;
      geoMarker = null;
    }

    const lat = opts.lat || ARGENTINA_CENTER[0];
    const lng = opts.lng || ARGENTINA_CENTER[1];
    const zoom = opts.lat ? 15 : ARGENTINA_ZOOM;

    geoMap = L.map(containerId, {
      center: [lat, lng],
      zoom,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(geoMap);

    if (opts.lat && opts.lng) {
      geoMarker = L.marker([opts.lat, opts.lng], { draggable: true }).addTo(geoMap);
      bindMarkerDrag(geoMarker);
    }

    // Clic en el mapa para colocar/mover pin
    geoMap.on('click', (e) => {
      setGeoPin(e.latlng.lat, e.latlng.lng, 'Manual');
    });

    onCoordsChange = opts.onCoordsChange || null;

    // Forzar resize después de que el modal se muestre
    setTimeout(() => geoMap && geoMap.invalidateSize(), 150);
  }

  function bindMarkerDrag(marker) {
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateCoordsDisplay(pos.lat, pos.lng, 'Manual');
      if (onCoordsChange) onCoordsChange(pos.lat, pos.lng, 'Manual');
    });
  }

  function setGeoPin(lat, lng, precision = 'Alta') {
    if (!geoMap) return;
    if (geoMarker) {
      geoMarker.setLatLng([lat, lng]);
    } else {
      geoMarker = L.marker([lat, lng], { draggable: true }).addTo(geoMap);
      bindMarkerDrag(geoMarker);
    }
    geoMap.setView([lat, lng], 16);
    updateCoordsDisplay(lat, lng, precision);
    if (onCoordsChange) onCoordsChange(lat, lng, precision);
  }

  function updateCoordsDisplay(lat, lng, precision) {
    const latEl  = document.getElementById('result-lat');
    const lngEl  = document.getElementById('result-lng');
    const precEl = document.getElementById('result-precision');
    if (latEl)  latEl.textContent  = lat.toFixed(6);
    if (lngEl)  lngEl.textContent  = lng.toFixed(6);
    if (precEl) {
      precEl.textContent = precision || '—';
      precEl.style.color = precision === 'Alta' ? '#22C55E' :
                           precision === 'Manual' ? '#EAB308' : '#9CA3AF';
    }
  }

  function getGeoCoords() {
    if (!geoMarker) return null;
    const pos = geoMarker.getLatLng();
    return { lat: pos.lat, lng: pos.lng };
  }

  function destroyGeoMap() {
    if (geoMap) {
      geoMap.remove();
      geoMap = null;
      geoMarker = null;
    }
  }

  // Mapa de solo lectura (modal ver)
  function initViewMap(containerId, lat, lng, popupText = '') {
    if (viewMap) {
      viewMap.remove();
      viewMap = null;
      viewMarker = null;
    }

    viewMap = L.map(containerId, {
      center: [lat, lng],
      zoom: 15,
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(viewMap);

    viewMarker = L.marker([lat, lng]).addTo(viewMap);
    if (popupText) viewMarker.bindPopup(popupText).openPopup();

    setTimeout(() => viewMap && viewMap.invalidateSize(), 150);
  }

  function destroyViewMap() {
    if (viewMap) {
      viewMap.remove();
      viewMap = null;
    }
  }

  return {
    initGeoMap,
    setGeoPin,
    getGeoCoords,
    destroyGeoMap,
    initViewMap,
    destroyViewMap
  };
})();

window.Mapa = Mapa;
