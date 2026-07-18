const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.post('/login', async (req, res) => {
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '15012002J^aya';
    
    const { username, password, empName, type } = req.body;
    const loginUser = (username || empName || '').toString().trim();

    // 1. Check Admin Hardcoded
    if (type === 'admin') {
        if (loginUser.toLowerCase() === ADMIN_USERNAME.toLowerCase() && password === ADMIN_PASSWORD) {
            return res.json({ success: true, role: 'admin', name: 'Administrator' });
        }
        return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    // 2. Check Employees DB
    if (type === 'employee' || !type) {
        try {
            const employees = await dbService.getAllEmployees();
            // Match either Name or ID or customId (case insensitive, string comparison) and Password
            const enteredPassword = (password || '').toString().trim();
            const emp = employees.find(e => {
                const nameMatch = e.name && e.name.toLowerCase() === loginUser.toLowerCase();
                const idMatch = String(e.id) === loginUser;
                const customIdMatch = String(e.customId) === loginUser;
                const passwordMatch = (e.password || '').toString().trim() === enteredPassword;
                return (nameMatch || idMatch || customIdMatch) && passwordMatch;
            });

            if (emp) {
                return res.json({ success: true, role: 'employee', name: emp.name, id: emp.id });
            }
        } catch (e) {
            console.error('Login DB Error:', e);
        }
        return res.status(401).json({ error: 'Invalid employee credentials' });
    }

    res.status(400).json({ error: 'Invalid login type' });
});

// FACTORY RESET
router.delete('/factory-reset', async (req, res) => {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '15012002J^aya';
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Incorrect Password' });
    }
    try {
        await dbService.factoryReset();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
