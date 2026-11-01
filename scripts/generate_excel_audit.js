const XLSX = require('xlsx');
const path = require('path');
const dbService = require('../backend/services/supabase-db');

function extractUploadTime(url) {
    if (!url) return null;
    const m = url.match(/_(\d{13})\.jpe?g/i);
    return m ? new Date(Number(m[1])) : null;
}

function parseTimeStr(timeStr, baseDateStr, timeInStr) {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return null;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const d = new Date(baseDateStr + 'T00:00:00+05:30');
    d.setHours(hours, minutes, 0, 0);

    // If checkout time is chronologically earlier in 24h than checkin time (e.g. In: 09:00, Out: 00:07)
    // this means the shift extended past midnight into the next day.
    if (timeInStr) {
        const inParts = timeInStr.trim().split(':');
        if (inParts.length >= 2) {
            const inHours = parseInt(inParts[0], 10);
            const inMinutes = parseInt(inParts[1], 10);
            if (hours < inHours || (hours === inHours && minutes < inMinutes)) {
                d.setDate(d.getDate() + 1);
            }
        }
    }
    return d;
}

function formatISTFull(dateObj) {
    if (!dateObj) return '';
    return dateObj.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

function getMapLink(loc) {
    if (!loc) return '';
    if (typeof loc === 'object' && loc.lat && loc.lng) {
        return 'https://www.google.com/maps?q=' + loc.lat + ',' + loc.lng;
    }
    if (typeof loc === 'string' && loc.includes(',')) {
        return 'https://www.google.com/maps?q=' + loc.trim();
    }
    return '';
}

function getLocStr(loc) {
    if (!loc) return '';
    if (typeof loc === 'object' && loc.lat && loc.lng) {
        return loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5);
    }
    return String(loc);
}

