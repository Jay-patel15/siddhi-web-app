require('dotenv').config(); // Load environment variables
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const dns = require('node:dns');

const zlib = require('zlib');

// Force Node to prefer IPv4 (fixes many connectivity issues on Windows/WiFi)
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Native Gzip Compression Middleware for API Responses
app.use('/api', (req, res, next) => {
    const acceptEncoding = req.headers['accept-encoding'] || '';
    if (req.method !== 'GET' || !acceptEncoding.includes('gzip')) return next();

    const originalJson = res.json.bind(res);
    res.json = (data) => {
        const jsonStr = JSON.stringify(data);
        zlib.gzip(jsonStr, (err, buffer) => {
            if (err) return originalJson(data);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Length', buffer.length);
            res.send(buffer);
        });
    };
    next();
});
// Serve frontend static files (no-cache for HTML to prevent stale page issues)
app.use(express.static(path.join(__dirname, 'frontend'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Root `/` and `/index.html` → redirect to login
app.get('/', (req, res) => res.redirect(302, '/login.html'));
app.get('/index.html', (req, res) => res.redirect(302, '/login.html'));

// Redirect legacy section URLs → new sections folder
const legacyPages = ['/dashboard.html', '/employees.html', '/attendance.html', '/advance.html', '/debitNotes.html', '/payroll.html', '/uploads.html', '/settings.html', '/attPhotos.html'];
app.get(legacyPages, (req, res) => {
    const page = req.path.replace('.html', '');
    res.redirect(302, `/sections${page}.html`);
});

// Import Routes
const authRoutes = require('./backend/routes/auth');
const employeeRoutes = require('./backend/routes/employees');
const attendanceRoutes = require('./backend/routes/attendance');
const attendancePhotosRoutes = require('./backend/routes/attendancePhotos');
const holidayRoutes = require('./backend/routes/holidays');
const settingsRoutes = require('./backend/routes/settings');
const advanceRoutes = require('./backend/routes/advances');
const debitNotesRoutes = require('./backend/routes/debitNotes');
const paymentRoutes = require('./backend/routes/payments');
const uploadRoutes = require('./backend/routes/uploads');
const payrollRoutes = require('./backend/routes/payroll');

// Mount Routes
app.use('/api', authRoutes); 
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/attendance-photos', attendancePhotosRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/advances', advanceRoutes);
app.use('/api/debit-notes', debitNotesRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/payroll', payrollRoutes);

// Start Server (only when not imported by Vercel)
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

// Export for Vercel Serverless
module.exports = app;
