const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.get('/', async (req, res) => {
    try {
        const debitNotes = await dbService.getAllDebitNotes();
        res.json(debitNotes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const newDebitNote = {
            id: Date.now().toString(),
            employeeId: req.body.employeeId,
            amount: parseFloat(req.body.amount),
            date: req.body.date,
            deductionMonth: req.body.deductionMonth,
            reason: req.body.reason
        };

        const created = await dbService.createDebitNote(newDebitNote);
        res.json(created);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const existing = await dbService.getDebitNoteById(req.params.id);

        if (existing) {
            const updatedDebitNote = {
                employeeId: req.body.employeeId,
                amount: parseFloat(req.body.amount),
                date: req.body.date,
                deductionMonth: req.body.deductionMonth,
                reason: req.body.reason
            };
            const updated = await dbService.updateDebitNote(req.params.id, updatedDebitNote);
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
        await dbService.deleteDebitNote(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
