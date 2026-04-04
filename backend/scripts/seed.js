require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { getDB } = require('../config/db');

const USUARIOS = [
  { username: 'admin',      password: 'pdonarce01',   deposito_id: 'all',          rol: 'admin' },
  { username: 'cndmendoza', password: 'cdexp2026',    deposito_id: 'cnd_mendoza',  rol: 'user'  },
  { username: 'cndbsas',    password: 'cdave2026',    deposito_id: 'cnd_bsas',     rol: 'user'  },
  { username: 'cndtun',     password: 'cndvalle2026', deposito_id: 'cnd_tunuyan',  rol: 'user'  },
  { username: 'cndsanma',   password: 'cndeste2026',  deposito_id: 'cnd_sanmartin',rol: 'user'  },
  { username: 'cndsur',     password: 'cndsur2026',   deposito_id: 'cnd_surmen',   rol: 'user'  },
  { username: 'cndcba',     password: 'cndcba2026',   deposito_id: 'cnd_cordoba',  rol: 'user'  },
  { username: 'cndnqn',     password: 'cndnqn2026',   deposito_id: 'cnd_neuquen',  rol: 'user'  },
];

async function seed() {
  const db = getDB();

  console.log('\n[Seed] Creando usuarios...\n');

  for (const u of USUARIOS) {
    const hash = await bcrypt.hash(u.password, 10);
    try {
      db.prepare(`
        INSERT OR REPLACE INTO usuarios (username, password_hash, deposito_id, rol)
        VALUES (?, ?, ?, ?)
      `).run(u.username, hash, u.deposito_id, u.rol);
      console.log(`  ✓ ${u.username.padEnd(14)} → ${u.deposito_id} (${u.rol})`);
    } catch (err) {
      console.error(`  ✗ Error creando ${u.username}:`, err.message);
    }
  }

  console.log('\n[Seed] Completado.\n');

  if (require.main === module) {
    console.log('  Usuarios creados:');
    console.log('  ┌──────────────┬─────────────────┬──────────────────────┐');
    console.log('  │ Usuario      │ Contraseña      │ Depósito             │');
    console.log('  ├──────────────┼─────────────────┼──────────────────────┤');
    USUARIOS.forEach(u => {
      console.log(`  │ ${u.username.padEnd(12)} │ ${u.password.padEnd(15)} │ ${u.deposito_id.padEnd(20)} │`);
    });
    console.log('  └──────────────┴─────────────────┴──────────────────────┘');
    process.exit(0);
  }
}

module.exports = { seed };

if (require.main === module) {
  require('./migrate');
  seed();
}
