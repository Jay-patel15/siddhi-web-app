const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.get('/', async (req, res) => {
    try {
        const employees = await dbService.getAllEmployees();
        res.json(employees);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const newEmployee = {
            id: Date.now().toString(),
            name: req.body.name,
            contact: req.body.contact,
            salary: req.body.salary,
            customId: req.body.customId || '', // Match frontend field
            designation: req.body.designation || '',
            password: req.body.password || '123456',
            normalHours: req.body.normalHours || 8.5,
            slabBaseHours: req.body.slabBaseHours || 6,
            employee_type: req.body.employee_type || 'daily_wage', // 'daily_wage' | 'fixed_salary'
            monthly_fare: parseFloat(req.body.monthly_fare) || 0   // Monthly fare for fixed_salary supervisors
        };
        const created = await dbService.createEmployee(newEmployee);
        res.json(created);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const updated = await dbService.updateEmployee(req.params.id, req.body);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await dbService.deleteEmployee(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
