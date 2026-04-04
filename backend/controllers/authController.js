const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/db');
const path = require('path');
const fs = require('fs');

function getDepositos() {
  const filePath = path.join(__dirname, '../config/depositos.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8')).depositos;
}

async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const db = getDB();
    const usuario = db.prepare('SELECT * FROM usuarios WHERE username = ? AND activo = 1').get(username.trim());

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const match = await bcrypt.compare(password, usuario.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const depositos = getDepositos();
    let depositoNombre = 'Todos los depósitos';
    if (usuario.rol !== 'admin') {
      const dep = depositos.find(d => d.id === usuario.deposito_id);
      depositoNombre = dep ? dep.nombre : usuario.deposito_id;
    }

    const payload = {
      id: usuario.id,
      username: usuario.username,
      deposito_id: usuario.deposito_id,
      deposito_nombre: depositoNombre,
      rol: usuario.rol
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });

    return res.json({
      token,
      usuario: payload
    });
  } catch (err) {
    console.error('[Auth] Error en login:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

function verify(req, res) {
  return res.json({ ok: true, usuario: req.user });
}

module.exports = { login, verify };
