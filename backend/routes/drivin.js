const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { fetchDrivin, getDirecciones, enviarDrivin, getMapboxToken } = require('../controllers/drivinController');

router.post('/fetch', authMiddleware, fetchDrivin);
router.get('/direcciones', authMiddleware, getDirecciones);
router.put('/enviar', authMiddleware, enviarDrivin);
router.get('/mapbox-token', authMiddleware, getMapboxToken);

module.exports = router;
