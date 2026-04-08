/* ============================================================
   auth.js — Autenticación (lee usuarios desde Google Sheets)
   ============================================================ */

// Usuarios de respaldo (solo se usan si no hay config.js o USUARIOS_SHEET_ID)
const _USUARIOS_FALLBACK = {
  'admin':      { password: 'pdonarce01',   deposito_id: 'all',           deposito_nombre: 'Todos los depósitos', rol: 'admin' },
  'cndmendoza': { password: 'cdexp2026',    deposito_id: 'cnd_mendoza',   deposito_nombre: 'CND Mendoza',         rol: 'user'  },
  'cndbsas':    { password: 'cdave2026',    deposito_id: 'cnd_bsas',      deposito_nombre: 'CND Buenos Aires',    rol: 'user'  },
  'cndtun':     { password: 'cndvalle2026', deposito_id: 'cnd_tunuyan',   deposito_nombre: 'CND Tunuyán',         rol: 'user'  },
  'cndsanma':   { password: 'cndeste2026',  deposito_id: 'cnd_sanmartin', deposito_nombre: 'CND San Martín',      rol: 'user'  },
  'cndsur':     { password: 'cndsur2026',   deposito_id: 'cnd_surmen',    deposito_nombre: 'CND Sur Mendoza',     rol: 'user'  },
  'cndcba':     { password: 'cndcba2026',   deposito_id: 'cnd_cordoba',   deposito_nombre: 'CND Córdoba',         rol: 'user'  },
  'cndnqn':     { password: 'cndnqn2026',   deposito_id: 'cnd_neuquen',   deposito_nombre: 'CND Neuquén',         rol: 'user'  },
};

let _usuariosCache = null;

async function _cargarUsuarios() {
  if (_usuariosCache) return _usuariosCache;
  const sheetId = (typeof CONFIG !== 'undefined') ? CONFIG.USUARIOS_SHEET_ID : null;
  if (sheetId) {
    try {
      const { rows } = await Sheets.leerSheet(sheetId);
      _usuariosCache = {};
      rows.forEach(r => {
        if (r.username) {
          _usuariosCache[r.username] = {
            password:        r.password        || '',
            deposito_id:     r.deposito_id     || '',
            deposito_nombre: r.deposito_nombre || '',
            rol:             r.rol             || 'user',
          };
        }
      });
    } catch (err) {
      console.error('[Auth] Error cargando usuarios desde Sheets:', err);
      _usuariosCache = _USUARIOS_FALLBACK;
    }
  } else {
    _usuariosCache = _USUARIOS_FALLBACK;
  }
  return _usuariosCache;
}

const Auth = (() => {
  const SESSION_KEY = 'andesmar_session';

  function saveSession(usuario) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getUser();
  }

  async function logout() {
    clearSession();
    window.location.href = 'index.html';
  }

  async function requireAuth() {
    const user = getUser();
    if (!user) {
      window.location.href = 'index.html';
      return null;
    }
    return user;
  }

  return { saveSession, clearSession, getUser, isLoggedIn, logout, requireAuth };
})();

window.Auth = Auth;

// ── Manejo del formulario de login ──
const loginForm = document.getElementById('login-form');
if (loginForm) {
  if (Auth.isLoggedIn()) {
    window.location.href = 'dashboard.html';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn     = document.getElementById('btn-login');
    const errorEl = document.getElementById('login-error');
    const username = document.getElementById('input-username').value.trim();
    const password = document.getElementById('input-password').value;

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    errorEl.classList.remove('visible');

    try {
      const usuarios = await _cargarUsuarios();
      const u = usuarios[username];
      if (u && u.password === password) {
        Auth.saveSession({ id: username, username, ...u });
        window.location.href = 'dashboard.html';
      } else {
        errorEl.textContent = 'Usuario o contraseña incorrectos.';
        errorEl.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Ingresar';
      }
    } catch {
      errorEl.textContent = 'Error de conexión. Intentá de nuevo.';
      errorEl.classList.add('visible');
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });
}
