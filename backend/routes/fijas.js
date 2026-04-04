const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { listarFijas, crearFija, actualizarFija, eliminarFija, usarFija } = require('../controllers/fijasController');

router.get('/', authMiddleware, listarFijas);
router.post('/', authMiddleware, crearFija);
router.put('/:id', authMiddleware, actualizarFija);
router.delete('/:id', authMiddleware, eliminarFija);
router.post('/:id/usar', authMiddleware, usarFija);

module.exports = router;
