const { getDB } = require('../config/db');

function listarFijas(req, res) {
  try {
    const db = getDB();
    const user = req.user;
    let query = 'SELECT * FROM direcciones_fijas WHERE 1=1';
    const params = [];

    if (user.rol !== 'admin') {
      query += ' AND deposito_id = ?';
      params.push(user.deposito_id);
    }

    query += ' ORDER BY veces_usada DESC, nombre_referencia ASC';
    const fijas = db.prepare(query).all(...params);
    return res.json({ fijas });
  } catch (err) {
    console.error('[Fijas] listarFijas:', err);
    return res.status(500).json({ error: 'Error al listar direcciones fijas' });
  }
}

function crearFija(req, res) {
  try {
    const db = getDB();
    const user = req.user;
    const { nombre_referencia, address1, address2, city, state, country, zip_code, lat, lng } = req.body;

    if (!nombre_referencia || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'nombre_referencia, lat y lng son requeridos' });
    }

    const result = db.prepare(`
      INSERT INTO direcciones_fijas
      (nombre_referencia, address1, address2, city, state, country, zip_code, lat, lng, deposito_id, creado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nombre_referencia, address1 || null, address2 || null,
      city || null, state || null, country || 'Argentina',
      zip_code || null, lat, lng,
      user.deposito_id, user.username
    );

    return res.status(201).json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('[Fijas] crearFija:', err);
    return res.status(500).json({ error: 'Error al crear dirección fija' });
  }
}

function actualizarFija(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    const user = req.user;
    const { nombre_referencia, address1, address2, city, state, country, zip_code, lat, lng } = req.body;

    const existing = db.prepare('SELECT * FROM direcciones_fijas WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'No encontrada' });
    if (user.rol !== 'admin' && existing.deposito_id !== user.deposito_id) {
      return res.status(403).json({ error: 'Sin permisos' });
    }

    db.prepare(`
      UPDATE direcciones_fijas SET
        nombre_referencia = ?, address1 = ?, address2 = ?, city = ?,
        state = ?, country = ?, zip_code = ?, lat = ?, lng = ?
      WHERE id = ?
    `).run(
      nombre_referencia || existing.nombre_referencia,
      address1 ?? existing.address1,
      address2 ?? existing.address2,
      city ?? existing.city,
      state ?? existing.state,
      country ?? existing.country,
      zip_code ?? existing.zip_code,
      lat ?? existing.lat,
      lng ?? existing.lng,
      id
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[Fijas] actualizarFija:', err);
    return res.status(500).json({ error: 'Error al actualizar' });
  }
}

function eliminarFija(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    const user = req.user;

    const existing = db.prepare('SELECT * FROM direcciones_fijas WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'No encontrada' });
    if (user.rol !== 'admin' && existing.deposito_id !== user.deposito_id) {
      return res.status(403).json({ error: 'Sin permisos' });
    }

    db.prepare('DELETE FROM direcciones_fijas WHERE id = ?').run(id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[Fijas] eliminarFija:', err);
    return res.status(500).json({ error: 'Error al eliminar' });
  }
}

function usarFija(req, res) {
  try {
    const db = getDB();
    const { id } = req.params;
    db.prepare('UPDATE direcciones_fijas SET veces_usada = veces_usada + 1 WHERE id = ?').run(id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Error' });
  }
}

module.exports = { listarFijas, crearFija, actualizarFija, eliminarFija, usarFija };
