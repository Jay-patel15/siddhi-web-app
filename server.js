require('dotenv').config(); // Load environment variables
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dbService = require('./services/supabase-db'); // Use Supabase service
const dns = require('node:dns');

// Force Node to prefer IPv4 (fixes many connectivity issues on Windows/WiFi)
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '15012002J^aya';

// Ensure directories exist (though not used for uploads anymore)
// Ensure directories exist (though not used for uploads anymore)

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Redirect old MPA pages to SPA index.html
const mpaPages = ['/dashboard.html', '/employees.html', '/attendance.html', '/advance.html', '/payroll.html', '/uploads.html', '/settings.html'];
app.get(mpaPages, (req, res) => {
    res.redirect('/');
});

// Multer Storage (Memory for Cloud Upload)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- API Endpoints ---

// LOGIN
app.post('/api/login', async (req, res) => {
    const { username, password, empName } = req.body;
    const loginUser = (username || empName || '').toString().trim();

    // 1. Check Admin Hardcoded
    if (loginUser.toLowerCase() === ADMIN_USERNAME.toLowerCase() && password === ADMIN_PASSWORD) {
        return res.json({ success: true, role: 'admin', name: 'Administrator' });
    }

    // 2. Check Employees DB
    try {
        const employees = await dbService.getAllEmployees();
        // Match either Name or ID or customId (case insensitive, string comparison) and Password
        const emp = employees.find(e => {
            const nameMatch = e.name && e.name.toLowerCase() === loginUser.toLowerCase();
            const idMatch = String(e.id) === loginUser;
            const customIdMatch = String(e.customId) === loginUser;
            return (nameMatch || idMatch || customIdMatch) && e.password === password;
        });

        if (emp) {
            return res.json({ success: true, role: 'employee', name: emp.name, id: emp.id });
        }
    } catch (e) {
        console.error('Login DB Error:', e);
    }

    res.status(401).json({ error: 'Invalid credentials' });
});

