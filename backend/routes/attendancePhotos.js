const express = require('express');
const router = express.Router();
const dbService = require('../services/supabase-db');

router.get('/', async (req, res) => {
    try {
        const attendance = await dbService.getAllAttendance();
        const employees = await dbService.getAllEmployees();
        const empMap = {};
        employees.forEach(e => { empMap[e.id] = e.name; });

        const photos = [];
        attendance.forEach(att => {
            const empName = att.employeeName || empMap[att.employeeId] || 'Unknown';
            if (att.checkInImage) {
                photos.push({
                    attendanceId: att.id,
                    employeeId: att.employeeId,
                    employeeName: empName,
                    date: att.date,
                    time: att.timeIn,
                    type: 'in',
                    url: att.checkInImage
                });
            }
            if (att.checkOutImage) {
                photos.push({
                    attendanceId: att.id,
                    employeeId: att.employeeId,
                    employeeName: empName,
                    date: att.date,
                    time: att.timeOut,
                    type: 'out',
                    url: att.checkOutImage
                });
            }
        });

        photos.sort((a, b) => new Date(b.date + 'T' + (b.time || '00:00')) - new Date(a.date + 'T' + (a.time || '00:00')));
        res.json(photos);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id/:type', async (req, res) => {
    const { id, type } = req.params;
    try {
        const att = await dbService.getAttendanceById(id);
        if (!att) return res.status(404).json({ error: 'Record not found' });

        const field = type === 'in' ? 'checkInImage' : 'checkOutImage';
        const url = att[field];
        if (url) await dbService.deleteFile(url);

        await dbService.updateAttendance(id, { [field]: null });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
