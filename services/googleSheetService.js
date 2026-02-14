
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const KEY_FILE = path.join(__dirname, '..', 'service-account.json');
let sheets = null;
let drive = null;
let authClient = null;

async function init() {
    if (sheets) return true;

    if (!fs.existsSync(KEY_FILE)) {
        console.error('googleSheetService: service-account.json missing');
        return false;
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ],
        });

        authClient = await auth.getClient();
        sheets = google.sheets({ version: 'v4', auth: authClient });
        drive = google.drive({ version: 'v3', auth: authClient });

        console.log('✅ Google Sheets Service Initialized');
        return true;
    } catch (e) {
        console.error('❌ Google Sheets Auth Error:', e.message);
        return false;
    }
}

async function createMonthlyReport(employee, month, attendanceData, advances, payments, settings) {
    if (!sheets) await init();
    if (!sheets) throw new Error('Google Sheets Service Not Initialized');

    const sheetTitle = `${employee.name} - ${month}`;

    // 1. Create Spreadsheet
    const createRes = await sheets.spreadsheets.create({
        requestBody: {
            properties: {
                title: sheetTitle,
            },
        },
    });

    const spreadsheetId = createRes.data.spreadsheetId;
    const url = createRes.data.spreadsheetUrl;

    // 2. Prepare Data
    // Header
    const rows = [
        ['ATTENDANCE & PAYROLL REPORT'],
        [`Employee: ${employee.name}`, `Month: ${month}`, `Designation: ${employee.designation || '-'}`],
        [''], // Spacer
        ['Date', 'Checking In', 'Checking Out', 'Total Hours', 'Status', 'Daily Salary', 'Fare', 'Total Earned']
    ];

    let totalEarned = 0;
    let daysPresent = 0;

    // Process Attendance
    attendanceData.forEach(att => {
        const wh = parseFloat(att.workedHours);
        const stdHours = settings.standardHours || 8.5;
        const slabBase = settings.slabHours || 6;
        const salary = parseFloat(employee.salary);

        let dailySalary = 0;
        let status = 'Present';

        const normalRate = salary / stdHours;
        if (att.slabMode && wh > stdHours) {
            const extra = wh - stdHours;
            const slabRate = salary / slabBase;
            dailySalary = (normalRate * stdHours) + (slabRate * extra);
            status = 'Overtime';
        } else {
            dailySalary = normalRate * wh;
        }

        const fare = parseFloat(att.fare || 0);
        const dayTotal = Math.round(dailySalary + fare);

        totalEarned += dayTotal;
        daysPresent++;

        rows.push([
            att.date,
            att.timeIn,
            att.timeOut,
            wh.toFixed(2),
            status,
            Math.round(dailySalary),
            fare,
            dayTotal
        ]);
    });

    // Add Summary
    rows.push(['']);
    rows.push(['SUMMARY']);

    // Advances
    let totalAdv = 0;
    if (advances.length > 0) {
        rows.push(['ADVANCES']);
        advances.forEach(adv => {
            rows.push(['Date', adv.date, 'Amount', adv.amount, 'Notes', adv.notes || '-']);
            totalAdv += parseFloat(adv.amount);
        });
        rows.push(['Total Advance Deducted', '', '', totalAdv]);
    } else {
        rows.push(['No Advances for this month']);
    }

    // Payments
    let totalPaid = 0;
    rows.push(['']);
    if (payments.length > 0) {
        rows.push(['PAYMENTS MADE']);
        payments.forEach(p => {
            rows.push(['Date', p.date, 'Amount', p.amount, 'Mode', p.mode]);
            totalPaid += parseFloat(p.amount);
        });
        rows.push(['Total Paid So Far', '', '', totalPaid]);
    }

    const netPayable = totalEarned - totalAdv;
    const due = netPayable - totalPaid;

    rows.push(['']);
    rows.push(['FINAL CALCULATIONS']);
    rows.push(['Total Earnings', '', '', Math.round(totalEarned)]);
    rows.push(['Less Total Advances', '', '', totalAdv]);
    rows.push(['Net Payable', '', '', Math.round(netPayable)]);
    rows.push(['Less Paid', '', '', totalPaid]);
    rows.push(['BALANCE DUE', '', '', Math.round(due)]);

    // 3. Write Data
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows }
    });

    // 4. Formatting (Optional but nice)
    // Make Header Bold
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [
                {
                    repeatCell: {
                        range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
                        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
                        fields: 'userEnteredFormat(textFormat)'
                    }
                },
                {
                    repeatCell: {
                        range: { sheetId: 0, startRowIndex: 3, endRowIndex: 4 },
                        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } } },
                        fields: 'userEnteredFormat(textFormat,backgroundColor)'
                    }
                }
            ]
        }
    });

    // 5. Make Public (Viewer) so user can open instantly
    // Without this, user gets "Access Denied" unless signed in to the generic service account (impossible)
    try {
        await drive.permissions.create({
            fileId: spreadsheetId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });
    } catch (permError) {
        console.error('Error setting public permission:', permError.message);
        // Fallback: Return URL anyway, user might have access if domain restricted or previous setup
    }

    return url;
}

// Upload file to Google Drive folder and return shareable link
const DRIVE_FOLDER_ID = '1CLcYm0sKrxPPd3yUdVuj4urGvMYFyqNa'; // Shared folder for payment proofs

async function uploadFileToDrive(filePath, fileName) {
    if (!drive) await init();
    if (!drive) {
        console.log('⚠️ Drive not initialized, using local storage');
        return null;
    }

    const fs = require('fs');
    const mimeType = fileName.match(/\.(png|jpg|jpeg)$/i) ? 'image/jpeg' : 'application/octet-stream';

    try {
        // 1. Upload file to Drive
        const fileMetadata = {
            name: fileName,
            parents: [DRIVE_FOLDER_ID]
        };

        const media = {
            mimeType: mimeType,
            body: fs.createReadStream(filePath)
        };

        const uploadRes = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink',
            supportsAllDrives: true
        });

        const fileId = uploadRes.data.id;

        // 2. Make file publicly viewable
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            },
            supportsAllDrives: true
        });

        // 3. Return the web view link
        const viewLink = `https://drive.google.com/file/d/${fileId}/view`;
        console.log(`✅ Uploaded to Drive: ${fileName} -> ${viewLink}`);
        return viewLink;

    } catch (error) {
        console.error('⚠️ Drive Upload Error (falling back to local):', error.message);
        return null; // Return null to signal fallback to local storage
    }
}

module.exports = {
    init,
    createMonthlyReport,
    uploadFileToDrive
};
