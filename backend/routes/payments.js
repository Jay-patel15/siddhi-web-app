const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');
const upload = require('../middleware/upload');
const path = require('path');

router.get('/', async (req, res) => {
    try {
        const payments = await dbService.getAllPayments();
        res.json(payments);
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

            screenshotUrl = await dbService.uploadFile(req.file.buffer, fileName, req.file.mimetype);
        }

        const newPayment = {
            id: Date.now().toString(),
            employeeId: req.body.employeeId,
            salaryMonth: req.body.salaryMonth, 
            amount: parseFloat(req.body.amount),
            date: req.body.date,
            mode: req.body.mode,
            notes: req.body.notes,
            screenshot: screenshotUrl
        };

        const created = await dbService.createPayment(newPayment);
        res.json(created);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', upload.single('screenshot'), async (req, res) => {
    try {
        const existing = await dbService.getPaymentById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Payment not found' });

        let screenshotUrl = existing.screenshot;
        if (req.file) {
            if (existing.screenshot) await dbService.deleteFile(existing.screenshot);
            const ext = path.extname(req.file.originalname);
            const name = req.file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const fileName = `${Date.now()}-${name}${ext}`;
            screenshotUrl = await dbService.uploadFile(req.file.buffer, fileName, req.file.mimetype);
        }

        const updatedPayment = {
            amount: parseFloat(req.body.amount),
            date: req.body.date,
            mode: req.body.mode,
            notes: req.body.notes,
            screenshot: screenshotUrl
        };
        const updated = await dbService.updatePayment(req.params.id, updatedPayment);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const pay = await dbService.getPaymentById(req.params.id);
        if (pay && pay.screenshot) {
            await dbService.deleteFile(pay.screenshot);
        }
        await dbService.deletePayment(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
