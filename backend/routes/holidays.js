const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.get('/', async (req, res) => {
    try {
        const holidays = await dbService.getAllHolidays();
        res.json(holidays);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const dates = req.body; // Expecting array of date strings
        await dbService.setHolidays(dates);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
