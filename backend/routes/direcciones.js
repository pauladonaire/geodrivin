const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { getDepositos_route, getHistorial, getEstadisticas } = require('../controllers/direccionesController');

router.get('/depositos', authMiddleware, getDepositos_route);
router.get('/historial', authMiddleware, getHistorial);
router.get('/estadisticas', authMiddleware, getEstadisticas);

module.exports = router;