// EMPLOYEES
app.get('/api/employees', async (req, res) => {
    try {
        const employees = await dbService.getAllEmployees();
        res.json(employees);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/employees', async (req, res) => {
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
            slabBaseHours: req.body.slabBaseHours || 6
        };
        const created = await dbService.createEmployee(newEmployee);
        res.json(created);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/employees/:id', async (req, res) => {
    try {
        const updated = await dbService.updateEmployee(req.params.id, req.body);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        await dbService.deleteEmployee(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ATTENDANCE
app.get('/api/attendance', async (req, res) => {
    try {
        const attendance = await dbService.getAllAttendance();
        res.json(attendance);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/attendance', async (req, res) => {
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

app.put('/api/attendance/:id', async (req, res) => {
    try {
        const updated = await dbService.updateAttendance(req.params.id, req.body);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/attendance/:id', async (req, res) => {
    try {
        const att = await dbService.getAttendanceById(req.params.id);
        // Also clean up any stored attendance photos
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

// ATTENDANCE PHOTO UPLOAD — converts base64 to Supabase Storage, updates attendance record
app.post('/api/attendance/upload-photo', async (req, res) => {
    try {
        const { attendanceId, employeeId, date, type, base64Image } = req.body;
        if (!attendanceId || !base64Image || !type) {
            return res.status(400).json({ error: 'attendanceId, type, and base64Image required' });
        }

        // base64Image may have data: prefix — strip it
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const empId = (employeeId || 'emp').toString().replace(/[^a-zA-Z0-9]/g, '');
        const safeDate = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
        const fileName = `attendance/${empId}_${safeDate}_${type}_${Date.now()}.jpg`;

        const publicUrl = await dbService.uploadFile(buffer, fileName, 'image/jpeg');

        // Update attendance record with URL
        const updateField = type === 'in' ? { checkInImage: publicUrl } : { checkOutImage: publicUrl };
        await dbService.updateAttendance(attendanceId, updateField);

        res.json({ success: true, url: publicUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ATTENDANCE PHOTOS GALLERY — list all photos from attendance records
app.get('/api/attendance-photos', async (req, res) => {
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

        // Sort newest first
        photos.sort((a, b) => new Date(b.date + 'T' + (b.time || '00:00')) - new Date(a.date + 'T' + (a.time || '00:00')));
        res.json(photos);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE a single attendance photo (removes from storage, nulls the field)
app.delete('/api/attendance-photos/:id/:type', async (req, res) => {
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

// HOLIDAYS

app.get('/api/holidays', async (req, res) => {
    try {
        const holidays = await dbService.getAllHolidays();
        res.json(holidays);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/holidays', async (req, res) => {
    try {
        const dates = req.body; // Expecting array of date strings
        await dbService.setHolidays(dates);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// SETTINGS
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await dbService.getSettings();
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const updated = await dbService.updateSettings(req.body);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/settings/storage-usage', async (req, res) => {
    try {
        const usage = await dbService.getStorageUsage();
        res.json(usage);
    } catch (e) {
        console.error('Storage Usage Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/settings/database-usage', async (req, res) => {
    try {
        const usage = await dbService.getDatabaseUsageEstimate();
        res.json(usage);
    } catch (e) {
        console.error('Database Usage Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings/import-data', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload) return res.status(400).json({ error: 'No data payload provided.' });

        const results = await dbService.importData(payload);
        res.json({ success: true, results });
    } catch (e) {
        console.error('Data Import Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ADVANCES
app.get('/api/advances', async (req, res) => {
    try {
        const advances = await dbService.getAllAdvances();
        res.json(advances);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/advances', upload.single('screenshot'), async (req, res) => {
    try {
        let screenshotUrl = null;
        if (req.file) {
            const ext = path.extname(req.file.originalname);
            const name = req.file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const fileName = `${Date.now()}-${name}${ext}`;

            // Upload to Supabase
            screenshotUrl = await dbService.uploadFile(req.file.buffer, fileName, req.file.mimetype);
        }

        const newAdvance = {
            id: Date.now().toString(),
            employeeId: req.body.employeeId,
            amount: parseFloat(req.body.amount),
            date: req.body.date,
            deductionMonth: req.body.deductionMonth,
            mode: req.body.mode,
            notes: req.body.notes,
            screenshot: screenshotUrl
        };

        const created = await dbService.createAdvance(newAdvance);
        res.json(created);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/advances/:id', upload.single('screenshot'), async (req, res) => {
    try {
        const existing = await dbService.getAdvanceById(req.params.id);

        if (existing) {
            let screenshotUrl = existing.screenshot;
            if (req.file) {
                // Delete old file if exists
                if (existing.screenshot) await dbService.deleteFile(existing.screenshot);

                const ext = path.extname(req.file.originalname);
                const name = req.file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
                const fileName = `${Date.now()}-${name}${ext}`;

                // Upload new to Supabase
                screenshotUrl = await dbService.uploadFile(req.file.buffer, fileName, req.file.mimetype);
            }

            const updatedAdvance = {
                employeeId: req.body.employeeId,
                amount: parseFloat(req.body.amount),
                date: req.body.date,
                deductionMonth: req.body.deductionMonth,
                mode: req.body.mode,
                notes: req.body.notes,
                screenshot: screenshotUrl
            };
            const updated = await dbService.updateAdvance(req.params.id, updatedAdvance);
            res.json(updated);
        } else {
            res.status(404).json({ error: 'Record not found' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/advances/:id', async (req, res) => {
    try {
        const adv = await dbService.getAdvanceById(req.params.id);
        if (adv && adv.screenshot) {
            await dbService.deleteFile(adv.screenshot);
        }

        await dbService.deleteAdvance(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PAYMENTS
app.get('/api/payments', async (req, res) => {
    try {
        const payments = await dbService.getAllPayments();
        res.json(payments);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/payments', upload.single('screenshot'), async (req, res) => {
    try {
        let screenshotUrl = null;
        if (req.file) {
            const ext = path.extname(req.file.originalname);
            const name = req.file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            const fileName = `${Date.now()}-${name}${ext}`;

            // Upload to Supabase
            screenshotUrl = await dbService.uploadFile(req.file.buffer, fileName, req.file.mimetype);
        }

        const newPayment = {
            id: Date.now().toString(),
            employeeId: req.body.employeeId,
            salaryMonth: req.body.salaryMonth, // YYYY-MM
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

// UPLOADS MGMT
app.get('/api/uploads', async (req, res) => {
    try {
        const advances = await dbService.getAllAdvances();
        const payments = await dbService.getAllPayments();

        const uploadList = [];

        // Add Advances with Screenshots
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

        // Add Payments with Screenshots
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

        // Sort by date desc
        uploadList.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(uploadList);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/uploads/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    try {
        if (type === 'advance') {
            const adv = await dbService.getAdvanceById(id);
            if (adv && adv.screenshot) {
                await dbService.deleteFile(adv.screenshot);
                // Update record to remove screenshot ref
                const updated = { ...adv, screenshot: null };
                // Note: dbService update needs partial object usually
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

// PAYROLL CALCULATION
app.get('/api/payroll', async (req, res) => {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ error: 'Month required' });

    try {
        const employees = await dbService.getAllEmployees();
        const attendance = await dbService.getAllAttendance();
        const advances = await dbService.getAllAdvances();
        const payments = await dbService.getAllPayments();

        // Read Settings
        const settingsData = await dbService.getSettings();
        const stdHours = parseFloat(settingsData.standardHours || 8.5);
        const slabBase = parseFloat(settingsData.slabHours || 6);

        const payroll = employees.map(emp => {
            // Filter attendance for month
            const empAtt = attendance.filter(a =>
                a.employeeId === emp.id && a.date.startsWith(month)
            );

            // Filter advances deduced this month
            const empAdv = advances.filter(a => {
                if (a.employeeId !== emp.id) return false;
                // Either explicit deductionMonth or check date
                const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                return deduct === month;
            });

            // Filter payments for this salary month
            const empPay = payments.filter(p => p.employeeId === emp.id && p.salaryMonth === month);
            const totalPaid = empPay.reduce((sum, p) => sum + p.amount, 0);

            // Find last payment date and proofs
            empPay.sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastPaymentDate = empPay.length > 0 ? empPay[0].date : null;
            const paymentProofs = empPay.filter(p => p.screenshot).map(p => p.screenshot);

            let totalSalary = 0;
            let totalFare = 0;
            let daysWorked = empAtt.length;

            empAtt.forEach(att => {
                let dailySalary = 0;
                const workedHours = parseFloat(att.workedHours);
                const salary = parseFloat(emp.salary);
                const normalRate = salary / stdHours;

                if (att.slabMode) {
                    if (workedHours > stdHours) {
                        const extraHours = workedHours - stdHours;
                        const slabRate = salary / slabBase;
                        dailySalary = (normalRate * stdHours) + (slabRate * extraHours);
                    } else {
                        dailySalary = normalRate * workedHours;
                    }
                } else {
                    dailySalary = normalRate * workedHours;
                }

                totalSalary += dailySalary;
                totalFare += (parseFloat(att.fare) || 0);
            });

            const totalAdvance = empAdv.reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);

            // --- PREVIOUS BALANCE CALCULATION ---
            let previousBalance = 0;

            // Calculate earnings, deductions, and payments for ALL previous months
            // Logic: (Total Past Earnings) - (Total Past Deductions) - (Total Past Payments)

            // Past Attendance Earnings
            const pastAtt = attendance.filter(a => a.employeeId === emp.id && a.date < `${month}-01`);
            let pastEarnings = 0;
            pastAtt.forEach(att => {
                let dailySalary = 0;
                const workedHours = parseFloat(att.workedHours);
                const salary = parseFloat(emp.salary); // Using current salary for simplicity
                const normalRate = salary / stdHours;

                if (att.slabMode) {
                    if (workedHours > stdHours) {
                        const extraHours = workedHours - stdHours;
                        const slabRate = salary / slabBase;
                        dailySalary = (normalRate * stdHours) + (slabRate * extraHours);
                    } else {
                        dailySalary = normalRate * workedHours;
                    }
                } else {
                    dailySalary = normalRate * workedHours;
                }
                pastEarnings += dailySalary;
                pastEarnings += (parseFloat(att.fare) || 0);
            });

            // Past Advances (Deductions)
            const pastAdv = advances.filter(a => {
                if (a.employeeId !== emp.id) return false;
                const deduct = a.deductionMonth || (a.date ? a.date.substring(0, 7) : '');
                return deduct < month;
            });
            const pastDeductions = pastAdv.reduce((sum, adv) => sum + (parseFloat(adv.amount) || 0), 0);

            // Past Payments
            const pastPay = payments.filter(p => p.employeeId === emp.id && p.salaryMonth < month);
            const pastPaymentsTotal = pastPay.reduce((sum, p) => sum + p.amount, 0);

            previousBalance = Math.round(pastEarnings - pastDeductions - pastPaymentsTotal);

            // Final Calculation
            const currentMonthNet = totalSalary + totalFare - totalAdvance;
            const netPayable = Math.round(currentMonthNet + previousBalance);
            const remainingDue = netPayable - totalPaid;

            return {
                employee: emp,
                daysWorked,
                salaryEarned: Math.round(totalSalary),
                fareTotal: totalFare,
                advancePaid: totalAdvance,
                previousBalance: previousBalance,
                currentMonthNet: Math.round(currentMonthNet),
                finalPayable: netPayable,
                paidTotal: totalPaid,
                remainingDue: remainingDue,
                lastPaymentDate,
                paymentProofs,
                status: remainingDue <= 0 ? 'Settled' : (totalPaid > 0 ? 'Partial' : 'Unpaid')
            };
        });

        res.json(payroll);
    } catch (e) {
        console.error('Payroll Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// FACTORY RESET
app.delete('/api/factory-reset', async (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Incorrect Password' });
    }
    try {
        await dbService.factoryReset();
        // Also clean uploads if possible, or leave them (dbService.factoryReset handles DB)
        // dbService.factoryReset cleans DB references. Images remain in bucket but unlinked.
        // We could list and delete bucket items, but factoryReset in dbService only did DB cleaning.
        // For simplicity, we assume DB clean is enough.
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Start Server (only when not imported by Vercel)
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

// Export for Vercel Serverless
module.exports = app;