async function buildMasterWorkbook() {
    const [employees, attendance, advances, debitNotes, payments] = await Promise.all([
        dbService.getAllEmployees(),
        dbService.getAllAttendance(),
        dbService.getAllAdvances(),
        dbService.getAllDebitNotes(),
        dbService.getAllPayments()
    ]);

    const empMap = {};
    employees.forEach(e => { empMap[e.id] = e.name; });

    // 1. Process Attendance & Find Discrepancies
    const auditLogs = [];
    const discrepancies = [];

    // Sort chronologically descending
    attendance.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.timeIn || '').localeCompare(a.timeIn || ''));

    attendance.forEach(r => {
        const empName = r.employeeName || empMap[r.employeeId] || 'Unknown';
        const inPhotoDate = extractUploadTime(r.checkInImage);
        const outPhotoDate = extractUploadTime(r.checkOutImage);

        const inPhotoIST = formatISTFull(inPhotoDate);
        const outPhotoIST = formatISTFull(outPhotoDate);

        let outDiffMin = null;
        let outDiffHours = null;
        let statusFlag = 'Normal';

        if (r.timeOut && outPhotoDate && r.date) {
            const recOutDate = parseTimeStr(r.timeOut, r.date, r.timeIn);
            if (recOutDate) {
                outDiffMin = Math.round((recOutDate.getTime() - outPhotoDate.getTime()) / (1000 * 60));
                outDiffHours = (outDiffMin / 60).toFixed(2);

                // If difference is more than 30 mins, flag as mismatch
                if (Math.abs(outDiffMin) > 30) {
                    statusFlag = `MISMATCH (${outDiffHours > 0 ? '+' : ''}${outDiffHours}h)`;
                    discrepancies.push({
                        'Date': r.date,
                        'Employee Name': empName,
                        'Employee ID': r.employeeId,
                        'Recorded Check-In': r.timeIn || '',
                        'Recorded Check-Out': r.timeOut || '',
                        'Photo Actual Upload Time (IST)': outPhotoIST,
                        'Discrepancy (Hours)': outDiffHours,
                        'Discrepancy (Minutes)': outDiffMin,
                        'Severity': Math.abs(outDiffMin) >= 120 ? 'HIGH (>2 hrs)' : 'MEDIUM (>30 mins)',
                        'Audit Note': outDiffMin > 0 
                            ? `Photo was taken & uploaded ${outDiffHours} hrs BEFORE the recorded checkout time.`
                            : `Photo was taken & uploaded ${Math.abs(outDiffHours)} hrs AFTER the recorded checkout time.`,
                        'Check-Out Photo URL': r.checkOutImage || '',
                        'Check-Out Location': getLocStr(r.checkOutLoc),
                        'Check-Out Map Link': getMapLink(r.checkOutLoc),
                        'Total Hours Recorded': r.workedHours || '',
                        'Record ID': r.id
                    });
                }
            }
        }

        const dayOfWeek = r.date ? new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short' }) : '';

        auditLogs.push({
            'Date': r.date,
            'Day': dayOfWeek,
            'Employee Name': empName,
            'Employee ID': r.employeeId,
            'Recorded Check-In': r.timeIn || '',
            'Actual In Photo Upload (IST)': inPhotoIST,
            'In Photo URL': r.checkInImage || '',
            'In Location': getLocStr(r.checkInLoc),
            'In Map Link': getMapLink(r.checkInLoc),
            'Recorded Check-Out': r.timeOut || '',
            'Actual Out Photo Upload (IST)': outPhotoIST,
            'Photo Discrepancy Status': statusFlag,
            'Discrepancy (Hours)': outDiffHours !== null ? outDiffHours : '',
            'Out Photo URL': r.checkOutImage || '',
            'Out Location': getLocStr(r.checkOutLoc),
            'Out Map Link': getMapLink(r.checkOutLoc),
            'Worked Hours': r.workedHours || '',
            'Slab Mode': r.slabMode ? 'Yes' : 'No',
            'Sunday Mode': r.sundayMode ? 'Yes' : 'No',
            'Daily Fare': r.fare || 0,
            'Security Flag': r.securityFlag || 'SECURE',
            'Record ID': r.id
        });
    });

    // 2. Prepare Employees sheet
    const empSheetData = employees.map(e => ({
        'ID': e.id,
        'Custom ID': e.customId || '',
        'Name': e.name,
        'Designation': e.designation || '',
        'Contact': e.contact || '',
        'Salary': e.salary || 0,
        'Employee Type': e.employee_type || 'daily_wage',
        'Monthly Fare': e.monthly_fare || 0
    }));

    // 3. Prepare Advances sheet
    const advSheetData = advances.map(a => ({
        'Record ID': a.id,
        'Date': a.date,
        'Employee Name': a.employeeName || empMap[a.employeeId] || empMap[a.empId] || 'Unknown',
        'Employee ID': a.employeeId || a.empId,
        'Amount (₹)': a.amount,
        'Deduction Month': a.deductionMonth || '',
        'Payment Mode': a.mode || a.paymentMode || 'Online',
        'Notes': a.notes || a.note || ''
    }));

    // 4. Prepare Debit Notes sheet
    const debitSheetData = debitNotes.map(d => ({
        'Record ID': d.id,
        'Date': d.date,
        'Employee Name': d.employeeName || empMap[d.employeeId] || empMap[d.empId] || 'Unknown',
        'Employee ID': d.employeeId || d.empId,
        'Amount (₹)': d.amount,
        'Reason': d.reason || '',
        'Deduction Month': d.deductionMonth || ''
    }));

    // 5. Prepare Payments sheet
    const paySheetData = payments.map(p => ({
        'Record ID': p.id,
        'Date': p.date || p.paymentDate || '',
        'Employee Name': p.employeeName || empMap[p.employeeId] || empMap[p.empId] || 'Unknown',
        'Employee ID': p.employeeId || p.empId,
        'Salary Month': p.month || p.salaryMonth || '',
        'Net Salary (₹)': p.netSalary || p.amount || 0,
        'Status': p.isPaid ? 'Paid' : 'Pending',
        'Payment Mode': p.paymentMode || p.mode || '',
        'Transaction ID': p.transactionId || ''
    }));

    // Create Workbook
    const wb = XLSX.utils.book_new();

    const wsDiscrepancies = XLSX.utils.json_to_sheet(discrepancies);
    const wsAudit = XLSX.utils.json_to_sheet(auditLogs);
    const wsEmployees = XLSX.utils.json_to_sheet(empSheetData);
    const wsAdvances = XLSX.utils.json_to_sheet(advSheetData);
    const wsDebit = XLSX.utils.json_to_sheet(debitSheetData);
    const wsPayments = XLSX.utils.json_to_sheet(paySheetData);

    // Column widths
    wsDiscrepancies['!cols'] = [
        { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 55 },
        { wch: 40 }, { wch: 22 }, { wch: 35 }, { wch: 16 }, { wch: 18 }
    ];

    wsAudit['!cols'] = [
        { wch: 12 }, { wch: 8 }, { wch: 18 }, { wch: 15 }, { wch: 15 },
        { wch: 25 }, { wch: 35 }, { wch: 20 }, { wch: 35 }, { wch: 15 },
        { wch: 25 }, { wch: 22 }, { wch: 16 }, { wch: 35 }, { wch: 20 },
        { wch: 35 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
        { wch: 12 }, { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(wb, wsDiscrepancies, 'Photo_Audit_Mismatches');
    XLSX.utils.book_append_sheet(wb, wsAudit, 'All_Attendance_Logs');
    XLSX.utils.book_append_sheet(wb, wsEmployees, 'Employees');
    XLSX.utils.book_append_sheet(wb, wsAdvances, 'Advances');
    XLSX.utils.book_append_sheet(wb, wsDebit, 'Debit_Notes');
    XLSX.utils.book_append_sheet(wb, wsPayments, 'Payments');

    return { wb, attendanceCount: auditLogs.length, mismatchCount: discrepancies.length };
}

async function generateMasterExcelFile() {
    const { wb, attendanceCount, mismatchCount } = await buildMasterWorkbook();
    const outputPath = path.join(__dirname, '..', 'Siddhi_Electricals_Full_Attendance_Audit_Log_2026.xlsx');
    XLSX.writeFile(wb, outputPath);
    console.log('✅ Master audit Excel successfully created at: ' + outputPath);
    console.log(`- Attendance: ${attendanceCount}, Flagged Mismatches: ${mismatchCount}`);
    return { outputPath, attendanceCount, mismatchCount };
}

async function generateMasterExcelBuffer() {
    const { wb, attendanceCount, mismatchCount } = await buildMasterWorkbook();
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return { buffer, attendanceCount, mismatchCount };
}

if (require.main === module) {
    generateMasterExcelFile().catch(err => {
        console.error('Fatal error generating Excel:', err);
        process.exit(1);
    });
}

module.exports = { buildMasterWorkbook, generateMasterExcelFile, generateMasterExcelBuffer };
