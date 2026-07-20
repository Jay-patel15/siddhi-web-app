const express = require('express');
const router = express.Router();
const db = require('./db-service');
const drive = require('./drive-service');
const upload = require('../middleware/upload');
const existingDb = require('../services/supabase-db'); // Reused for employees list

// Middleware for Admin access check
const checkAdmin = (req, res, next) => {
    const role = req.headers['x-user-role'];
    if (role !== 'admin') {
        return res.status(403).json({ error: 'Access Denied: Admin role required.' });
    }
    next();
};

// Middleware for Supervisor/Employee or Admin access check
const checkSupervisor = (req, res, next) => {
    const role = req.headers['x-user-role'];
    if (role !== 'employee' && role !== 'admin') {
        return res.status(403).json({ error: 'Access Denied: Supervisor or Admin role required.' });
    }
    next();
};

// ==================== SITES ====================

// List sites (filtered for supervisors, all for admins)
router.get('/sites', checkSupervisor, async (req, res) => {
    try {
        const role = req.headers['x-user-role'];
        const userId = req.headers['x-user-id'];

        if (role === 'admin') {
            const sites = await db.getAllSites();
            return res.json(sites);
        } else {
            // Supervisors see only assigned sites
            if (!userId) {
                return res.status(400).json({ error: 'User ID header missing.' });
            }
            const sites = await db.getAssignedSitesForEmployee(userId);
            return res.json(sites);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create site (Admin only)
router.post('/sites', checkAdmin, async (req, res) => {
    try {
        const { name, address, description, total_floors, flats_per_floor, bhk_types } = req.body;
        const userName = req.headers['x-user-name'] || 'Admin';

        if (!name || !total_floors || !flats_per_floor) {
            return res.status(400).json({ error: 'Name, total floors, and flats per floor are required.' });
        }

        const siteData = {
            name,
            address: address || '',
            description: description || '',
            total_floors: parseInt(total_floors),
            flats_per_floor: parseInt(flats_per_floor),
            bhk_types: Array.isArray(bhk_types) ? bhk_types : JSON.parse(bhk_types || '[]'),
            created_by: userName
        };

        const newSite = await db.createSite(siteData);
        res.status(201).json(newSite);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete site (Admin only)
router.delete('/sites/:id', checkAdmin, async (req, res) => {
    try {
        await db.deleteSite(req.params.id);
        res.json({ success: true, message: 'Site deleted successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get site dashboard details (Admin only)
router.get('/sites/:id/dashboard', checkAdmin, async (req, res) => {
    try {
        const metrics = await db.getSiteDashboardMetrics(req.params.id);
        res.json(metrics);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get site assignments (Admin only)
router.get('/sites/:id/assignments', checkAdmin, async (req, res) => {
    try {
        const assignments = await db.getSiteAssignments(req.params.id);
        res.json(assignments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Assign user to site (Admin only)
router.post('/sites/:id/assign', checkAdmin, async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID is required.' });
        }
        const assigned = await db.assignEmployeeToSite(req.params.id, employeeId);
        res.json(assigned);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Remove user assignment (Admin only)
router.delete('/sites/:id/assign/:employeeId', checkAdmin, async (req, res) => {
    try {
        await db.removeEmployeeAssignment(req.params.id, req.params.employeeId);
        res.json({ success: true, message: 'Assignment removed.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== FLATS & REPORTS ====================

// List flats for a site
router.get('/sites/:id/flats', checkSupervisor, async (req, res) => {
    try {
        const flats = await db.getFlatsBySite(req.params.id);
        res.json(flats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update flat metadata (Admins only)
router.put('/flats/:id', checkAdmin, async (req, res) => {
    try {
        const { flat_number, bhk_type, description } = req.body;
        const result = await db.updateFlat(req.params.id, { flat_number, bhk_type, description });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get report details for a flat
router.get('/flats/:id/report', checkSupervisor, async (req, res) => {
    try {
        const report = await db.getReportForFlat(req.params.id);
        res.json(report);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update report (Supervisors/Admins)
router.put('/flats/:id/report', checkSupervisor, async (req, res) => {
    try {
        const { rooms, stages } = req.body;
        const userName = req.headers['x-user-name'] || 'Unknown';

        const result = await db.updateReport(req.params.id, { rooms, stages, userName });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== PHOTOS ====================

// Upload photo and link to flat report room/stage
router.post('/reports/:id/upload', checkSupervisor, upload.single('photo'), async (req, res) => {
    try {
        const reportId = req.params.id;
        const { roomId, stageId, caption, siteName, flatNumber, locationName } = req.body;
        const userName = req.headers['x-user-name'] || 'Unknown';

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }
        if (!siteName || !flatNumber || !locationName) {
            return res.status(400).json({ error: 'Site name, flat number, and room/stage location name are required.' });
        }

        // Upload image buffer to Google Drive
        const driveResult = await drive.uploadPhoto({
            siteName,
            flatNumber,
            locationName,
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
            filename: `${Date.now()}-${req.file.originalname}`
        });

        // Insert database photo link
        const photoRecord = await db.addPhotoLink({
            reportId,
            roomId: roomId || null,
            stageId: stageId || null,
            drive_file_id: driveResult.drive_file_id,
            drive_view_url: driveResult.drive_view_url,
            drive_thumbnail_url: driveResult.drive_thumbnail_url,
            caption: caption || '',
            userName
        });

        res.json(photoRecord);
    } catch (e) {
        console.error('Upload API failure:', e);
        res.status(500).json({ error: 'Photo upload failed: ' + e.message });
    }
});

// ==================== EMPLOYEES LIST FOR ASSIGNMENTS ====================

router.get('/employees', checkAdmin, async (req, res) => {
    try {
        const employees = await existingDb.getAllEmployees();
        res.json(employees);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
