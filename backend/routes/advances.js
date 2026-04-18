const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');
const upload = require('../middleware/upload');
const path = require('path');

router.get('/', async (req, res) => {
    try {
        const advances = await dbService.getAllAdvances();
        res.json(advances);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', upload.single('screenshot'), async (req, res) => {
    try {
        let screenshotUrl = null;
        if (req.file) {
            const ext = path.extname(req.file.originalname);
            const name = req.file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const fileName = `${Date.now()}-${name}${ext}`;

            // Upload to Supabase
            screenshotUrl = await dbService.uploadFile(req.file.buffer, fileName, req.file.mimetype);
        }

        const newAdvance = {
            id: Date.now().toString(),
            employeeId: req.body.employeeId,
            amount: parseFloat(req.body.amount),
            date: req.body.date,
            deductionMonth: req.body.deductionMonth,
            mode: req.body.mode,
            notes: req.body.notes,
            screenshot: screenshotUrl
        };

        const created = await dbService.createAdvance(newAdvance);
        res.json(created);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', upload.single('screenshot'), async (req, res) => {
    try {
        const existing = await dbService.getAdvanceById(req.params.id);

        if (existing) {
            let screenshotUrl = existing.screenshot;
            if (req.file) {
                if (existing.screenshot) await dbService.deleteFile(existing.screenshot);

                const ext = path.extname(req.file.originalname);
                const name = req.file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
                const fileName = `${Date.now()}-${name}${ext}`;

                screenshotUrl = await dbService.uploadFile(req.file.buffer, fileName, req.file.mimetype);
            }

            const updatedAdvance = {
                employeeId: req.body.employeeId,
                amount: parseFloat(req.body.amount),
                date: req.body.date,
                deductionMonth: req.body.deductionMonth,
                mode: req.body.mode,
                notes: req.body.notes,
                screenshot: screenshotUrl
            };
            const updated = await dbService.updateAdvance(req.params.id, updatedAdvance);
            res.json(updated);
        } else {
            res.status(404).json({ error: 'Record not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const adv = await dbService.getAdvanceById(req.params.id);
        if (adv && adv.screenshot) {
            await dbService.deleteFile(adv.screenshot);
        }

        await dbService.deleteAdvance(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
