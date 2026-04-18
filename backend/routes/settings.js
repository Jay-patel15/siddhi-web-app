const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '15012002J^aya';

router.get('/', async (req, res) => {
    try {
        const settings = await dbService.getSettings();
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const updated = await dbService.updateSettings(req.body);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/storage-usage', async (req, res) => {
    try {
        const usage = await dbService.getStorageUsage();
        res.json(usage);
    } catch (e) {
        console.error('Storage Usage Error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/database-usage', async (req, res) => {
    try {
        const usage = await dbService.getDatabaseUsageEstimate();
        res.json(usage);
    } catch (e) {
        console.error('Database Usage Error:', e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/import-data', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload) return res.status(400).json({ error: 'No data payload provided.' });

        const results = await dbService.importData(payload);
        res.json({ success: true, results });
    } catch (e) {
        console.error('Data Import Error:', e);
        res.status(500).json({ error: e.message });
    }
});



module.exports = router;
