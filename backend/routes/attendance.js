const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.get('/', async (req, res) => {
    try {
        const attendance = await dbService.getAllAttendance();
        res.json(attendance);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { employeeId, date } = req.body;

        // Block duplicates safely
        if (employeeId && date) {
            const isDuplicate = await dbService.checkDuplicateAttendance(employeeId, date);
            if (isDuplicate) {
                return res.status(400).json({ error: 'Duplicate Error: Attendance already marked for this employee on this date.' });
            }
        }

        const att = {
            id: Date.now().toString(),
            date: req.body.date,
            employeeId: req.body.employeeId,
            employeeName: req.body.employeeName,
            timeIn: req.body.timeIn,
            timeOut: req.body.timeOut,
            workedHours: req.body.workedHours,
            slabMode: req.body.slabMode || false,
            sundayMode: req.body.sundayMode || false,
            fare: req.body.fare || 0,
            checkInImage: req.body.checkInImage || null,
            checkInLoc: req.body.checkInLoc || null,
            checkOutImage: req.body.checkOutImage || null,
            checkOutLoc: req.body.checkOutLoc || null,
            securityFlag: req.body.securityFlag || null
        };
        const created = await dbService.createAttendance(att);
        res.json(created);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const updated = await dbService.updateAttendance(req.params.id, req.body);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const att = await dbService.getAttendanceById(req.params.id);
        if (att) {
            if (att.checkInImage && att.checkInImage.includes('supabase')) await dbService.deleteFile(att.checkInImage);
            if (att.checkOutImage && att.checkOutImage.includes('supabase')) await dbService.deleteFile(att.checkOutImage);
        }
        await dbService.deleteAttendance(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ATTENDANCE PHOTO UPLOAD
router.post('/upload-photo', async (req, res) => {
    try {
        const { attendanceId, employeeId, date, type, base64Image } = req.body;
        if (!attendanceId || !base64Image || !type) {
            return res.status(400).json({ error: 'attendanceId, type, and base64Image required' });
        }

        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const empId = (employeeId || 'emp').toString().replace(/[^a-zA-Z0-9]/g, '');
        const safeDate = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
        const fileName = `attendance/${empId}_${safeDate}_${type}_${Date.now()}.jpg`;

        const publicUrl = await dbService.uploadFile(buffer, fileName, 'image/jpeg');

        const updateField = type === 'in' ? { checkInImage: publicUrl } : { checkOutImage: publicUrl };
        await dbService.updateAttendance(attendanceId, updateField);

        res.json({ success: true, url: publicUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
