const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.get('/', async (req, res) => {
    try {
        const advances = await dbService.getAllAdvances();
        const payments = await dbService.getAllPayments();

        const uploadList = [];

        advances.forEach(a => {
            if (a.screenshot) {
                uploadList.push({
                    id: a.id,
                    type: 'advance',
                    employeeId: a.employeeId,
                    date: a.date,
                    amount: a.amount,
                    screenshot: a.screenshot
                });
            }
        });

        payments.forEach(p => {
            if (p.screenshot) {
                uploadList.push({
                    id: p.id,
                    type: 'payment',
                    employeeId: p.employeeId,
                    date: p.date,
                    amount: p.amount,
                    screenshot: p.screenshot
                });
            }
        });

        uploadList.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(uploadList);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        if (type === 'advance') {
            const adv = await dbService.getAdvanceById(id);
            if (adv && adv.screenshot) {
                await dbService.deleteFile(adv.screenshot);
                await dbService.updateAdvance(id, { screenshot: null });
            }
        } else if (type === 'payment') {
            const pay = await dbService.getPaymentById(id);
            if (pay && pay.screenshot) {
                await dbService.deleteFile(pay.screenshot);
                await dbService.updatePayment(id, { screenshot: null });
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
