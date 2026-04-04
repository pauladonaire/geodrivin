/* ============================================================
   geocoder.js — Integración Mapbox Geocoding API
   ============================================================ */

const Geocoder = (() => {
  let debounceTimer = null;

  async function search(query) {
    const token = window.MAPBOX_TOKEN;
    if (!token || !query || query.length < 3) return [];

    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${token}&country=AR&language=es&types=address,place,poi&autocomplete=true&limit=5`;

      const r = await fetch(url);
      if (!r.ok) return [];
      const data = await r.json();
      return (data.features || []).map(f => ({
        id:        f.id,
        label:     f.place_name,
        lat:       f.center[1],
        lng:       f.center[0],
        precision: 'Alta'
      }));
    } catch {
      return [];
    }
  }

  function initAutocomplete({ inputEl, listEl, onSelect }) {
    inputEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const q = inputEl.value.trim();
      if (!q || q.length < 3) {
        listEl.innerHTML = '';
        listEl.classList.remove('visible');
        return;
      }
      debounceTimer = setTimeout(async () => {
        const results = await search(q);
        renderList(results, listEl, inputEl, onSelect);
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
        listEl.classList.remove('visible');
      }
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        listEl.classList.remove('visible');
        inputEl.blur();
      }
    });
  }

  function renderList(results, listEl, inputEl, onSelect) {
    listEl.innerHTML = '';
    if (!results.length) {
      listEl.classList.remove('visible');
      return;
    }
    results.forEach(item => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      div.textContent = item.label;
      div.addEventListener('click', () => {
        inputEl.value = item.label;
        listEl.classList.remove('visible');
        if (onSelect) onSelect(item);
      });
      listEl.appendChild(div);
    });
    listEl.classList.add('visible');
  }

  return { search, initAutocomplete };
})();

window.Geocoder = Geocoder;
