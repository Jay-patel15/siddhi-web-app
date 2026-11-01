const express = require('express');
const router = express.Router();
const logService = require('../services/logService');

// GET /api/logs/live - Get recent live-captured HTTP logs
router.get('/live', (req, res) => {
    try {
        const limit = parseInt(req.query.limit, 10) || 100;
        const logs = logService.getLiveLogs(limit);
        res.json({ success: true, count: logs.length, logs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/logs/all - Get full historical + live HTTP logs
router.get('/all', async (req, res) => {
    try {
        const logs = await logService.reconstructAllSupabaseHttpLogs();
        const limit = parseInt(req.query.limit, 10) || 200;
        const page = parseInt(req.query.page, 10) || 1;
        const start = (page - 1) * limit;
        const paginated = logs.slice(start, start + limit);

        res.json({
            success: true,
            totalLogs: logs.length,
            page,
            limit,
            logs: paginated
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/logs/export-excel - Download Supabase HTTP Logs as Excel workbook
router.get('/export-excel', async (req, res) => {
    try {
        const { buffer, totalLogs, mismatchCount } = await logService.generateSupabaseLogsExcelBuffer();
        const filename = `Supabase_HTTP_API_Logs_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (e) {
        console.error('Supabase Logs Export Error:', e);
        res.status(500).json({ error: 'Failed to generate Supabase logs Excel: ' + e.message });
    }
});

module.exports = router;
