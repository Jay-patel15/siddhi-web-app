const API_URL = '/api';

// ==================== UTILS ====================
function formatTimeTo12h(timeStr) {
    if (!timeStr) return '-';
    const [hours, minutes] = timeStr.split(':');
    let h = parseInt(hours);
    const m = minutes;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
}

/**
 * Compresses an image file client-side using Canvas API
 * @param {File} file - The original image file
 * @param {number} maxWidth - Maximum width in pixels
 * @param {number} quality - Quality from 0 to 1
 * @returns {Promise<File|Blob>} - Compressed file as Blob or File
 */
async function compressImage(file, maxWidth = 1024, quality = 0.7) {
    if (!file || !file.type.startsWith('image/')) return file;
    // Skip small files (under 200KB)
    if (file.size < 200 * 1024) return file;

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
        };
    });
}



// ==================== DARK MODE ====================
function initDarkMode() {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.body.classList.add('dark-mode');
        updateDarkModeUI(true);
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark);
    updateDarkModeUI(isDark);
}

function updateDarkModeUI(isDark) {
    const icon = document.querySelector('#dark-mode-btn .toggle-icon');
    const label = document.getElementById('dark-mode-label');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

// Initialize dark mode immediately (before DOMContentLoaded to avoid flash)
initDarkMode();

// Global State
let globalSettings = { standardHours: 8.5, slabHours: 6 };
let holidays = [];
let employeesData = [];
let attendanceData = [];
let advancesData = [];
let paymentsData = []; // Added
let currentModalEmployee = null;
let currentModalMonth = null;

// Check authentication on page load
function checkAuth() {
    const sessionStr = localStorage.getItem('payroll_session');
    if (!sessionStr) {
        window.location.href = 'login.html';
        return false;
    }

    const session = JSON.parse(sessionStr);
    const now = Date.now();
    const limit = 12 * 60 * 60 * 1000; // 12 Hours

    if (now - session.timestamp > limit) {
        localStorage.removeItem('payroll_session');
        window.location.href = 'login.html';
        return false;
    }

    if (session.role !== 'admin') {
        window.location.href = 'employee-portal.html';
        return false;
    }
    return true;
}

// Logout function
function logout() {
    localStorage.removeItem('payroll_session');
    window.location.href = 'login.html';
}

// Init
async function init() {
    if (!checkAuth()) return;
    setDefaultMonthFilters();
    await fetchSettings();
    await fetchHolidays();

    // In SPA, always start with dashboard unless specified?
    showSection('dashboard');
}

// Navigation (Restored for SPA)
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    // Show target section
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.add('active');
    }

    // Update active nav link
    document.querySelectorAll('.nav-links .nav-item').forEach(item => {
        if (item.getAttribute('onclick')?.includes(`'${sectionId}'`)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    closeSidebarOnMobile();

    // Call section-specific loads
    if (sectionId === 'dashboard') loadDashboard();
    else if (sectionId === 'employees') loadEmployees();
    else if (sectionId === 'attendance') loadAttendance();
    else if (sectionId === 'advance') loadAdvanceForm();
    else if (sectionId === 'payroll') loadPayroll();
    else if (sectionId === 'uploads') loadUploadsPage();
    else if (sectionId === 'attPhotos') loadAttendancePhotos();
    else if (sectionId === 'settings') loadSettingsForm();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.querySelector('.overlay').classList.toggle('active');
}

// Close sidebar on mobile
function closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.querySelector('.overlay').classList.remove('active');
    }
}

// --- SETTINGS ---
async function fetchSettings() {
    try {
        const res = await fetch(`${API_URL}/settings`);
        if (res.ok) globalSettings = await res.json();
    } catch (e) {
        console.warn("Using default settings (Server might need restart):", e);
    }
}

async function fetchHolidays() {
    try {
        const res = await fetch(`${API_URL}/holidays`);
        if (res.ok) holidays = await res.json();
    } catch (e) {
        console.warn("Could not fetch holidays:", e);
    }
}

function loadSettingsForm() {
    document.getElementById('set-standard-hours').value = globalSettings.standardHours;
    document.getElementById('set-slab-hours').value = globalSettings.slabHours;
    // Fetch storage & DB stats when settings page is opened
    fetchStorageUsage();
    fetchDatabaseUsage();
}

document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newSettings = {
        standardHours: parseFloat(document.getElementById('set-standard-hours').value),
        slabHours: parseFloat(document.getElementById('set-slab-hours').value)
    };
    await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
    });
    globalSettings = newSettings;
    alert('Settings Saved! All calculations updated.');
});

async function resetSettings() {
    if (!confirm('Reset to defaults (8.5h / 6h)?')) return;
    const defaults = { standardHours: 8.5, slabHours: 6 };
    await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaults)
    });
    globalSettings = defaults;
    loadSettingsForm();
    alert('Settings Reset!');
}

async function fetchStorageUsage() {
    const usedText = document.getElementById('storage-used-text');
    const progressBar = document.getElementById('storage-progress-bar');
    const fileCount = document.getElementById('storage-file-count');

    if (!usedText || !progressBar) return;

    try {
        usedText.innerHTML = 'Calculating... <span style="font-size:0.8rem; color:var(--gray)">(This may take a moment)</span>';
        const res = await fetch(`${API_URL}/settings/storage-usage`);
        if (!res.ok) throw new Error('Failed to fetch storage');

        const usage = await res.json();

        usedText.innerText = `${usage.megabytes} MB Used`;
        progressBar.style.width = `${Math.min(usage.percentageUsed, 100)}%`;
        if (fileCount) fileCount.innerText = `Total Files in Storage: ${usage.fileCount || 0}`;

        // Change color based on usage thresholds
        if (usage.percentageUsed > 90) {
            progressBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)'; // Red
        } else if (usage.percentageUsed > 75) {
            progressBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)'; // Yellow/Orange
        } else {
            progressBar.style.background = 'linear-gradient(90deg, #10b981, #14b8a6)'; // Green
        }

    } catch (e) {
        console.error(e);
        usedText.innerText = 'Failed to load usage';
    }
}

async function fetchDatabaseUsage() {
    const usedText = document.getElementById('database-used-text');
    const progressBar = document.getElementById('database-progress-bar');

    if (!usedText || !progressBar) return;

    try {
        usedText.innerHTML = 'Calculating...';
        const res = await fetch(`${API_URL}/settings/database-usage`);
        if (!res.ok) throw new Error('Failed to fetch database usage');

        const usage = await res.json();

        // Show as MB or KB depending on size since text is usually small
        const displayMB = usage.megabytes < 0.01 ? '< 0.01 MB' : `${usage.megabytes} MB`;

        usedText.innerText = `${displayMB} Used`;
        progressBar.style.width = `${Math.max(Math.min(usage.percentageUsed, 100), 1)}%`;

        // Change color based on usage thresholds
        if (usage.percentageUsed > 90) {
            progressBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)'; // Red
        } else if (usage.percentageUsed > 75) {
            progressBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)'; // Yellow/Orange
        } else {
            progressBar.style.background = 'linear-gradient(90deg, #3b82f6, #60a5fa)'; // Blue
        }

    } catch (e) {
        console.error(e);
        usedText.innerText = 'Failed to load database usage';
    }
}

async function exportAllDataToExcel() {
    try {
        if (typeof XLSX === 'undefined') {
            throw new Error('Excel library (SheetJS) is not loaded. Please refresh the page and try again.');
        }

        const btn = document.querySelector('[onclick="exportAllDataToExcel()"]');
        const origText = btn.innerHTML;
        btn.innerHTML = '⏳ Generating Excel...';
        btn.disabled = true;

        const startDateInput = document.getElementById('export-all-start-date').value || '2026-03-01';
        const endDateInput = document.getElementById('export-all-end-date').value || '2050-12-31';

        // Fetch fresh data
        const [empRes, attRes, advRes, payRes] = await Promise.all([
            fetch(`${API_URL}/employees`),
            fetch(`${API_URL}/attendance`),
            fetch(`${API_URL}/advances`),
            fetch(`${API_URL}/payments`)
        ]);

        if (!empRes.ok || !attRes.ok || !advRes.ok || !payRes.ok) {
            throw new Error('Failed to fetch data from the server.');
        }

        const employees = await empRes.json();
        const attendance = await attRes.json();
        const advances = await advRes.json();
        const payments = await payRes.json();

        // 1. Prepare Employee Data
        const empData = employees.map(e => ({
            "Employee ID": e.customId || e.id,
            "Name": e.name,
            "Contact": e.contact,
            "Designation": e.designation,
            "Daily Salary": e.salary,
            "Standard Hours": e.normalHours || globalSettings.standardHours,
            "Slab Hours": e.slabBaseHours || globalSettings.slabHours
        }));

        // 2. Prepare Attendance Data (Filtered)
        const filteredAtt = attendance.filter(a => a.date >= startDateInput && a.date <= endDateInput);
        const attData = filteredAtt.map(a => ({
            "Record ID": a.id,
            "Date": a.date,
            "Employee ID": a.employeeId,
            "Employee Name": a.employeeName,
            "Time In": a.timeIn,
            "Time Out": a.timeOut,
            "Worked Hours": a.workedHours,
            "Calculated Fare": a.fare
        }));

        // 3. Prepare Advances Data (Filtered by date or month)
        const startMonthStr = startDateInput.substring(0, 7);
        const endMonthStr = endDateInput.substring(0, 7);
        const filteredAdv = advances.filter(a => {
            if (a.deductionMonth) {
                return a.deductionMonth >= startMonthStr && a.deductionMonth <= endMonthStr;
            } else {
                return a.date >= startDateInput && a.date <= endDateInput;
            }
        });

        const advData = filteredAdv.map(a => ({
            "Record ID": a.id,
            "Date": a.date,
            "Employee ID": a.employeeId,
            "Amount": a.amount,
            "Deduction Month": a.deductionMonth,
            "Mode": a.mode,
            "Notes": a.notes
        }));

        // 4. Prepare Payments Data (Filtered)
        const filteredPay = payments.filter(p => {
            if (p.salaryMonth) {
                return p.salaryMonth >= startMonthStr && p.salaryMonth <= endMonthStr;
            } else {
                return p.date >= startDateInput && p.date <= endDateInput;
            }
        });
        const payData = filteredPay.map(p => ({
            "Record ID": p.id,
            "Date": p.date,
            "Employee ID": p.employeeId,
            "Salary Month": p.salaryMonth,
            "Amount": p.amount,
            "Mode": p.mode,
            "Notes": p.notes
        }));

        // Convert JSON to Worksheets
        const wsEmp = XLSX.utils.json_to_sheet(empData);
        const wsAtt = XLSX.utils.json_to_sheet(attData);
        const wsAdv = XLSX.utils.json_to_sheet(advData);
        const wsPay = XLSX.utils.json_to_sheet(payData);

        // Define column widths for better readability
        const wscols = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
        wsEmp['!cols'] = wscols;
        wsAtt['!cols'] = wscols;
        wsAdv['!cols'] = wscols;
        wsPay['!cols'] = wscols;

        // Create Workbook and Append Sheets
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsEmp, "Employee");
        XLSX.utils.book_append_sheet(wb, wsAtt, "Attendance");
        XLSX.utils.book_append_sheet(wb, wsAdv, "advance");
        XLSX.utils.book_append_sheet(wb, wsPay, "Payments");

        // Trigger Download
        const backupName = `Siddhi_Data_Backup_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, backupName);

        btn.innerHTML = '✅ Export Successful';
        setTimeout(() => {
            btn.innerHTML = origText;
            btn.disabled = false;
        }, 3000);

    } catch (e) {
        console.error("Export Error: ", e);
        alert('Failed to export data: ' + e.message);
        const btn = document.querySelector('[onclick="exportAllDataToExcel()"]');
        if (btn) {
            btn.innerHTML = '❌ Export Failed';
            btn.disabled = false;
        }
    }
}

async function importExcelData() {
    const fileInput = document.getElementById('import-excel-file');
    const file = fileInput.files[0];
    if (!file) {
        alert("Please select an Excel (.xlsx) file to upload.");
        return;
    }

    if (typeof XLSX === 'undefined') {
        alert("Excel library is not loaded. Please refresh.");
        return;
    }

    const btn = document.querySelector('[onclick="importExcelData()"]');
    const origText = btn.innerHTML;
    btn.innerHTML = '⏳ Processing Data...';
    btn.disabled = true;

    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // Extraction Helpers
                const getSheetData = (sheetName) => {
                    const ws = workbook.Sheets[sheetName];
                    return ws ? XLSX.utils.sheet_to_json(ws) : [];
                };

                const rawEmp = getSheetData("Employee");
                const rawAtt = getSheetData("Attendance");
                const rawAdv = getSheetData("advance");
                const rawPay = getSheetData("Payments");

                // Mapping functions from human-readable Excel headers back to DB JSON Schema
                const mapEmployees = rawEmp.map(r => ({
                    id: r["Employee ID"] ? r["Employee ID"].toString() : Date.now().toString() + Math.random().toString().slice(2, 6),
                    customId: r["Employee ID"],
                    name: r["Name"],
                    contact: r["Contact"],
                    designation: r["Designation"] || 'Worker',
                    salary: r["Daily Salary"] || 0,
                    normalHours: r["Standard Hours"],
                    slabBaseHours: r["Slab Hours"],
                    joiningDate: new Date().toISOString().split('T')[0]
                })).filter(e => e.name);

                const mapAttendance = rawAtt.map(r => ({
                    id: r["Record ID"] ? r["Record ID"].toString() : Date.now().toString() + Math.random().toString().slice(2, 6),
                    date: r["Date"],
                    employeeId: r["Employee ID"]?.toString(),
                    employeeName: r["Employee Name"],
                    timeIn: r["Time In"],
                    timeOut: r["Time Out"],
                    workedHours: r["Worked Hours"] || 0,
                    fare: r["Calculated Fare"] || 0
                })).filter(a => a.employeeId && a.date);

                const mapAdvances = rawAdv.map(r => ({
                    id: r["Record ID"] ? r["Record ID"].toString() : Date.now().toString() + Math.random().toString().slice(2, 6),
                    date: r["Date"],
                    employeeId: r["Employee ID"]?.toString(),
                    amount: r["Amount"],
                    deductionMonth: r["Deduction Month"] || null,
                    mode: r["Mode"] || 'Cash',
                    notes: r["Notes"] || ''
                })).filter(a => a.employeeId && a.amount);

                const mapPayments = rawPay.map(r => ({
                    id: r["Record ID"] ? r["Record ID"].toString() : Date.now().toString() + Math.random().toString().slice(2, 6),
                    date: r["Date"],
                    employeeId: r["Employee ID"]?.toString(),
                    salaryMonth: r["Salary Month"],
                    amount: r["Amount"],
                    mode: r["Mode"] || 'Cash',
                    notes: r["Notes"] || ''
                })).filter(p => p.employeeId && p.amount);

                const payload = {
                    employees: mapEmployees,
                    attendance: mapAttendance,
                    advances: mapAdvances,
                    payments: mapPayments
                };

                const res = await fetch(`${API_URL}/settings/import-data`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const apiData = await res.json();

                if (res.ok && apiData.success) {
                    alert(`✅ Import Successful!\n\nEmployees: ${apiData.results.employees}\nAttendance: ${apiData.results.attendance}\nAdvances: ${apiData.results.advances}\nPayments: ${apiData.results.payments}`);
                    fileInput.value = "";
                    loadSettingsForm(); // refresh stats
                } else {
                    throw new Error(apiData.error || "Unknown error during import");
                }
            } catch (err) {
                console.error("Parse/Import Error:", err);
                alert("Import failed: " + err.message);
            } finally {
                btn.innerHTML = origText;
                btn.disabled = false;
            }
        };

        reader.readAsArrayBuffer(file);

    } catch (e) {
        console.error("File Read Error:", e);
        alert("Failed to read file.");
        btn.innerHTML = origText;
        btn.disabled = false;
    }
}


// --- DASHBOARD ---
async function loadDashboard() {
    // 1. Fetch all data
    await fetchHolidays();
    try {
        const [empRes, attRes, advRes, payRes] = await Promise.all([
            fetch(`${API_URL}/employees`),
            fetch(`${API_URL}/attendance`),
            fetch(`${API_URL}/advances`),
            fetch(`${API_URL}/payments`)
        ]);

        if (!empRes.ok || !attRes.ok || !advRes.ok || !payRes.ok) {
            throw new Error("Failed to fetch data from server");
        }

        employeesData = await empRes.json();
        if (!Array.isArray(employeesData)) employeesData = [];
        employeesData.sort((a, b) => a.name.localeCompare(b.name));

        attendanceData = await attRes.json();
        if (!Array.isArray(attendanceData)) attendanceData = [];

        advancesData = await advRes.json();
        if (!Array.isArray(advancesData)) advancesData = [];

        const payData = await payRes.json();
        const paymentsData = Array.isArray(payData) ? payData : [];
    } catch (e) {
        console.error("Dashboard Load Error (Detailed):", e);
        const container = document.getElementById('employee-cards-container');
        if (container) {
            container.innerHTML =
                `<div class="card" style="grid-column: 1/-1; border-color: var(--danger); background: #fee2e2; color: #b91c1c; padding: 1.5rem; text-align: center;">
                    <h4 style="margin:0 0 0.5rem 0;">⚠️ Error Loading Data</h4>
                    <p style="margin:0; font-size: 0.9rem;">Please ensure the server is running and database connection is active. <br> <small>${e.message}</small></p>
                    <button class="btn btn-primary" style="margin-top: 1rem;" onclick="loadDashboard()">Retry</button>
                </div>`;
        }
        return;
    }

    // 2. Stats Calculation
    document.getElementById('dash-total-emp').innerText = employeesData.length;

    const today = new Date().toISOString().split('T')[0];
    const todaysAtt = attendanceData.filter(a => a.date === today).length;
    document.getElementById('dash-today-att').innerText = todaysAtt;

    // Filter Logic
    let filterMonth = document.getElementById('dashboard-month-filter').value;
    if (!filterMonth) {
        filterMonth = today.substring(0, 7);
        document.getElementById('dashboard-month-filter').value = filterMonth;
    }

    const currentMonth = filterMonth;
    document.querySelector('#dash-curr-payroll').previousElementSibling.innerText = `Total Payroll (${new Date(filterMonth + '-01').toLocaleString('default', { month: 'long' })})`;
    document.querySelector('#dash-advances').previousElementSibling.innerText = `Total Advances (${new Date(filterMonth + '-01').toLocaleString('default', { month: 'long' })})`;

    // Quick client-side payroll calc for dashboard stat (Filtered by Month)
    let totalPayroll = 0;
    employeesData.forEach(emp => {
        const empAtt = attendanceData.filter(a => a.employeeId === emp.id && a.date.startsWith(currentMonth));
        let empEarned = 0;
        empAtt.forEach(att => {
            const wh = parseFloat(att.workedHours);
            if (isNaN(wh)) return;

            const sal = parseFloat(emp.salary);
            const hourly = sal / globalSettings.standardHours;
            if (att.slabMode && wh > globalSettings.standardHours) {
                const slabRate = sal / globalSettings.slabHours;
                empEarned += (hourly * globalSettings.standardHours) + (slabRate * (wh - globalSettings.standardHours));
            } else {
                empEarned += hourly * wh;
            }
            empEarned += (parseFloat(att.fare) || 0);
        });
        totalPayroll += empEarned;
    });

    const totalAdvances = advancesData.filter(a => {
        const advDate = new Date(a.date);
        const dedMonth = a.deductionMonth || a.date.substring(0, 7);
        return dedMonth === currentMonth;
    }).reduce((sum, a) => sum + a.amount, 0);

    // Calculate Total Pending Dues (Monthly Net Payable)
    // Formula per user request: Total Payroll (Month) - Total Advances (Month)
    // Note: This effectively shows "Net Salary Payable" for the month.
    let totalPendingDues = totalPayroll - totalAdvances;

    // Also subtract payments made this month to show meaningful "Pending" (Remaining) amount?
    // User specifically asked for "subtraction of Total Payroll (January)-Total Advances (January)".
    // So distinct Payroll - Advances is the base request. 
    // However, usually "Pending" implies unpaid. Let's start with their formula.
    // To be safe, I'll calculate it as Net Payable for the month.

    // If we want "True Pending" (unpaid), we should also subtract payments.
    // const totalPaymentsMonth = paymentsData.filter(p => p.salaryMonth === currentMonth).reduce((sum, p) => sum + p.amount, 0);
    // totalPendingDues -= totalPaymentsMonth;

    // BUT the user said "its adding both", implying they want the difference strictly. I will assume they mean Net Payable.
    // If they want 'Remaining Dues', they would ask to subtract payments.
    // I will stick to: Payroll - Advances.

    document.getElementById('dash-curr-payroll').innerText = '₹' + Math.round(totalPayroll).toLocaleString();

    // Update Pending Dues Label to show Month
    const pendingLabel = document.getElementById('dash-pending-dues').previousElementSibling;
    if (pendingLabel) {
        pendingLabel.innerText = `Total Net Payable (${new Date(filterMonth + '-01').toLocaleString('default', { month: 'long' })})`;
    }
    document.getElementById('dash-pending-dues').innerText = '₹' + Math.round(totalPendingDues).toLocaleString();

    document.getElementById('dash-advances').innerText = '₹' + Math.round(totalAdvances).toLocaleString();

    // 3. Render Employee Cards
    renderEmployeeCards();

    // 4. Populate Quick Settings inputs
    document.getElementById('quick-std-hours').value = globalSettings.standardHours;
    document.getElementById('quick-slab-hours').value = globalSettings.slabHours;
}

async function saveQuickSettings() {
    const std = parseFloat(document.getElementById('quick-std-hours').value);
    const slab = parseFloat(document.getElementById('quick-slab-hours').value);

    if (isNaN(std) || isNaN(slab)) {
        alert('Please enter valid numbers');
        return;
    }

    const newSettings = { ...globalSettings, standardHours: std, slabHours: slab };

    await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
    });

    globalSettings = newSettings;
    await loadDashboard(); // Re-calculate
    alert('Quick Settings Saved & Dashboard Updated!');
}

function renderEmployeeCards() {
    const container = document.getElementById('employee-cards-container');
    container.innerHTML = '';

    if (employeesData.length === 0) {
        container.innerHTML = '<p style="color:var(--gray); grid-column: 1/-1; text-align: center;">No employees found. Use "Manage Employees" to add one.</p>';
        return;
    }

    employeesData.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'dashboard-card';
        card.style.cssText = `
            background: var(--white); padding: 1.5rem; border-radius: 12px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;
            cursor: pointer; transition: all 0.2s;
        `;
        card.onmouseover = () => { card.style.transform = 'translateY(-2px)'; card.style.borderColor = 'var(--primary)'; };
        card.onmouseout = () => { card.style.transform = 'translateY(0)'; card.style.borderColor = '#e2e8f0'; };
        card.onclick = () => openEmployeeModal(emp.id);

        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 0.5rem;">
                <div style="width: 40px; height: 40px; background: #e0e7ff; color: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem;">
                    ${emp.name.charAt(0)}
                </div>
                <div>
                    <div style="font-weight: bold; font-size: 1.1rem;">${emp.name}</div>
                    <div style="font-size: 0.85rem; color: var(--gray);">${emp.contact}</div>
                </div>
            </div>
            <div style="font-size: 0.85rem; color: var(--primary); margin-top: 10px; font-weight: 500;">
                Click to view details &rarr;
            </div>
        `;
        container.appendChild(card);
    });
}

// --- HOLIDAY LOGIC ---
async function markHoliday() {
    const dateInput = document.getElementById('holiday-date-picker');
    const date = dateInput.value;
    if (!date) return alert('Please select a date');

    if (holidays.includes(date)) {
        alert('This date is already a holiday!');
        return;
    }

    if (!confirm(`Mark ${date} as a global holiday?`)) return;

    holidays.push(date);
    await syncHolidays();

    alert('Holiday Marked!');
    dateInput.value = '';
    loadDashboard();
}

async function syncHolidays() {
    await fetch(`${API_URL}/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holidays)
    });
}

function openHolidayModal() {
    document.getElementById('holiday-modal').style.display = 'flex';
    renderHolidayList();
}

function renderHolidayList() {
    const tbody = document.getElementById('holiday-list-body');
    tbody.innerHTML = '';

    // Sort holidays desc
    const sorted = [...holidays].sort((a, b) => new Date(b) - new Date(a));

    sorted.forEach(date => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Date">${date}</td>
            <td data-label="Action">
                <button class="btn" style="background: var(--danger); color: white; padding: 0.25rem 0.5rem;" onclick="deleteHoliday('${date}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteHoliday(date) {
    if (!confirm(`Remove ${date} from holidays?`)) return;
    holidays = holidays.filter(h => h !== date);
    await syncHolidays();
    renderHolidayList();
    loadDashboard(); // Refresh stats
}

// --- MODAL LOGIC ---
let currentModalEmpId = null;

// --- PDF LOGIC ---
// --- PDF LOGIC ---
function convertNumberToWords(amount) {
    if (amount < 0) return "Negative " + convertNumberToWords(Math.abs(amount));
    if (amount === 0) return "Zero";

    const words = new Array();
    words[0] = '';
    words[1] = 'One';
    words[2] = 'Two';
    words[3] = 'Three';
    words[4] = 'Four';
    words[5] = 'Five';
    words[6] = 'Six';
    words[7] = 'Seven';
    words[8] = 'Eight';
    words[9] = 'Nine';
    words[10] = 'Ten';
    words[11] = 'Eleven';
    words[12] = 'Twelve';
    words[13] = 'Thirteen';
    words[14] = 'Fourteen';
    words[15] = 'Fifteen';
    words[16] = 'Sixteen';
    words[17] = 'Seventeen';
    words[18] = 'Eighteen';
    words[19] = 'Nineteen';
    words[20] = 'Twenty';
    words[30] = 'Thirty';
    words[40] = 'Forty';
    words[50] = 'Fifty';
    words[60] = 'Sixty';
    words[70] = 'Seventy';
    words[80] = 'Eighty';
    words[90] = 'Ninety';
    amount = amount.toString();
    const atemp = amount.split(".");
    const number = atemp[0].split(",").join("");
    const n_length = number.length;
    let words_string = "";
    if (n_length <= 9) {
        const n_array = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0);
        const received_n_array = new Array();
        for (let i = 0; i < n_length; i++) {
            received_n_array[i] = number.substr(i, 1);
        }
        for (let i = 9 - n_length, j = 0; i < 9; i++, j++) {
            n_array[i] = received_n_array[j];
        }
        for (let i = 0, j = 1; i < 9; i++, j++) {
            if (i == 0 || i == 2 || i == 4 || i == 7) {
                if (n_array[i] == 1) {
                    n_array[j] = 10 + parseInt(n_array[j]);
                    n_array[i] = 0;
                }
            }
        }
        let value = "";
        for (let i = 0; i < 9; i++) {
            if (i == 0 || i == 2 || i == 4 || i == 7) {
                value = n_array[i] * 10;
            } else {
                value = n_array[i];
            }
            if (value != 0) {
                words_string += words[value] + " ";
            }
            if ((i == 1 && value != 0) || (i == 0 && value != 0 && n_array[i + 1] == 0)) {
                words_string += "Crores ";
            }
            if ((i == 3 && value != 0) || (i == 2 && value != 0 && n_array[i + 1] == 0)) {
                words_string += "Lakhs ";
            }
            if ((i == 5 && value != 0) || (i == 4 && value != 0 && n_array[i + 1] == 0)) {
                words_string += "Thousand ";
            }
            if (i == 6 && value != 0 && (n_array[i + 1] != 0 && n_array[i + 2] != 0)) {
                words_string += "Hundred and ";
            } else if (i == 6 && value != 0) {
                words_string += "Hundred ";
            }
        }
        words_string = words_string.split("  ").join(" ");
    }
    return words_string + " Rupees Only";
}

async function downloadPayslipPDF() {
    try {
        if (!currentModalEmployee) return;

        // Ensure library is loaded
        if (!window.jspdf) {
            alert("PDF Library (jsPDF) not loaded. Please check your internet connection and refresh.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const empId = currentModalEmployee.id;
        const month = document.getElementById('modal-month-picker').value;

        // Fetch latest payments to ensure accuracy
        const payRes = await fetch(`${API_URL}/payments`);
        const allPayments = await payRes.json();
        const payments = allPayments.filter(p => p.employeeId === empId && p.salaryMonth === month);
        const emp = currentModalEmployee;

        const cleanNum = (str) => parseFloat(String(str).replace(/[^0-9.-]+/g, '')) || 0;

        // --- 1. DATA CALCULATION ---
        const att = attendanceData.filter(a => a.employeeId === empId && a.date.startsWith(month));
        const adv = advancesData.filter(a => a.employeeId === empId && (a.deductionMonth || a.date.substring(0, 7)) === month);

        let basicPay = 0;
        let otPay = 0;
        let totalHours = 0;
        let totalNormalHours = 0;
        let totalOTHours = 0;
        let totalFare = 0;

        const normalHourlyRate = emp.salary / globalSettings.standardHours;
        const slabHourlyRate = emp.salary / globalSettings.slabHours;

        att.forEach(a => {
            const wh = parseFloat(a.workedHours);
            totalHours += wh;
            totalFare += parseFloat(a.fare || 0);

            if (a.slabMode && wh > globalSettings.standardHours) {
                // Split: Normal Hours get Normal Rate, Extra Hours get Slab Rate
                const normalPart = normalHourlyRate * globalSettings.standardHours;
                const extraPart = slabHourlyRate * (wh - globalSettings.standardHours);
                basicPay += normalPart;
                otPay += extraPart;
                totalNormalHours += globalSettings.standardHours;
                totalOTHours += (wh - globalSettings.standardHours);
            } else {
                // All hours are at normal rate
                basicPay += normalHourlyRate * wh;
                totalNormalHours += wh;
            }
        });

        const totalEarned = basicPay + otPay + totalFare;
        const totalAdv = adv.reduce((sum, a) => sum + a.amount, 0);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

        // Fetch Previous Balance from Server (Source of Truth)
        // We need to fetch the payroll object for this employee/month to get the exact previous balance
        let previousBalance = 0;
        try {
            const payrollRes = await fetch(`${API_URL}/payroll?month=${month}`);
            const payrollList = await payrollRes.json();
            const empPayroll = payrollList.find(p => p.employee.id === empId);
            if (empPayroll) {
                previousBalance = empPayroll.previousBalance || 0;
            }
        } catch (e) {
            console.warn("Could not fetch previous balance for PDF", e);
        }

        const netPayable = totalEarned - totalAdv + previousBalance;
        const remainingDue = netPayable - totalPaid;

        // Amount in words: Use Total Earned OR Net Payable? Standard is Net Payable (after advances)
        // But since we are showing payments, we should probably show the Net Payable amount in words
        // If fully paid, remaining is 0. 
        const amountInWords = convertNumberToWords(Math.round(netPayable));
        const presentDays = att.length;

        // --- 2. HEADER & LOGO ---
        try {
            // Vertical Logo Watermark
            const wImg = new Image();
            wImg.src = 'assets/logo-vertical.jpg';
            await new Promise((resolve) => { wImg.onload = resolve; wImg.onerror = resolve; });

            if (wImg.complete && wImg.naturalHeight !== 0) {
                doc.saveGraphicsState();
                doc.setGState(new doc.GState({ opacity: 0.15 }));
                doc.addImage(wImg, 'JPEG', 35, 80, 140, 120);
                doc.restoreGraphicsState();
            }

        } catch (e) {
            console.warn("Logo add failed", e);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        // Keep Header Text as requested
        doc.text("SIDDHI ELECTRICALS", 105, 20, null, null, "center");

        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        // Removed Project / Site Line
        doc.text(`Salary Slip for the Month: ${month}`, 105, 28, null, null, "center");

        doc.line(14, 32, 196, 32); // Horizontal Line

        // --- 3. EMPLOYEE DETAILS ---
        doc.setFontSize(10);
        const leftX = 14;
        const rightX = 140;
        let currentY = 45;

        // Row 1
        doc.setFont("helvetica", "bold"); doc.text("Employee Name:", leftX, currentY);
        doc.setFont("helvetica", "normal"); doc.text(emp.name, leftX + 35, currentY);

        doc.setFont("helvetica", "bold"); doc.text("Employee ID:", rightX, currentY);
        const displayId = emp.customId ? emp.customId : String(emp.id).substring(0, 6);
        doc.setFont("helvetica", "normal"); doc.text(displayId, rightX + 25, currentY);

        currentY += 6;

        // Row 2
        doc.setFont("helvetica", "bold"); doc.text("Designation:", leftX, currentY);
        const displayDesignation = emp.designation ? emp.designation : "Electrician/Helper";
        doc.setFont("helvetica", "normal"); doc.text(displayDesignation, leftX + 35, currentY);

        doc.setFont("helvetica", "bold"); doc.text("Days Present:", rightX, currentY);
        doc.setFont("helvetica", "normal"); doc.text(String(presentDays), rightX + 25, currentY);

        currentY += 6;

        // Row 3
        doc.setFont("helvetica", "bold"); doc.text("Daily Salary:", leftX, currentY);
        doc.setFont("helvetica", "normal"); doc.text(`Rs. ${emp.salary}`, leftX + 35, currentY);

        doc.setFont("helvetica", "bold"); doc.text("Hourly Rate:", rightX, currentY);
        doc.setFont("helvetica", "normal"); doc.text(`Rs. ${normalHourlyRate.toFixed(2)}`, rightX + 25, currentY);

        currentY += 6;

        // Row 4
        doc.setFont("helvetica", "bold"); doc.text("Normal Hours:", leftX, currentY);
        doc.setFont("helvetica", "normal"); doc.text(`${totalNormalHours.toFixed(2)} hrs`, leftX + 35, currentY);

        doc.setFont("helvetica", "bold"); doc.text("OT Hours:", rightX, currentY);
        doc.setFont("helvetica", "normal"); doc.text(`${totalOTHours.toFixed(2)} hrs`, rightX + 25, currentY);

        currentY += 6;

        // Row 5
        doc.setFont("helvetica", "bold"); doc.text("Total Hours:", leftX, currentY);
        doc.setFont("helvetica", "normal"); doc.text(`${totalHours.toFixed(2)} hrs`, leftX + 35, currentY);

        doc.line(14, currentY + 4, 196, currentY + 4);

        // --- 4. EARNINGS & DEDUCTIONS TABLE ---
        const tableY = 75;
        doc.setFontSize(10);

        // Calculate Dynamic Height (Include Payments if any?? No, payments go in summary usually, or separate table)
        // Keeping logic: Earnings | Deductions (Advances)
        const earningsRows = 3; // Basic, OT, Fare
        const deductionRows = Math.max(1, adv.length);
        const maxRows = Math.max(earningsRows, deductionRows);
        const rowHeight = 8;
        const headerHeight = 8;
        const paddingBottom = 6;
        const tableHeight = headerHeight + (maxRows * rowHeight) + paddingBottom;

        // Headers
        doc.setFillColor(240, 240, 240);
        doc.rect(14, tableY, 91, headerHeight, 'F');
        doc.rect(105, tableY, 91, headerHeight, 'F');

        doc.setFont("helvetica", "bold");
        doc.text("EARNINGS", 18, tableY + 6);
        doc.text("AMOUNT", 95, tableY + 6, null, null, "right");
        doc.text("DEDUCTIONS", 109, tableY + 6);
        doc.text("AMOUNT", 186, tableY + 6, null, null, "right");

        // Content
        let contentY = tableY + 14;
        doc.setFont("helvetica", "normal");

        // Earnings (Fixed)
        doc.text("Basic Salary", 18, contentY);
        doc.text(basicPay.toFixed(2), 95, contentY, null, null, "right");

        doc.text("Overtime", 18, contentY + 8);
        doc.text(otPay.toFixed(2), 95, contentY + 8, null, null, "right");

        doc.text("Travel / Fare", 18, contentY + 16);
        doc.text(totalFare.toFixed(2), 95, contentY + 16, null, null, "right");

        // Deductions (Advances Loop)
        let dedY = contentY;
        if (adv.length > 0) {
            adv.forEach(a => {
                const d = a.date.split('-');
                doc.text(`Adv (${d[2]}/${d[1]})`, 109, dedY);
                doc.text(a.amount.toFixed(2), 186, dedY, null, null, "right");
                dedY += 8;
            });
        } else {
            doc.text("No Deductions", 109, dedY);
        }

        // Boxes
        doc.rect(14, tableY, 91, tableHeight); // Earnings Box
        doc.rect(105, tableY, 91, tableHeight); // Deductions Box

        // Totals Row
        const totalY = tableY + tableHeight;
        doc.setFont("helvetica", "bold");
        doc.rect(14, totalY, 91, 10);
        doc.text("Total Earnings", 18, totalY + 7);
        doc.text(`Rs. ${Math.round(totalEarned)}`, 95, totalY + 7, null, null, "right");

        doc.rect(105, totalY, 91, 10);
        doc.text("Total Deductions", 109, totalY + 7);
        doc.text(`Rs. ${totalAdv.toFixed(2)}`, 186, totalY + 7, null, null, "right"); // Only advances here

        // --- PREVIOUS BALANCE ROW (Added Padding & Box) ---
        const prevBalPaddingTop = 15;
        const prevBalY = totalY + 10 + prevBalPaddingTop; // Total Row is 10 high

        // Previous Balance Box (Light Background)
        doc.setFillColor(248, 250, 252); // Very light gray/blue
        doc.setDrawColor(226, 232, 240); // Soft border
        doc.rect(14, prevBalY - 6, 182, 10, 'FD'); // Fill and Draw

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Previous Balance:", 18, prevBalY + 1);

        // Choose color based on sign
        if (previousBalance < 0) doc.setTextColor(220, 38, 38); // Red
        else if (previousBalance > 0) doc.setTextColor(16, 185, 129); // Green

        doc.text(`Rs. ${previousBalance}`, 186, prevBalY + 1, null, null, "right"); // Aligned with Amount
        doc.setTextColor(0, 0, 0); // Reset

        // --- 5. NET PAYABLE & PAYMENT SUMMARY ---
        const summaryY = prevBalY + 15; // Consistent padding below Prev Bal

        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("Net Payable (Earnings - Deductions + Prev):", 14, summaryY);
        doc.setFontSize(13);
        doc.text(`Rs. ${Math.round(netPayable)}`, 105, summaryY);

        // Add Payments Section
        let paymentY = summaryY + 12;

        if (payments.length > 0) {
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("Less: Salary Payments:", 14, paymentY);
            doc.setFont("helvetica", "normal");

            paymentY += 6; // Initial gap

            payments.forEach(p => {
                // align details nicely
                const payDetail = `Paid (${p.date.split('-').reverse().slice(0, 2).join('/')}) [${p.mode}]`;
                doc.text(payDetail, 60, paymentY);
                doc.text(`(-) Rs. ${p.amount}`, 140, paymentY, null, null, "right");
                paymentY += 6;
            });

            // Line above Net Balance
            doc.setLineWidth(0.5);
            doc.line(14, paymentY + 2, 140, paymentY + 2);
            paymentY += 8;

            doc.setFont("helvetica", "bold");
            doc.text("Net Balance Due:", 14, paymentY);

            // Fix Floating Point Errors (e.g. -0.05 -> 0)
            let finalDue = remainingDue;
            if (Math.abs(finalDue) < 1) finalDue = 0;
            else finalDue = Math.round(finalDue);

            doc.setFontSize(14);
            const dueColor = finalDue <= 0 ? [16, 185, 129] : [220, 38, 38]; // Green if paid, Red if due
            doc.setTextColor(dueColor[0], dueColor[1], dueColor[2]);
            doc.text(`Rs. ${finalDue}`, 140, paymentY, null, null, "right");
            doc.setTextColor(0, 0, 0); // Reset
        } else {
            // No payments made yet
            doc.setFont("helvetica", "bold");
            doc.text("Net Balance Due:", 14, paymentY);
            doc.setFontSize(14);
            doc.setTextColor(220, 38, 38);
            doc.text(`Rs. ${Math.round(netPayable)}`, 140, paymentY, null, null, "right");
            doc.setTextColor(0, 0, 0); // Reset
        }

        // Amount in Words
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.text(`Amount in Words: ${amountInWords}`, 14, paymentY + 12);

        // --- 6. FOOTER ---
        const finalY = paymentY + 35;

        // Signatures
        doc.setFont("helvetica", "normal");
        doc.line(14, finalY, 60, finalY);
        doc.text("Employee Signature", 20, finalY + 5);

        doc.line(140, finalY, 190, finalY);
        doc.text("Authorized Signatory", 145, finalY + 5);

        doc.setFontSize(8);
        doc.text("This is a computer-generated payslip.", 105, finalY + 20, null, null, "center");

        // --- STAMP ---
        if (remainingDue <= 0.5) { // Looser check for float errors
            // Find last payment date
            const lastPayDate = payments.length > 0 ? payments.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date : '';
            const formattedDate = lastPayDate.split('-').reverse().join('/');

            // Status Text
            doc.setFontSize(12);
            doc.setTextColor(16, 185, 129); // Green
            doc.setFont("helvetica", "bold");
            doc.text(`Status: SETTLED on ${formattedDate}`, 14, paymentY + 22); // Below Amount in Words

            // VISUAL STAMP


            // Redraw Box/Text cleaner manually
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.4 }));
            doc.setTextColor(16, 185, 129);
            doc.setDrawColor(16, 185, 129);
            doc.setFontSize(30);

            // Translate to stamp position to rotate easily
            const sX = 150;
            const sY = summaryY + 15;

            const angle = -15;
            const rad = angle * (Math.PI / 180);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            // We will just draw it casually over the Deduction Summary area
            doc.text("PAID", sX, sY, { angle: -15 });

            // Draw a rounded rect around it? 
            // Just text is often enough for digital stamps, but let's try a box
            // We'll skip the box to avoid alignment headaches, a big bold PAID is standard.
            doc.restoreGraphicsState();
        }

        doc.save(`Payslip_${emp.name}_${month}.pdf`);
    } catch (err) {
        console.error("PDF Generation Error:", err);
        alert("Error generating PDF. Please try again.\n" + err.message);
    }
}

function openEmployeeModal(empId) {
    currentModalEmployee = employeesData.find(e => e.id === empId); // Set Global
    if (!currentModalEmployee) return;

    document.getElementById('modal-emp-name').innerText = currentModalEmployee.name;

    // Populate Details
    const hourly = (currentModalEmployee.salary / globalSettings.standardHours).toFixed(2);
    document.getElementById('modal-emp-details').innerHTML = `
        ID: <strong>${currentModalEmployee.customId || '-'}</strong> &nbsp;|&nbsp; 
        Designation: <strong>${currentModalEmployee.designation || 'Worker'}</strong> &nbsp;|&nbsp; 
        Daily Salary: <strong>₹${currentModalEmployee.salary}</strong> &nbsp;|&nbsp; 
        Hourly Rate: <strong>₹${hourly}</strong>
    `;

    // Default to current month
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    document.getElementById('modal-month-picker').value = monthStr;
    currentModalMonth = monthStr; // Set Global

    document.getElementById('emp-detail-modal').style.display = 'flex';
    updateModalData();
}

function closeModal() {
    document.getElementById('emp-detail-modal').style.display = 'none';
}

async function updateModalData() {
    if (!currentModalEmployee) return;

    const monthInput = document.getElementById('modal-month-picker');
    currentModalMonth = monthInput.value; // Sync Global

    const emp = currentModalEmployee;
    const month = currentModalMonth;

    // Fetch ALL data fresh to ensure modal is accurate
    // (Optimization: In a real app, we'd filter on server, but here we fetch all and filter client side)
    const [attRes, advRes, payRes] = await Promise.all([
        fetch(`${API_URL}/attendance`),
        fetch(`${API_URL}/advances`),
        fetch(`${API_URL}/payments`)
    ]);

    // Update Globals so exportToCSV works
    attendanceData = await attRes.json();
    advancesData = await advRes.json();
    paymentsData = await payRes.json(); // Wait, check if paymentsData global exists? It was 'payments' variable in scope. 
    // I need to check global declarations at top of file.

    const allAttendance = attendanceData;
    const allAdvances = advancesData;
    const allPayments = paymentsData;

    // Filter Data for Specific Employee and Month
    const att = allAttendance.filter(a => a.employeeId === emp.id && a.date.startsWith(month));
    const adv = allAdvances.filter(a => a.employeeId === emp.id && (a.deductionMonth || a.date.substring(0, 7)) === month);
    const payments = allPayments.filter(p => p.employeeId === emp.id && p.salaryMonth === month);

    // Calculate Stats
    const year = parseInt(month.split('-')[0]);
    const mon = parseInt(month.split('-')[1]);
    const daysInMonth = new Date(year, mon, 0).getDate();

    // Count holidays in this month
    const hols = holidays.filter(h => h.startsWith(month)).length;

    const present = att.length;
    const workingDays = daysInMonth - hols;
    const absent = Math.max(0, workingDays - present);

    let earned = 0;
    let totalNormalHours = 0;
    let totalOTHours = 0;
    let totalBasePay = 0;
    let totalOTPay = 0;

    const attBody = document.getElementById('modal-att-body');
    attBody.innerHTML = '';

    // Sort Attendance by Date
    att.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(a => {
        const wh = parseFloat(a.workedHours);
        const sal = parseFloat(emp.salary);
        const normalRate = sal / globalSettings.standardHours;
        let dayPay = 0;
        let otLabel = '';

        if (a.slabMode && wh > globalSettings.standardHours) {
            const normalPart = normalRate * globalSettings.standardHours;
            const extraPart = (sal / globalSettings.slabHours) * (wh - globalSettings.standardHours);
            dayPay = normalPart + extraPart;
            otLabel = ' <span style="color:#d97706; font-weight:600; font-size:0.85em;">(OT)</span>';

            totalNormalHours += globalSettings.standardHours;
            totalOTHours += (wh - globalSettings.standardHours);
            totalBasePay += normalPart;
            totalOTPay += extraPart;
        } else {
            dayPay = normalRate * wh;
            totalNormalHours += wh;
            totalBasePay += dayPay;
        }

        earned += dayPay + (parseFloat(a.fare) || 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Date">${a.date} ${holidays.includes(a.date) ? '<span style="color:var(--danger)">(H)</span>' : ''}</td>
            <td data-label="In">${formatTimeTo12h(a.timeIn)}</td>
            <td data-label="Out">${formatTimeTo12h(a.timeOut)}</td>
            <td data-label="Hours">${wh.toFixed(2)}${otLabel}</td>
            <td data-label="Earned">₹${Math.round(dayPay)}</td>
        `;
        attBody.appendChild(tr);
    });

    const totalAdv = adv.reduce((sum, a) => sum + a.amount, 0);

    // Fetch Previous Balance
    let previousBalance = 0;
    try {
        const payrollRes = await fetch(`${API_URL}/payroll?month=${month}`);
        const payrollList = await payrollRes.json();
        const empPayroll = payrollList.find(p => p.employee.id === emp.id);
        if (empPayroll) {
            previousBalance = empPayroll.previousBalance || 0;
        }
    } catch (e) {
        console.warn("Could not fetch previous balance for modal", e);
    }

    const net = earned - totalAdv + previousBalance;
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const balance = Math.round(net - totalPaid);

    // Show Previous Balance in Modal
    // We'll inject it before the Payable Card or inside it
    const prevBalDiv = document.getElementById('modal-prev-balance');

    // Update New Cards
    document.getElementById('modal-normal-hours').innerText = totalNormalHours.toFixed(2);
    document.getElementById('modal-ot-hours').innerText = totalOTHours.toFixed(2);

    const payableLabel = document.querySelector('#modal-payable').previousElementSibling;
    if (payableLabel) {
        // Show breakdown in title
        payableLabel.innerText = "Net Payable";
        payableLabel.title = `Base: ₹${Math.round(totalBasePay)} + OT: ₹${Math.round(totalOTPay)} = Earned: ₹${Math.round(earned)}`;
    }



    document.getElementById('modal-present').innerText = present;
    document.getElementById('modal-absent').innerText = absent;

    // --- PREVIOUS BALANCE CARD ---
    const prevBalEl = document.getElementById('modal-prev-balance');
    const prevBalCard = document.getElementById('modal-card-prev');

    if (prevBalEl && prevBalCard) {
        if (previousBalance === 0) {
            prevBalEl.innerHTML = `<span style="color:inherit">-</span>`;
            prevBalCard.className = 'stat-card card-neutral';
        } else {
            const isNeg = previousBalance < 0;
            prevBalEl.innerHTML = `<span style="font-weight: bold;">${previousBalance > 0 ? '+' : ''}₹${previousBalance}</span>`;
            prevBalCard.className = `stat-card ${isNeg ? 'card-negative' : 'card-positive'}`;
        }
    }

    // Update Net Payable Card
    const payableEl = document.getElementById('modal-payable');
    const payableCard = payableEl.parentElement;
    const breakdownHtml = `<span style="font-size: 0.6em; display: block; color: inherit; opacity: 0.7; margin-top: 0.2rem; font-weight: normal;">(Earned: ₹${Math.round(totalBasePay)}+₹${Math.round(totalOTPay)})</span>`;

    if (balance <= 0 && totalPaid > 0) {
        payableEl.innerHTML = `<span style="font-weight: bold;">SETTLED</span> ${breakdownHtml}`;
        payableCard.className = 'stat-card card-positive';
    } else if (totalPaid > 0) {
        payableEl.innerHTML = `₹${balance} ${breakdownHtml} <div style="font-size:0.7em; opacity: 0.8; font-weight:normal">Due (Pd: ₹${totalPaid})</div>`;
        payableCard.className = 'stat-card card-warning';
    } else {
        payableEl.innerHTML = `₹${Math.round(net)} ${breakdownHtml}`;
        payableCard.className = 'stat-card card-neutral';
    }

    // Render Advance Body
    const advBody = document.getElementById('modal-adv-body');
    advBody.innerHTML = '';
    adv.forEach(a => {
        const tr = document.createElement('tr');
        const viewLink = a.screenshot ?
            (a.screenshot.toLowerCase().endsWith('.pdf') ?
                `<a href="${a.screenshot}" target="_blank" style="color: var(--secondary); text-decoration: none; font-weight: 500;">View</a>` :
                `<a href="#" onclick="showPreview('${a.screenshot}', 'Advance Payment', '${a.date}', '${a.amount}'); return false;" style="color: var(--secondary); text-decoration: none; font-weight: 500;">View</a>`)
            : '-';
        tr.innerHTML = `
            <td data-label="Date">${a.date}</td>
            <td data-label="Amount" style="color:var(--danger)">₹${a.amount}</td>
            <td data-label="Notes">${a.notes || '-'}</td>
            <td data-label="Proof">${viewLink}</td>
        `;
        advBody.appendChild(tr);
    });

    // Render Payment Body
    const payBody = document.getElementById('modal-pay-body');
    payBody.innerHTML = '';
    if (payments.length === 0) {
        payBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--gray);">No payments recorded yet</td></tr>';
    } else {
        payments.forEach(p => {
            const tr = document.createElement('tr');
            const viewLink = p.screenshot ?
                (p.screenshot.toLowerCase().endsWith('.pdf') ?
                    `<a href="${p.screenshot}" target="_blank" style="color: var(--secondary); text-decoration: none; font-weight: 500;">View</a>` :
                    `<a href="#" onclick="showPreview('${p.screenshot}', 'Salary Payment', '${p.date}', '${p.amount}'); return false;" style="color: var(--secondary); text-decoration: none; font-weight: 500;">View</a>`)
                : '-';

            tr.innerHTML = `
                <td data-label="Date">${p.date}</td>
                <td data-label="Mode">${p.mode}</td>
                <td data-label="Amount" style="color: #10b981; font-weight: bold;">₹${p.amount}</td>
                <td data-label="Proof">${viewLink}</td>
            `;
            payBody.appendChild(tr);
        });
    }
}

// --- EMPLOYEES (Updated with Global Settings) ---
async function loadEmployees() {
    const res = await fetch(`${API_URL}/employees`);
    employeesData = await res.json();
    employeesData.sort((a, b) => a.name.localeCompare(b.name));

    const tbody = document.getElementById('employee-table-body');
    tbody.innerHTML = '';

    employeesData.forEach(emp => {
        const tr = document.createElement('tr');
        const hourly = (emp.salary / globalSettings.standardHours).toFixed(2);
        tr.innerHTML = `
            <td data-label="Name">${emp.name}</td>
            <td data-label="Contact">${emp.contact}</td>
            <td data-label="Salary">₹${emp.salary}</td>
            <td data-label="Hourly Rate">₹${hourly}/hr</td>
            <td data-label="Actions">
                <div class="action-buttons">
                    <button class="btn" style="background: var(--warning); color: white; padding: 0.25rem 0.5rem;" onclick="editEmployee('${emp.id}')">✏️</button>
                    <button class="btn" style="background: var(--danger); color: white; padding: 0.25rem 0.5rem;" onclick="deleteEmployee('${emp.id}', \`${emp.name}\`)">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editEmployee(id) {
    const emp = employeesData.find(e => e.id === id);
    if (!emp) return;

    document.getElementById('emp-id').value = emp.id;
    document.getElementById('emp-name').value = emp.name;
    document.getElementById('emp-contact').value = emp.contact;
    document.getElementById('emp-salary').value = emp.salary;
    // New Fields
    document.getElementById('emp-custom-id').value = emp.customId || '';
    document.getElementById('emp-designation').value = emp.designation || '';
    document.getElementById('emp-password').value = emp.password || '123456';

    document.getElementById('emp-submit-btn').innerText = 'Update Employee';
    document.getElementById('emp-cancel-btn').style.display = 'inline-block';
    document.getElementById('employee-form').scrollIntoView({ behavior: 'smooth' });
}

function resetEmployeeForm() {
    document.getElementById('employee-form').reset();
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-submit-btn').innerText = 'Add Employee';
    document.getElementById('emp-cancel-btn').style.display = 'none';
}

async function deleteEmployee(id, name) {
    const confirmationText = `Delete ${name}`;
    const userInput = prompt(`⚠️ WARNING: IRREVERSIBLE ACTION ⚠️\n\nDeleting this employee will permanently erase ALL their Attendance, Advance Payments, and Uploads.\n\nTo confirm, type exactly: ${confirmationText}`);

    if (userInput !== confirmationText) {
        if (userInput !== null) {
            alert("Deletion cancelled. The text you typed did not match the confirmation exactly.");
        }
        return;
    }

    if (!confirm(`Are you absolutely sure you want to delete ${name} and completely wipe their history from the database?`)) return;

    try {
        await fetch(`${API_URL}/employees/${id}`, { method: 'DELETE' });
        loadEmployees();
        alert(`Successfully deleted ${name} and all associated records.`);
    } catch (err) {
        console.error("Deletion failed:", err);
        alert("Failed to delete employee: " + err.message);
    }
}

document.getElementById('employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('emp-id').value;
    const name = document.getElementById('emp-name').value.toUpperCase();
    const contact = document.getElementById('emp-contact').value;
    const salary = document.getElementById('emp-salary').value;
    const customId = document.getElementById('emp-custom-id').value;
    const designation = document.getElementById('emp-designation').value;
    const password = document.getElementById('emp-password').value || '123456';

    const payload = { name, contact, salary, customId, designation, password };

    if (id) {
        await fetch(`${API_URL}/employees/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        alert('Employee Updated!');
    } else {
        await fetch(`${API_URL}/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        alert('Employee Added!');
    }
    resetEmployeeForm();
    loadEmployees();
});

// --- ATTENDANCE ---
async function loadAttendanceForm() {
    const res = await fetch(`${API_URL}/employees`);
    const employees = await res.json();

    const select = document.getElementById('att-employee');
    const filterSelect = document.getElementById('att-filter-employee');
    const currentVal = select.value;
    const currentFilterVal = filterSelect ? filterSelect.value : '';

    select.innerHTML = '<option value="">Select Employee</option>';
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All Employees</option>';
    }

    // Sort Employees Alphabetically
    employees.sort((a, b) => a.name.localeCompare(b.name));

    employees.forEach(emp => {
        // Form Dropdown
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.dataset.salary = emp.salary;
        opt.innerText = emp.name;
        if (emp.id === currentVal) opt.selected = true;
        select.appendChild(opt);

        // Filter Dropdown
        if (filterSelect) {
            const fOpt = document.createElement('option');
            fOpt.value = emp.id; // Filter by ID
            fOpt.innerText = emp.name;
            if (emp.id === currentFilterVal) fOpt.selected = true;
            filterSelect.appendChild(fOpt);
        }
    });
}

async function markAttendance() {
    const employeeId = document.getElementById('att-employee').value;
    const date = document.getElementById('att-date').value || new Date().toISOString().split('T')[0];
    const timeIn = document.getElementById('att-in-time').value;
    const timeOut = document.getElementById('att-out-time').value;
    const empData = employeesData.find(e => e.id === employeeId);

    if (!employeeId || !timeIn || !timeOut) {
        alert('Please fill all fields (Employee, In Time, Out Time)');
        return;
    }

    // Calculate Hours
    const t1 = new Date(`2000-01-01T${timeIn}`);
    const t2 = new Date(`2000-01-01T${timeOut}`);
    let diff = (t2 - t1) / 1000 / 60 / 60;
    if (diff < 0) diff += 24; // Handle overnight? Assumes same day usually

    // Slab Mode Check (if worked > standardHours)
    // For now default to false unless we have a UI toggle. User didn't ask for toggle here yet.
    const slabMode = false;

    const payload = {
        employeeId,
        employeeName: empData ? empData.name : 'Unknown',
        date,
        timeIn,
        timeOut,
        workedHours: diff.toFixed(2),
        slabMode,
        fare: 0 // Default 0 for now
    };

    const res = await fetch(`${API_URL}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        // Clear times
        document.getElementById('att-in-time').value = '';
        document.getElementById('att-out-time').value = '';
        loadAttendanceTable();
    } else {
        alert('Failed to mark attendance');
    }
}

// Wrapper to load everything needed for the Attendance Section
async function loadAttendance() {
    // Populate dropdown
    await loadAttendanceForm();

    // Set Date Picker to today if empty
    if (!document.getElementById('att-date').value) {
        document.getElementById('att-date').valueAsDate = new Date();
    }

    // Set default times for faster entry
    if (!document.getElementById('att-time-in').value) {
        document.getElementById('att-time-in').value = '09:00';
    }
    if (!document.getElementById('att-time-out').value) {
        document.getElementById('att-time-out').value = '18:00';
    }

    // Load Table
    loadAttendanceTable();
}

async function loadAttendanceTable() {
    let dateInput = document.getElementById('att-filter-date').value;

    if (!dateInput) {
        const now = new Date();
        dateInput = now.toISOString().split('T')[0];
        document.getElementById('att-filter-date').value = dateInput;
    }

    const [attRes, empRes] = await Promise.all([
        fetch(`${API_URL}/attendance`),
        fetch(`${API_URL}/employees`)
    ]);
    attendanceData = await attRes.json();
    const employees = await empRes.json();
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

    const tbody = document.getElementById('attendance-table-body');
    tbody.innerHTML = '';

    const empFilter = document.getElementById('att-filter-employee') ? document.getElementById('att-filter-employee').value : '';

    const filtered = attendanceData
        .filter(a => a.date === dateInput)
        .filter(a => !empFilter || a.employeeId == empFilter)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; color: var(--gray); padding: 2rem;">No attendance records found for this selection.</td></tr>';
        return;
    }

    filtered.forEach(att => {
        const emp = empMap[att.employeeId];
        const empName = emp ? emp.name : att.employeeName + ' (Deleted)';
        const defaultSalary = emp ? emp.salary : 0;

        const dateObj = new Date(att.date);
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const formattedDate = `${att.date} (${dayNames[dateObj.getDay()]})`;

        const workedHours = att.workedHours ? parseFloat(att.workedHours) : null;
        const salary = parseFloat(defaultSalary);

        // Use Global Settings
        const normalRate = salary / globalSettings.standardHours;
        let computedPay = 0;

        if (workedHours !== null) {
            if (att.sundayMode) {
                computedPay = salary;
            } else if (att.slabMode && workedHours > globalSettings.standardHours) {
                const extraHours = workedHours - globalSettings.standardHours;
                const slabRate = salary / globalSettings.slabHours;
                computedPay = (normalRate * globalSettings.standardHours) + (slabRate * extraHours);
            } else {
                computedPay = normalRate * workedHours;
            }
        }

        const fare = parseFloat(att.fare || 0);
        const total = computedPay + fare;

        // Prepare Links HTML for IN
        let inLinks = '';
        if (att.checkInImage) {
            inLinks += `<a href="#" onclick="showPreview('${att.checkInImage}', 'In Photo', '${att.date}', ''); return false;" style="color:var(--secondary); text-decoration:none; display: block; margin-bottom:2px; font-size:0.85em;">📷 View</a>`;
        }
        if (att.checkInLoc) {
            let q = typeof att.checkInLoc === 'string' ? att.checkInLoc : `${att.checkInLoc.lat},${att.checkInLoc.lng}`;
            inLinks += `<a href="https://maps.google.com/?q=${q}" target="_blank" style="color:var(--primary); text-decoration:none; display: block; font-size:0.85em;">📍 Map</a>`;
        }
        if (!inLinks) inLinks = '<span style="color:var(--gray); font-size:0.8em">None</span>';

        // Prepare Links HTML for OUT
        let outLinks = '-';
        if (att.timeOut) {
            outLinks = '';
            if (att.checkOutImage) {
                outLinks += `<a href="#" onclick="showPreview('${att.checkOutImage}', 'Out Photo', '${att.date}', ''); return false;" style="color:var(--secondary); text-decoration:none; display: block; margin-bottom:2px; font-size:0.85em;">📷 View</a>`;
            }
            if (att.checkOutLoc) {
                let q = typeof att.checkOutLoc === 'string' ? att.checkOutLoc : `${att.checkOutLoc.lat},${att.checkOutLoc.lng}`;
                outLinks += `<a href="https://maps.google.com/?q=${q}" target="_blank" style="color:var(--primary); text-decoration:none; display: block; font-size:0.85em;">📍 Map</a>`;
            }
            if (!outLinks) outLinks = '<span style="color:var(--gray); font-size:0.8em">None</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Date">${formattedDate}</td>
            <td data-label="Employee" style="font-weight:500;">${empName}</td>
            <td data-label="Time In"><span style="font-weight:600; color:var(--dark)">${formatTimeTo12h(att.timeIn)}</span></td>
            <td data-label="In Links">${inLinks}</td>
            <td data-label="Time Out"><span style="font-weight:600; color:var(--dark)">${att.timeOut ? formatTimeTo12h(att.timeOut) : '-'}</span></td>
            <td data-label="Out Links">${outLinks}</td>
            <td data-label="Hrs">${workedHours !== null ? workedHours.toFixed(2) + 'h' : '-'}
                ${att.slabMode && workedHours > globalSettings.standardHours ? '<span style="color:var(--warning); font-size: 0.8em"> (OT)</span>' : ''}
                ${att.sundayMode ? '<span style="color:var(--success); font-size: 0.8em"> (S)</span>' : ''}
            </td>
            <td data-label="Mode">
                <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.75em; background: ${att.sundayMode ? '#fef08a; color: #854d0e' : (att.slabMode ? '#dcfce7; color: #166534' : '#e0e7ff; color: #3730a3')}">
                    ${att.sundayMode ? 'Sunday' : (att.slabMode ? 'Slab' : 'Norm')}
                </span>
            </td>
            <td data-label="Salary">${workedHours !== null ? '₹' + Math.round(computedPay) : '-'}</td>
            <td data-label="Fare">₹${fare}</td>
            <td data-label="Total" style="font-weight: bold">${workedHours !== null ? '₹' + Math.round(total) : '₹' + Math.round(fare)}</td>
            <td data-label="Action">
                <div class="action-buttons-stacked">
                    <button class="btn" style="background: var(--warning); color: white; padding: 0.25rem 0.5rem;" onclick="editAttendance('${att.id}')">✏️</button>
                    <button class="btn" style="background: var(--danger); color: white; padding: 0.25rem 0.5rem;" onclick="deleteAttendance('${att.id}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editAttendance(id) {
    const att = attendanceData.find(a => a.id === id);
    if (!att) return;
    document.getElementById('att-id').value = att.id;
    document.getElementById('att-date').value = att.date;
    document.getElementById('att-employee').value = att.employeeId;
    document.getElementById('att-slab-mode').checked = att.slabMode || false;
    document.getElementById('att-sunday-mode').checked = att.sundayMode || false;
    document.getElementById('att-time-in').value = att.timeIn;
    document.getElementById('att-time-out').value = att.timeOut;
    document.getElementById('att-fare').value = att.fare;
    calculatePreview();
    document.getElementById('att-submit-btn').innerText = 'Update Attendance';
    document.getElementById('att-cancel-btn').style.display = 'inline-block';
    document.getElementById('attendance-form').scrollIntoView({ behavior: 'smooth' });
}

function resetAttendanceForm(fullReset = true) {
    if (fullReset) {
        document.getElementById('attendance-form').reset();
        document.getElementById('att-id').value = '';
        const submitBtn = document.getElementById('att-submit-btn');
        submitBtn.innerText = 'Submit Attendance';
        submitBtn.disabled = false;
        submitBtn.style.background = '';
        document.getElementById('att-cancel-btn').style.display = 'none';
        document.getElementById('att-result').innerHTML = '';
        document.getElementById('att-date').valueAsDate = new Date();
        document.getElementById('att-time-in').value = '09:00';
        document.getElementById('att-time-out').value = '18:00';
        document.getElementById('att-slab-mode').checked = false;
        document.getElementById('att-sunday-mode').checked = false;
    } else {
        // Partial reset for fast entry of new records
        document.getElementById('att-id').value = '';
        document.getElementById('att-employee').value = '';
        const submitBtn = document.getElementById('att-submit-btn');
        submitBtn.innerText = 'Submit Attendance';
        submitBtn.disabled = false;
        submitBtn.style.background = '';
        document.getElementById('att-cancel-btn').style.display = 'none';

        // Auto-select next employee
        const empSelect = document.getElementById('att-employee');
        if (empSelect.selectedIndex < empSelect.options.length - 1) {
            empSelect.selectedIndex += 1;
            calculatePreview();
        } else {
            // Reached the end, reset back to 'Select Employee'
            empSelect.selectedIndex = 0;
            document.getElementById('att-result').innerHTML = '';
        }
    }
}

async function deleteAttendance(id) {
    if (!confirm('Delete this record?')) return;
    await fetch(`${API_URL}/attendance/${id}`, { method: 'DELETE' });
    loadAttendanceTable();
    loadDashboard();
}

function calculatePreview() {
    const timeIn = document.getElementById('att-time-in').value;
    const timeOut = document.getElementById('att-time-out').value;
    const empSelect = document.getElementById('att-employee');
    const slabMode = document.getElementById('att-slab-mode').checked;
    const sundayMode = document.getElementById('att-sunday-mode').checked;

    if (!timeIn || !timeOut || !empSelect.value) {
        document.getElementById('att-result').innerHTML = '';
        return;
    }

    const start = new Date(`1970-01-01T${timeIn}Z`);
    const end = new Date(`1970-01-01T${timeOut}Z`);
    let diffMs = end - start;
    if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000;
    const workedHours = diffMs / (1000 * 60 * 60);

    let salary = 0;
    if (empSelect.selectedOptions[0]) {
        salary = parseFloat(empSelect.selectedOptions[0].dataset.salary) || 0;
    }

    // Use Global Settings
    const normalRate = salary / globalSettings.standardHours;
    let computedPay = 0;

    if (sundayMode) {
        computedPay = salary;
    } else if (slabMode && workedHours > globalSettings.standardHours) {
        const extraHours = workedHours - globalSettings.standardHours;
        const slabRate = salary / globalSettings.slabHours;
        computedPay = (normalRate * globalSettings.standardHours) + (slabRate * extraHours);
    } else {
        computedPay = normalRate * workedHours;
    }

    document.getElementById('att-result').innerHTML = `
        Worked: ${workedHours.toFixed(2)} hrs <br>
        Est. Salary: ₹${Math.round(computedPay)}
    `;
    return workedHours.toFixed(2);
}

['att-time-in', 'att-time-out', 'att-slab-mode', 'att-sunday-mode', 'att-employee'].forEach(id => {
    document.getElementById(id).addEventListener('change', calculatePreview);
});

document.getElementById('attendance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const workedHours = calculatePreview();
    const id = document.getElementById('att-id').value;
    const date = document.getElementById('att-date').value;
    const employeeId = document.getElementById('att-employee').value;

    // Duplicate Check (only for new entries)
    if (!id) {
        const isDuplicate = attendanceData.some(a => a.employeeId == employeeId && a.date === date);
        if (isDuplicate) {
            alert(`Attendance already marked for this employee on ${date}.`);
            return;
        }
    }

    const data = {
        date: date,
        employeeId: employeeId,
        employeeName: document.getElementById('att-employee').selectedOptions[0].text,
        slabMode: document.getElementById('att-slab-mode').checked,
        sundayMode: document.getElementById('att-sunday-mode').checked,
        timeIn: document.getElementById('att-time-in').value,
        timeOut: document.getElementById('att-time-out').value,
        fare: document.getElementById('att-fare').value,
        workedHours: workedHours
    };

    const submitBtn = document.getElementById('att-submit-btn');
    const originalText = submitBtn.innerText;
    const originalBg = submitBtn.style.background;

    submitBtn.innerText = 'Saving...';
    submitBtn.disabled = true;

    try {
        if (id) {
            await fetch(`${API_URL}/attendance/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            submitBtn.innerText = 'Updated ✓';
            submitBtn.style.background = '#10b981'; // green
            setTimeout(() => {
                resetAttendanceForm(true); // Full reset after edit
            }, 800);
        } else {
            await fetch(`${API_URL}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            submitBtn.innerText = 'Marked ✓';
            submitBtn.style.background = '#10b981'; // green
            setTimeout(() => {
                resetAttendanceForm(false); // Partial reset for fast entry
                submitBtn.innerText = originalText;
                submitBtn.style.background = originalBg;
                submitBtn.disabled = false;
            }, 800);
        }

        loadAttendanceTable();
        loadDashboard();

    } catch (error) {
        console.error("Error saving attendance:", error);
        alert("Failed to save attendance.");
        submitBtn.innerText = originalText;
        submitBtn.style.background = originalBg;
        submitBtn.disabled = false;
    }
});

// --- ADVANCES ---
async function loadAdvanceForm() {
    const res = await fetch(`${API_URL}/employees`);
    const employees = await res.json();

    const select = document.getElementById('adv-employee');
    const filterSelect = document.getElementById('adv-filter-employee');
    const currentVal = select.value;
    const currentFilterVal = filterSelect ? filterSelect.value : '';

    select.innerHTML = '<option value="">Select Employee</option>';
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All Employees</option>';
    }

    employees.sort((a, b) => a.name.localeCompare(b.name));

    employees.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.textContent = emp.name;
        select.appendChild(opt);

        if (filterSelect) {
            const fOpt = document.createElement('option');
            fOpt.value = emp.id;
            fOpt.innerText = emp.name;
            filterSelect.appendChild(fOpt);
        }
    });

    if (currentVal) select.value = currentVal;
    if (filterSelect && currentFilterVal) filterSelect.value = currentFilterVal;

    // Defaults
    if (!document.getElementById('adv-date').value) {
        document.getElementById('adv-date').valueAsDate = new Date();
    }
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!document.getElementById('adv-deduction-month').value) {
        document.getElementById('adv-deduction-month').value = currentMonth;
    }

    loadAdvanceTable();
}

async function loadAdvanceTable() {
    let monthInput = document.getElementById('adv-filter-month');
    if (!monthInput.value) {
        const now = new Date();
        monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    let monthFilter = monthInput.value;
    const empFilter = document.getElementById('adv-filter-employee') ? document.getElementById('adv-filter-employee').value : '';

    const [advRes, empRes] = await Promise.all([
        fetch(`${API_URL}/advances`),
        fetch(`${API_URL}/employees`)
    ]);
    advancesData = await advRes.json();
    const employees = await empRes.json();
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

    // Filter Logic
    const filtered = advancesData
        .filter(a => !monthFilter || (a.deductionMonth || a.date.substring(0, 7)) === monthFilter)
        .filter(a => !empFilter || a.employeeId == empFilter);

    // Sort desc by date
    const sorted = filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    const tbody = document.getElementById('advance-table-body');
    tbody.innerHTML = '';

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--gray); padding: 2rem;">No advance records found for this selection.</td></tr>';
        return;
    }

    sorted.forEach(adv => {
        const empName = empMap[adv.employeeId] ? empMap[adv.employeeId].name : 'Unknown';
        const dedMonth = adv.deductionMonth || adv.date.substring(0, 7);
        const tr = document.createElement('tr');
        const viewLink = adv.screenshot ?
            (adv.screenshot.toLowerCase().endsWith('.pdf') ?
                `<a href="${adv.screenshot}" target="_blank" style="color: var(--secondary); text-decoration: none; font-weight: 500;">View</a>` :
                `<a href="#" onclick="showPreview('${adv.screenshot}', 'Advance Payment', '${adv.date}', '${adv.amount}'); return false;" style="color: var(--secondary); text-decoration: none; font-weight: 500;">View</a>`)
            : '-';

        tr.innerHTML = `
            <td data-label="Date">${adv.date}</td>
            <td data-label="Employee">${empName}</td>
            <td data-label="Amount" style="font-weight: bold; color: var(--danger)">₹${adv.amount}</td>
            <td data-label="Deduction Month">${dedMonth}</td>
            <td data-label="Mode">${adv.mode}</td>
            <td data-label="Notes">${adv.notes || '-'}</td>
            <td data-label="Screenshot">${viewLink}</td>
            <td data-label="Actions">
                <div class="action-buttons-stacked">
                    <button class="btn" style="background: var(--warning); color: white; padding: 0.25rem 0.5rem;" onclick="editAdvance('${adv.id}')">✏️</button>
                     <button class="btn" style="background: var(--danger); color: white; padding: 0.25rem 0.5rem;" onclick="deleteAdvance('${adv.id}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editAdvance(id) {
    const adv = advancesData.find(a => a.id === id);
    if (!adv) return;
    document.getElementById('adv-id').value = adv.id;
    document.getElementById('adv-employee').value = adv.employeeId;
    document.getElementById('adv-amount').value = adv.amount;
    document.getElementById('adv-date').value = adv.date;
    document.getElementById('adv-deduction-month').value = adv.deductionMonth || adv.date.substring(0, 7);
    document.getElementById('adv-mode').value = adv.mode;
    document.getElementById('adv-notes').value = adv.notes || '';
    document.getElementById('adv-submit-btn').innerText = 'Update Payment';
    document.getElementById('adv-cancel-btn').style.display = 'inline-block';
    document.getElementById('advance-form').scrollIntoView({ behavior: 'smooth' });
}

function resetAdvanceForm() {
    document.getElementById('advance-form').reset();
    document.getElementById('adv-id').value = '';
    document.getElementById('adv-submit-btn').innerText = 'Save Payment';
    document.getElementById('adv-cancel-btn').style.display = 'none';
    document.getElementById('adv-date').valueAsDate = new Date();
    const now = new Date();
    document.getElementById('adv-deduction-month').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function deleteAdvance(id) {
    if (!confirm("Delete this advance payment?")) return;
    await fetch(`${API_URL}/advances/${id}`, { method: 'DELETE' });
    loadAdvanceTable();
    loadDashboard();
}

document.getElementById('advance-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('adv-id').value;
    const formData = new FormData();
    formData.append('employeeId', document.getElementById('adv-employee').value);
    formData.append('amount', document.getElementById('adv-amount').value);
    formData.append('date', document.getElementById('adv-date').value);
    formData.append('deductionMonth', document.getElementById('adv-deduction-month').value);
    formData.append('mode', document.getElementById('adv-mode').value);
    formData.append('notes', document.getElementById('adv-notes').value);

    const fileInput = document.getElementById('adv-screenshot');
    if (fileInput.files[0]) {
        const compressed = await compressImage(fileInput.files[0]);
        formData.append('screenshot', compressed);
    }

    if (id) {
        await fetch(`${API_URL}/advances/${id}`, {
            method: 'PUT',
            body: formData
        });
        alert('Advance Updated!');
    } else {
        await fetch(`${API_URL}/advances`, {
            method: 'POST',
            body: formData
        });
        alert('Advance Saved!');
    }
    resetAdvanceForm();
    loadAdvanceTable();
});

// --- PAYROLL ---
// --- PAYROLL ---
// --- PAYROLL ---
// --- PAYROLL ---
async function loadPayroll() {
    let monthInput = document.getElementById('payroll-month').value;
    if (!monthInput) {
        const now = new Date();
        monthInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('payroll-month').value = monthInput;
    }

    const res = await fetch(`${API_URL}/payroll?month=${monthInput}`);
    const payroll = await res.json();

    const grid = document.getElementById('payroll-grid');
    grid.innerHTML = '';

    if (payroll.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--gray); padding: 2rem; background: var(--white); border-radius: 12px; border: 1px solid #e2e8f0;">No salary records found for this selection.</div>';
        return;
    }

    payroll.forEach(p => {
        // Fallbacks for undefined (in case server wasn't restarted)
        const paidTotal = p.paidTotal || 0;
        const remainingDue = p.remainingDue !== undefined ? p.remainingDue : p.finalPayable;
        const status = p.status || (paidTotal > 0 ? 'Partial' : 'Unpaid');
        const lastDate = p.lastPaymentDate ? p.lastPaymentDate.split('-').reverse().join('/') : '-';

        const statusColor = status === 'Settled' ? '#10b981' : (status === 'Partial' ? '#f59e0b' : '#ef4444');

        let proofHtml = '';
        if (p.paymentProofs && p.paymentProofs.length > 0) {
            proofHtml = `<div style="margin-top: 0.5rem; font-size: 0.85rem;">
                <span style="color: var(--gray);">Proofs: </span>
                ${p.paymentProofs.map((url, i) => {
                // Check extension
                const isPdf = url.toLowerCase().endsWith('.pdf');
                // Escape arguments for the onclick handler
                const safeUrl = url.replace(/'/g, "\\'");
                const safeDate = (p.lastPaymentDate || '').replace(/'/g, "\\'");
                const safeAmount = (p.paidTotal || 0).toString();

                if (isPdf) {
                    return `<a href="${url}" target="_blank" style="color: var(--secondary); text-decoration: underline; margin-right: 5px; cursor: pointer;">View ${i + 1}</a>`;
                } else {
                    return `<a href="#" onclick="showPreview('${safeUrl}', 'Salary Payment', '${safeDate}', '${safeAmount}'); return false;" style="color: var(--secondary); text-decoration: underline; margin-right: 5px; cursor: pointer;">View ${i + 1}</a>`;
                }
            }).join('')}
            </div>`;
        }

        const card = document.createElement('div');
        card.className = 'dashboard-card';
        card.style.background = 'var(--white)';
        card.style.padding = '1.5rem';
        card.style.borderRadius = '12px';
        card.style.border = '1px solid var(--gray, #e2e8f0)';
        card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                <div>
                    <h3 style="margin: 0; font-size: 1.1rem;">${p.employee.name}</h3>
                    <div style="font-size: 0.85rem; color: var(--gray); margin-top: 4px;">Net Payable</div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: var(--dark);">₹${p.finalPayable}</div>
                </div>
                <div style="text-align: right;">
                    <span style="background: ${statusColor}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">
                        ${status.toUpperCase()}
                    </span>
                    ${status === 'Settled' ? `<div style="font-size: 0.75rem; color: var(--gray); margin-top: 4px;">${lastDate}</div>` : ''}
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.9rem; color: var(--gray); margin-bottom: 1rem;">
                <div>Days Worked: <span style="color: var(--dark); font-weight: 500;">${p.daysWorked}</span></div>
                <div>Salary: <span style="color: var(--dark); font-weight: 500;">₹${p.salaryEarned}</span></div>
                <div>Fare: <span style="color: var(--dark); font-weight: 500;">₹${p.fareTotal}</span></div>
                <div>Advance: <span style="color: var(--danger); font-weight: 500;">-₹${p.advancePaid}</span></div>
                ${p.previousBalance !== 0 ?
                `<div style="grid-column: 1/-1; border-top: 1px dashed #e2e8f0; padding-top: 4px; margin-top: 4px;">
                        Previous Bal: <span style="color: ${p.previousBalance < 0 ? '#dc2626' : '#10b981'}; font-weight: 500;">
                        ${p.previousBalance > 0 ? '+' : ''}₹${p.previousBalance}
                        </span>
                    </div>` : ''
            }
            </div>

            <div style="background: #f8fafc; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                    <span>Paid So Far:</span>
                    <span style="font-weight: bold; color: #059669;">₹${paidTotal}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-top: 4px;">
                    <span>Remaining Due:</span>
                    <span style="font-weight: bold; color: #dc2626;">₹${remainingDue}</span>
                </div>
                ${proofHtml}
            </div>

            <div style="display: flex; gap: 0.5rem;">
                ${remainingDue > 0 ?
                `<button class="btn btn-primary" style="flex: 1;" onclick="openPaymentModal('${p.employee.id}', '${remainingDue}')">Mark Paid</button>` :
                `<div class="btn" style="flex: 1; background: #e2e8f0; color: #94a3b8; cursor: not-allowed; text-align:center;">Settled</div>`
            }
                <button class="btn" style="background: var(--dark); color: var(--white);" onclick="openEmployeeModal('${p.employee.id}')">Payslip</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Payment Modal
function openPaymentModal(empId, dueAmount) {
    document.getElementById('pay-emp-id').value = empId;
    document.getElementById('pay-amount').value = dueAmount;
    document.getElementById('pay-salary-month').value = document.getElementById('payroll-month').value;
    document.getElementById('pay-date').valueAsDate = new Date();
    document.getElementById('payment-modal').style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('payment-modal').style.display = 'none';
    document.getElementById('payment-form').reset();
}

document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('employeeId', document.getElementById('pay-emp-id').value);
    formData.append('salaryMonth', document.getElementById('pay-salary-month').value);
    formData.append('amount', document.getElementById('pay-amount').value);
    formData.append('date', document.getElementById('pay-date').value);
    formData.append('mode', document.getElementById('pay-mode').value);
    formData.append('notes', document.getElementById('pay-notes').value);

    const fileInput = document.getElementById('pay-screenshot');
    if (fileInput.files[0]) {
        const compressed = await compressImage(fileInput.files[0]);
        formData.append('screenshot', compressed);
    }

    try {
        await fetch(`${API_URL}/payments`, {
            method: 'POST',
            body: formData
            // Content-Type header is auto-set with FormData (multipart/form-data)
        });
        alert('Payment Recorded!');
        closePaymentModal();
        loadPayroll(); // Refresh cards
    } catch (e) {
        alert('Error saving payment');
    }
});

// ==================== AUTO DEFAULT CURRENT MONTH ====================
function setDefaultMonthFilters() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Select all month inputs on the page
    document.querySelectorAll('input[type="month"]').forEach(input => {
        // Only set if empty or if it's the specific dashboard/payroll filters
        if (!input.value) {
            input.value = currentMonth;
        }
    });

    // Specific IDs that MUST have a value for initial load to work correctly
    const criticalFilters = [
        'dashboard-month-filter',
        'att-filter-month',
        'adv-filter-month',
        'payroll-month',
        'uploads-filter-month'
    ];

    criticalFilters.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) {
            el.value = currentMonth;
        }
    });
}

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    setDefaultMonthFilters();
});

// Initialize
init();


// --- EXPORT TO CSV (Detailed Report) ---
// --- EXPORT TO CSV (Detailed Report) ---
function exportToCSV() {
    if (!currentModalEmployee || !currentModalMonth) {
        alert('No employee or month selected.');
        return;
    }

    const emp = currentModalEmployee;
    const type = document.getElementById('export-range-type').value;
    let start = '', end = '';

    // Determine Date Range
    if (type === 'custom') {
        start = document.getElementById('export-start-date').value;
        end = document.getElementById('export-end-date').value;
        if (!start || !end) {
            alert('Please select start and end dates.');
            return;
        }
    } else if (type === 'month') {
        start = currentModalMonth + '-01';
        // Simple end of month (covers up to 31st safely for string comparison)
        end = currentModalMonth + '-31';
    } else if (type === '3months') {
        // Last 3 Months relative to Selected Month
        let d = new Date(currentModalMonth + '-01');
        // End is last day of selected month
        const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        end = endD.toISOString().split('T')[0];
        // Start is 1st day of 2 months ago
        d.setMonth(d.getMonth() - 2);
        start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    } else if (type === 'year') {
        // Calendar Year of Selected Month
        const y = currentModalMonth.split('-')[0];
        start = `${y}-01-01`;
        end = `${y}-12-31`;
    }

    // Filter Data by Date Range
    const empAtt = attendanceData.filter(a => a.employeeId === emp.id && a.date >= start && a.date <= end);
    const empAdv = advancesData.filter(a => a.employeeId === emp.id && a.date >= start && a.date <= end);
    const empPay = paymentsData.filter(p => p.employeeId === emp.id && p.date >= start && p.date <= end);

    // Calculate Totals
    let totalEarned = 0;
    let daysPresent = 0;

    // Sort Attendance
    empAtt.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Prepare Attendance Rows
    const attendanceRows = empAtt.map(att => {
        const wh = parseFloat(att.workedHours);
        const salary = parseFloat(emp.salary);
        const stdHours = globalSettings.standardHours;
        const slabBase = globalSettings.slabHours;

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

        const fare = parseFloat(att.fare) || 0;
        const dayTotal = Math.round(dailySalary + fare);

        totalEarned += dayTotal;
        daysPresent++;

        return `${att.date},${att.timeIn},${att.timeOut},${wh.toFixed(2)},${status},${Math.round(dailySalary)},${fare},${dayTotal}`;
    });

    const totalAdv = empAdv.reduce((sum, a) => sum + parseFloat(a.amount), 0);
    const totalPaid = empPay.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const netPayable = Math.round(totalEarned - totalAdv);
    const balanceDue = Math.round(netPayable - totalPaid);

    // Holiday Count (Approx for range)
    let holidayCount = 0;
    holidays.forEach(h => {
        if (h >= start && h <= end) holidayCount++;
    });

    // Build CSV Content
    let csv = [];

    // 1. Header & Employee Info
    csv.push("DETAILED ATTENDANCE & PAYROLL REPORT");
    csv.push(`Employee,${emp.name}`);
    csv.push(`Designation,${emp.designation || '-'}`);
    csv.push(`Report Range,${start} to ${end}`);
    csv.push("");

    // 2. Summary Table
    csv.push("SUMMARY METRICS");
    csv.push(`Days Present,${daysPresent},Salary Earned,${Math.round(totalEarned)}`);
    csv.push(`Holidays in Range,${holidayCount},Less: Advances,${totalAdv}`);
    csv.push(`Total Paid in Range,${totalPaid},Net Payable (Range),${netPayable}`);
    csv.push(`,,BALANCE DUE (Range),${balanceDue}`);
    csv.push("");

    // 3. Attendance Details
    csv.push("ATTENDANCE LOG");
    csv.push("Date,In Time,Out Time,Hours,Status,Daily Salary,Fare,Total");
    csv.push(...attendanceRows);
    csv.push("");

    // 4. Advances
    if (empAdv.length > 0) {
        csv.push("ADVANCE DEDUCTIONS");
        csv.push("Date,Amount,Notes");
        empAdv.forEach(a => csv.push(`${a.date},${a.amount},${a.notes || ''}`));
        csv.push(`Total,,,${totalAdv}`);
        csv.push("");
    }

    // 5. Payments
    if (empPay.length > 0) {
        csv.push("PAYMENT HISTORY");
        csv.push("Date,Amount,Mode,Reference");
        empPay.forEach(p => csv.push(`${p.date},${p.amount},${p.mode},${p.notes || ''}`));
        csv.push(`Total,${totalPaid}`);
        csv.push("");
    }

    // Download Logic
    const csvString = csv.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${emp.name}_Report_${start}_to_${end}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Toggle Custom Date Inputs
function toggleExportInputs() {
    const type = document.getElementById('export-range-type').value;
    const customDiv = document.getElementById('export-custom-dates');
    if (type === 'custom') {
        customDiv.style.display = 'flex';
    } else {
        customDiv.style.display = 'none';
    }
}

// Show Export Options Panel
function showExportOptions() {
    document.getElementById('export-options-panel').style.display = 'block';
}

// Hide Export Options Panel
function hideExportOptions() {
    document.getElementById('export-options-panel').style.display = 'none';
}

// ========= UPLOADS PAGE =========

let uploadsData = [];
let currentGalleryEmployeeId = null;
let allGalleryImages = [];
let selectedForDeletion = [];

async function loadUploadsPage() {
    const grid = document.getElementById('uploads-employee-grid');
    grid.innerHTML = '<p style="color: var(--gray);">Loading uploads...</p>';

    try {
        // Fetch employees and uploads
        const [empRes, uploadRes] = await Promise.all([
            fetch(`${API_URL}/employees`),
            fetch(`${API_URL}/uploads`)
        ]);

        const employees = (await empRes.json()).sort((a, b) => a.name.localeCompare(b.name));
        const uploads = await uploadRes.json();
        uploadsData = uploads;

        // Apply month filter if set
        let monthInput = document.getElementById('uploads-filter-month');
        if (!monthInput.value) {
            const now = new Date();
            monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        const filterMonth = monthInput.value;
        const filteredUploads = filterMonth
            ? uploads.filter(u => u.date && u.date.startsWith(filterMonth))
            : uploads;

        // Group by employee
        const uploadsByEmployee = {};
        filteredUploads.forEach(up => {
            if (!uploadsByEmployee[up.employeeId]) {
                uploadsByEmployee[up.employeeId] = [];
            }
            uploadsByEmployee[up.employeeId].push(up);
        });

        // Create employee cards
        grid.innerHTML = '';

        const activeEmployees = employees.filter(emp => (uploadsByEmployee[emp.id] || []).length > 0);

        if (activeEmployees.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--gray); padding: 2rem; background: var(--white); border-radius: 12px; border: 1px solid #e2e8f0;">No uploads found for this selection.</div>';
            return;
        }

        activeEmployees.forEach(emp => {
            const empUploads = uploadsByEmployee[emp.id] || [];
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cursor = 'pointer';
            card.style.transition = 'transform 0.2s, box-shadow 0.2s';
            card.onmouseenter = function () { this.style.transform = 'translateY(-5px)'; this.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)'; };
            card.onmouseleave = function () { this.style.transform = ''; this.style.boxShadow = ''; };
            card.onclick = () => openGalleryModal(emp.id, emp.name);

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: white; font-weight: bold;">
                        ${emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h4 style="margin: 0;">${emp.name}</h4>
                        <p style="margin: 0.25rem 0 0 0; color: var(--gray); font-size: 0.9rem;">${emp.phone || 'No phone'}</p>
                    </div>
                </div>
                <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <span style="font-size: 2rem; font-weight: bold; color: var(--primary);">${empUploads.length}</span>
                        <span style="color: var(--gray);">uploads</span>
                    </div>
                    <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">View →</button>
                </div>
            `;

            grid.appendChild(card);
        });

    } catch (e) {
        console.error('Error loading uploads:', e);
        grid.innerHTML = '<p style="color: var(--danger);">Error loading uploads. Please try again.</p>';
    }
}

function openGalleryModal(employeeId, employeeName) {
    currentGalleryEmployeeId = employeeId;
    selectedForDeletion = [];

    document.getElementById('gallery-title').innerText = `📷 ${employeeName}'s Uploads`;
    document.getElementById('gallery-date-filter').value = '';
    document.getElementById('delete-selected-btn').style.display = 'none';

    // Filter uploads for this employee
    allGalleryImages = uploadsData.filter(u => u.employeeId === employeeId);

    renderGalleryImages(allGalleryImages);

    document.getElementById('gallery-modal').style.display = 'flex';
}

function closeGalleryModal() {
    document.getElementById('gallery-modal').style.display = 'none';
    currentGalleryEmployeeId = null;
    allGalleryImages = [];
    selectedForDeletion = [];
}

function renderGalleryImages(images) {
    const grid = document.getElementById('gallery-grid');
    const emptyMsg = document.getElementById('gallery-empty');
    const countEl = document.getElementById('gallery-count');

    grid.innerHTML = '';

    if (images.length === 0) {
        emptyMsg.style.display = 'block';
        countEl.innerText = '0 images';
        return;
    }

    emptyMsg.style.display = 'none';
    countEl.innerText = `${images.length} image(s)`;

    images.forEach(img => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.style.cssText = `
            position: relative;
            border-radius: 10px;
            overflow: hidden;
            background: var(--light);
            border: 2px solid transparent;
            transition: all 0.2s;
        `;

        const isSelected = selectedForDeletion.some(s => s.id === img.id && s.type === img.type);
        if (isSelected) {
            item.style.borderColor = 'var(--danger)';
        }

        item.innerHTML = `
            <div style="position: relative;">
                <img src="${img.screenshot}" alt="Upload" style="width: 100%; height: 150px; object-fit: cover; cursor: pointer;" onclick="openImagePreview('${img.screenshot}', '${img.type}', '${img.date}', ${img.amount})">
                <input type="checkbox" 
                    style="position: absolute; top: 10px; right: 10px; width: 20px; height: 20px; cursor: pointer;" 
                    ${isSelected ? 'checked' : ''}
                    onchange="toggleImageSelection('${img.type}', '${img.id}', this.checked)">
            </div>
            <div style="padding: 0.75rem;">
                <p style="margin: 0; font-size: 0.85rem; color: var(--gray);">${img.date}</p>
                <p style="margin: 0.25rem 0 0 0; font-weight: bold; color: ${img.type === 'advance' ? 'var(--danger)' : 'var(--success)'};">
                    ${img.type === 'advance' ? 'Advance' : 'Payment'}: ₹${img.amount}
                </p>
            </div>
        `;

        grid.appendChild(item);
    });
}

function filterGalleryByDate() {
    const filterDate = document.getElementById('gallery-date-filter').value;
    if (!filterDate) {
        renderGalleryImages(allGalleryImages);
        return;
    }

    const filtered = allGalleryImages.filter(img => img.date === filterDate);
    renderGalleryImages(filtered);
}

function clearGalleryFilter() {
    document.getElementById('gallery-date-filter').value = '';
    renderGalleryImages(allGalleryImages);
}

function toggleImageSelection(type, id, isChecked) {
    if (isChecked) {
        selectedForDeletion.push({ type, id });
    } else {
        selectedForDeletion = selectedForDeletion.filter(s => !(s.id === id && s.type === type));
    }

    // Show/hide delete and download buttons
    const deleteBtn = document.getElementById('delete-selected-btn');
    const downloadBtn = document.getElementById('download-selected-btn');

    if (selectedForDeletion.length > 0) {
        deleteBtn.style.display = 'block';
        deleteBtn.innerText = `🗑️ Delete (${selectedForDeletion.length})`;
        downloadBtn.style.display = 'block';
        downloadBtn.innerText = `⬇️ Download (${selectedForDeletion.length})`;
    } else {
        deleteBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
    }
}

function deleteSelectedImages() {
    if (selectedForDeletion.length === 0) return;

    document.getElementById('delete-confirm-msg').innerText =
        `Are you sure you want to delete ${selectedForDeletion.length} image(s)?`;
    document.getElementById('delete-confirm-modal').style.display = 'flex';
}

function cancelDelete() {
    document.getElementById('delete-confirm-modal').style.display = 'none';
}

async function confirmDelete() {
    document.getElementById('delete-confirm-modal').style.display = 'none';

    try {
        // Delete all selected images
        for (const item of selectedForDeletion) {
            await fetch(`${API_URL}/uploads/${item.type}/${item.id}`, {
                method: 'DELETE'
            });
        }

        // Clear selection
        selectedForDeletion = [];
        document.getElementById('delete-selected-btn').style.display = 'none';

        // Reload data
        const uploadRes = await fetch(`${API_URL}/uploads`);
        uploadsData = await uploadRes.json();

        // Re-filter for current employee
        allGalleryImages = uploadsData.filter(u => u.employeeId === currentGalleryEmployeeId);
        renderGalleryImages(allGalleryImages);

        // Also refresh the main page cards
        loadUploadsPage();

        alert('Image(s) deleted successfully!');

    } catch (e) {
        console.error('Error deleting images:', e);
        alert('Error deleting images. Please try again.');
    }
}

// ========= IMAGE PREVIEW WITH NAVIGATION =========

let previewImages = [];
let currentPreviewIndex = 0;

function openImagePreview(src, type, date, amount) {
    const overlay = document.getElementById('image-preview-overlay');

    // Build list of images for navigation
    if (_attGalleryMode && _attGalleryImages.length > 0) {
        // Attendance photos mode
        previewImages = _attGalleryImages.map(p => ({
            src: p.url,
            type: p.type === 'in' ? '🔒 Check In' : '🔓 Check Out',
            date: p.date,
            amount: p.time ? formatTimeTo12h(p.time) : '--',
            isAttPhoto: true
        }));
    } else {
        // Uploads mode (original behaviour)
        previewImages = allGalleryImages.map(img => ({
            src: img.screenshot,
            type: img.type,
            date: img.date,
            amount: img.amount
        }));
    }

    // Find the current image index
    currentPreviewIndex = previewImages.findIndex(i => i.src === src);
    if (currentPreviewIndex === -1) currentPreviewIndex = 0;

    updatePreviewImage();
    overlay.classList.add('active');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

function updatePreviewImage() {
    const img = document.getElementById('preview-image');
    const info = document.getElementById('preview-info');
    const counter = document.getElementById('preview-counter');

    const current = previewImages[currentPreviewIndex];
    if (!current) return;

    img.src = current.src;

    if (current.isAttPhoto) {
        info.innerHTML = `<strong>${current.type}</strong> • ${current.date} • ${current.amount}`;
    } else {
        info.innerHTML = `<strong>${current.type === 'advance' ? 'Advance' : 'Payment'}</strong> • ${current.date} • ₹${current.amount}`;
    }

    if (counter) {
        counter.innerText = `${currentPreviewIndex + 1} / ${previewImages.length}`;
    }

    // Update nav button visibility
    const prevBtn = document.getElementById('preview-prev');
    const nextBtn = document.getElementById('preview-next');
    if (prevBtn) prevBtn.style.opacity = currentPreviewIndex > 0 ? '1' : '0.3';
    if (nextBtn) nextBtn.style.opacity = currentPreviewIndex < previewImages.length - 1 ? '1' : '0.3';
}

function prevImage() {
    if (currentPreviewIndex > 0) {
        currentPreviewIndex--;
        updatePreviewImage();
    }
}

function nextImage() {
    if (currentPreviewIndex < previewImages.length - 1) {
        currentPreviewIndex++;
        updatePreviewImage();
    }
}

async function downloadCurrentImage() {
    const current = previewImages[currentPreviewIndex];
    if (!current) return;

    try {
        const response = await fetch(current.src);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${current.type}_${current.date}_${current.amount}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download failed:', error);
        // Fallback
        window.open(current.src, '_blank');
    }
}

function closeImagePreview(event) {
    // If event exists, only close if clicking the background overlay
    if (event && event.target.id !== 'image-preview-overlay') return;

    const overlay = document.getElementById('image-preview-overlay');
    overlay.classList.remove('active');

    // Restore body scroll
    document.body.style.overflow = '';
}

// Close preview on Escape key, navigate with arrow keys
document.addEventListener('keydown', function (e) {
    const overlay = document.getElementById('image-preview-overlay');
    if (!overlay.classList.contains('active')) return;

    if (e.key === 'Escape') {
        closeImagePreview();
    } else if (e.key === 'ArrowLeft') {
        prevImage();
    } else if (e.key === 'ArrowRight') {
        nextImage();
    }
});

// ========= DOWNLOAD SELECTED IMAGES =========

async function downloadSelectedImages() {
    if (selectedForDeletion.length === 0) {
        alert('No images selected');
        return;
    }

    const downloadBtn = document.getElementById('download-selected-btn');
    const originalText = downloadBtn ? downloadBtn.innerText : 'Download';
    if (downloadBtn) {
        downloadBtn.innerText = 'Downloading...';
        downloadBtn.disabled = true;
    }

    try {
        // Download each selected image
        for (const selected of selectedForDeletion) {
            const img = allGalleryImages.find(i => i.id === selected.id && i.type === selected.type);
            if (img) {
                try {
                    const response = await fetch(img.screenshot);
                    if (!response.ok) throw new Error('Network response was not ok');
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);

                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${img.type}_${img.date}_${img.amount}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                } catch (err) {
                    console.error("Failed to download image", err);
                }
                // Small delay between downloads
                await new Promise(r => setTimeout(r, 500));
            }
        }
    } catch (e) {
        console.error("Batch download error", e);
        alert("Some images may not have downloaded.");
    } finally {
        if (downloadBtn) {
            downloadBtn.innerText = originalText;
            downloadBtn.disabled = false;
        }
    }
}

// --- WHATSAPP SHARE LOGIC ---
async function sharePayslipWhatsApp() {
    if (!currentModalEmployee) return;

    const empId = currentModalEmployee.id;
    const month = document.getElementById('modal-month-picker').value;

    // Ensure we have latest payments (optional but good practice)
    const payRes = await fetch(`${API_URL}/payments`);
    const allPayments = await payRes.json();
    const payments = allPayments.filter(p => p.employeeId === empId && p.salaryMonth === month);

    const emp = currentModalEmployee;

    // --- 1. DATA CALCULATION (Same as PDF) ---
    const att = attendanceData.filter(a => a.employeeId === empId && a.date.startsWith(month));
    const adv = advancesData.filter(a => a.employeeId === empId && (a.deductionMonth || a.date.substring(0, 7)) === month);

    let basicPay = 0;
    let otPay = 0;
    let totalFare = 0;

    const normalHourlyRate = emp.salary / globalSettings.standardHours;
    const slabHourlyRate = emp.salary / globalSettings.slabHours;

    att.forEach(a => {
        const wh = parseFloat(a.workedHours);
        totalFare += parseFloat(a.fare || 0);

        if (a.slabMode && wh > globalSettings.standardHours) {
            const normalPart = normalHourlyRate * globalSettings.standardHours;
            const extraPart = slabHourlyRate * (wh - globalSettings.standardHours);
            basicPay += normalPart;
            otPay += extraPart;
        } else {
            basicPay += normalHourlyRate * wh;
        }
    });

    const totalEarned = basicPay + otPay + totalFare;
    const totalAdv = adv.reduce((sum, a) => sum + a.amount, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    const netPayable = totalEarned - totalAdv;
    const remainingDue = netPayable - totalPaid;

    // Format Message
    const msg = `*Payslip for ${month}*
Name: ${emp.name}
Details: ${emp.designation || 'Worker'} (ID: ${emp.customId || emp.id})

*Earnings*
Basic & OT: ₹${(basicPay + otPay).toFixed(0)}
Travel/Fare: ₹${totalFare.toFixed(0)}
*Total Earned: ₹${totalEarned.toFixed(0)}*

*Deductions*
Advances: ₹${totalAdv.toFixed(0)}

*Net Payable: ₹${Math.round(netPayable)}*
(Paid: ₹${totalPaid}, Due: ₹${Math.round(remainingDue)})

Status: ${remainingDue <= 0.5 ? '✅ PAID' : '⏳ PENDING'}

_Please contact admin for full PDF details._
`;

    // Phone Number Logic
    // Default to '91' prefix if not present, strip non-digits
    let phone = emp.contact ? emp.contact.replace(/\D/g, '') : '';
    if (phone.length === 10) phone = '91' + phone;

    // Fallback if no phone
    if (phone.length < 10) {
        if (!confirm('Employee phone number seems invalid (' + (emp.contact || 'Empty') + '). Open WhatsApp anyway?')) return;
        phone = ''; // User will have to select contact manually in WA
    }

    const encoded = encodeURIComponent(msg);
    const url = `https://wa.me/${phone}?text=${encoded}`;

    window.open(url, '_blank');
}
// --- PREVIEW MODAL LOGIC (Global) ---
let currentPreviewScale = 1;

function showPreview(url, title, date, amount) {
    const modal = document.getElementById('enhanced-preview-modal');
    // Ensure modal exists in index.html, if not, we might need to add it dynamically or ensure it's there.
    // Assuming index.html has the modal structure as added in previous steps.
    if (!modal) {
        console.error("Enhanced preview modal not found in DOM");
        window.open(url, '_blank');
        return;
    }

    const img = document.getElementById('enhanced-preview-img');
    const titleEl = document.getElementById('preview-caption-title');
    const dateEl = document.getElementById('preview-caption-date');

    img.src = url;
    if (titleEl) titleEl.innerText = title || 'Proof';
    if (dateEl) dateEl.innerText = `${date} • ₹${amount}`;

    currentPreviewScale = 1;
    if (img) img.style.transform = `scale(1)`;

    modal.style.display = 'flex';
}

function closeEnhancedPreview() {
    const modal = document.getElementById('enhanced-preview-modal');
    if (modal) modal.style.display = 'none';
}

function zoomPreview(delta) {
    const img = document.getElementById('enhanced-preview-img');
    if (!img) return;
    currentPreviewScale += delta;
    if (currentPreviewScale < 0.5) currentPreviewScale = 0.5;
    if (currentPreviewScale > 3) currentPreviewScale = 3;
    img.style.transform = `scale(${currentPreviewScale})`;
}

async function downloadPreviewImage() {
    const img = document.getElementById('enhanced-preview-img');
    if (img && img.src) {
        try {
            const response = await fetch(img.src);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `proof-image-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            window.open(img.src, '_blank');
        }
    }
}

// Make them global
window.showPreview = showPreview;
window.closeEnhancedPreview = closeEnhancedPreview;
window.zoomPreview = zoomPreview;
window.downloadPreviewImage = downloadPreviewImage;

// MOMENT OF TRUTH: Factory Reset
window.confirmFactoryReset = async function () {
    if (!confirm("WARNING: This will delete ALL TABLE DATA (Employees, Attendance, Payments, Advances). Uploaded Images/Files will NOT be deleted. This action cannot be undone. Are you sure?")) return;

    const password = prompt("Please enter Admin Password to confirm Data Reset:");
    if (!password) return;

    try {
        const res = await fetch(`${API_URL}/factory-reset`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();

        if (data.success) {
            alert("System has been reset successfully. You will be logged out.");
            logout();
        } else {
            alert("Reset Failed: " + (data.message || 'Unknown error'));
        }
    } catch (e) {
        console.error("Factory reset error:", e);
        alert("An error occurred during factory reset.");
    }
};
window.closeEnhancedPreview = closeEnhancedPreview;
window.zoomPreview = zoomPreview;
window.downloadPreviewImage = downloadPreviewImage;

// ==================== ATTENDANCE PHOTOS GALLERY ====================

// ========= ATTENDANCE PHOTOS PAGE =========

let _attPhotosAll = [];          // all fetched photos
let _attPhotoEmployees = [];     // all employees (for the employee cards)
let _attGalleryImages = [];      // photos for the currently open gallery
let _attSelectedForDeletion = []; // selected attendance photos for batch delete
let _attGalleryMode = true;      // flag: gallery-modal is in attPhotos mode

async function loadAttendancePhotos() {
    const container = document.getElementById('att-photos-container');
    if (!container) return;

    // Default month filter to current month on first load
    const monthEl = document.getElementById('att-photo-month-filter');
    if (monthEl && !monthEl.value) {
        const now = new Date();
        monthEl.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    container.innerHTML = '<p style="text-align:center; color:var(--gray); padding:3rem 0;">⏳ Loading photos...</p>';

    try {
        const [empRes, photoRes] = await Promise.all([
            fetch(`${API_URL}/employees`),
            fetch(`${API_URL}/attendance-photos`)
        ]);

        _attPhotoEmployees = (await empRes.json()).sort((a, b) => a.name.localeCompare(b.name));
        _attPhotosAll = await photoRes.json();

        _renderAttPhotoCards();
    } catch (e) {
        container.innerHTML = `<p style="color:var(--danger); text-align:center; padding:2rem;">Error: ${e.message}</p>`;
    }
}

function _renderAttPhotoCards() {
    const container = document.getElementById('att-photos-container');
    const countEl = document.getElementById('att-photo-count');
    const monthFilter = (document.getElementById('att-photo-month-filter')?.value || '').trim();
    const empFilter = (document.getElementById('att-photo-emp-filter')?.value || '').trim();

    // Filter photos
    let filtered = _attPhotosAll;
    if (monthFilter) filtered = filtered.filter(p => p.date && p.date.startsWith(monthFilter));
    if (empFilter) filtered = filtered.filter(p => p.employeeName === empFilter);

    if (countEl) countEl.textContent = `${filtered.length} photo${filtered.length !== 1 ? 's' : ''}`;

    // Group by employeeId
    const byEmp = {};
    filtered.forEach(p => {
        const key = p.employeeId || p.employeeName;
        if (!byEmp[key]) byEmp[key] = [];
        byEmp[key].push(p);
    });

    // Populate employee dropdown
    const empFilterEl = document.getElementById('att-photo-emp-filter');
    if (empFilterEl) {
        const names = [...new Set(_attPhotosAll.map(p => p.employeeName))].sort();
        const currentVal = empFilterEl.value;
        empFilterEl.innerHTML = '<option value="">All Employees</option>' +
            names.map(n => `<option value="${n}" ${n === currentVal ? 'selected' : ''}>${n}</option>`).join('');
    }

    container.innerHTML = '';

    if (_attPhotoEmployees.length === 0) {
        container.innerHTML = '<p style="color:var(--gray); text-align:center; padding:2rem; grid-column: 1 / -1;">No employees found.</p>';
        return;
    }

    _attPhotoEmployees.forEach(emp => {
        const empPhotos = byEmp[emp.id] || byEmp[emp.name] || [];
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cursor = 'pointer';
        card.style.transition = 'transform 0.2s, box-shadow 0.2s';
        card.onmouseenter = function () { this.style.transform = 'translateY(-5px)'; this.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)'; };
        card.onmouseleave = function () { this.style.transform = ''; this.style.boxShadow = ''; };
        card.onclick = () => openAttPhotoGallery(emp.id, emp.name);

        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
                <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: white; font-weight: bold; flex-shrink: 0;">
                    ${emp.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h4 style="margin: 0;">${emp.name}</h4>
                    <p style="margin: 0.25rem 0 0 0; color: var(--gray); font-size: 0.9rem;">${emp.phone || 'No phone'}</p>
                </div>
            </div>
            <div style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span style="font-size: 2rem; font-weight: bold; color: var(--primary);">${empPhotos.length}</span>
                    <span style="color: var(--gray);"> photos</span>
                </div>
                <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">View →</button>
            </div>`;
        container.appendChild(card);
    });
}

function openAttPhotoGallery(employeeId, employeeName) {
    _attGalleryMode = true;
    _attSelectedForDeletion = [];

    document.getElementById('gallery-title').innerText = `📸 ${employeeName}'s Attendance Photos`;
    document.getElementById('gallery-date-filter').value = '';
    document.getElementById('delete-selected-btn').style.display = 'none';
    document.getElementById('download-selected-btn').style.display = 'none';

    // get current month filter from the page
    const monthFilter = (document.getElementById('att-photo-month-filter')?.value || '').trim();
    _attGalleryImages = _attPhotosAll.filter(p => {
        const matchEmp = String(p.employeeId) === String(employeeId) || p.employeeName === employeeName;
        const matchMonth = monthFilter ? (p.date && p.date.startsWith(monthFilter)) : true;
        return matchEmp && matchMonth;
    });

    _renderAttGalleryImages(_attGalleryImages);
    document.getElementById('gallery-modal').style.display = 'flex';
}

function _renderAttGalleryImages(images) {
    const grid = document.getElementById('gallery-grid');
    const emptyMsg = document.getElementById('gallery-empty');
    const countEl = document.getElementById('gallery-count');

    grid.innerHTML = '';
    if (images.length === 0) {
        emptyMsg.style.display = 'block';
        countEl.innerText = '0 photos';
        return;
    }
    emptyMsg.style.display = 'none';
    countEl.innerText = `${images.length} photo(s)`;

    images.forEach(p => {
        const isSelected = _attSelectedForDeletion.some(s => s.attendanceId === p.attendanceId && s.type === p.type);
        const typeLabel = p.type === 'in' ? '🔒 Check In' : '🔓 Check Out';
        const typeColor = p.type === 'in' ? '#10b981' : '#ef4444';
        const timeFormatted = p.time ? formatTimeTo12h(p.time) : '--';

        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.style.cssText = `position:relative; border-radius:10px; overflow:hidden; background:var(--light); border:2px solid ${isSelected ? 'var(--danger)' : 'transparent'}; transition:all 0.2s;`;

        item.innerHTML = `
            <div style="position:relative;">
                <img src="${p.url}" alt="Attendance Photo"
                    style="width:100%; height:150px; object-fit:cover; cursor:pointer;"
                    onclick="openImagePreview('${p.url}', '${typeLabel}', '${p.date}', '${timeFormatted}')"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div style="display:none; width:100%; height:150px; align-items:center; justify-content:center; background:#f1f5f9; font-size:2rem;">📷</div>
                <span style="position:absolute; top:6px; left:6px; background:${typeColor}; color:white; font-size:0.65rem; font-weight:700; padding:2px 8px; border-radius:20px;">${typeLabel}</span>
                <input type="checkbox" ${isSelected ? 'checked' : ''}
                    style="position:absolute; top:10px; right:10px; width:20px; height:20px; cursor:pointer; accent-color:var(--danger);"
                    onchange="_toggleAttPhotoSelection('${p.attendanceId}', '${p.type}', '${p.url}', this.checked); this.closest('.gallery-item').style.borderColor = this.checked ? 'var(--danger)' : 'transparent';">
            </div>
            <div style="padding:0.75rem;">
                <p style="margin:0; font-size:0.85rem; color:var(--gray);">${p.date}</p>
                <p style="margin:0.25rem 0 0; font-weight:bold; color:${typeColor};">${timeFormatted}</p>
            </div>`;
        grid.appendChild(item);
    });
}

function _toggleAttPhotoSelection(attendanceId, type, url, isChecked) {
    if (isChecked) {
        _attSelectedForDeletion.push({ attendanceId, type, url });
    } else {
        _attSelectedForDeletion = _attSelectedForDeletion.filter(s => !(s.attendanceId === attendanceId && s.type === type));
    }
    const deleteBtn = document.getElementById('delete-selected-btn');
    const downloadBtn = document.getElementById('download-selected-btn');
    if (_attSelectedForDeletion.length > 0) {
        deleteBtn.style.display = 'block';
        deleteBtn.innerText = `🗑️ Delete (${_attSelectedForDeletion.length})`;
        downloadBtn.style.display = 'block';
        downloadBtn.innerText = `⬇️ Download (${_attSelectedForDeletion.length})`;
    } else {
        deleteBtn.style.display = 'none';
        downloadBtn.style.display = 'none';
    }
}

// Override the existing deleteSelectedImages to handle both modes
const _originalDeleteSelectedImages = window.deleteSelectedImages;
window.deleteSelectedImages = function () {
    if (_attGalleryMode) {
        if (_attSelectedForDeletion.length === 0) return;
        document.getElementById('delete-confirm-msg').innerText =
            `Delete ${_attSelectedForDeletion.length} attendance photo(s)? The attendance records will be kept.`;
        document.getElementById('delete-confirm-modal').style.display = 'flex';
    } else {
        _originalDeleteSelectedImages && _originalDeleteSelectedImages();
    }
};

// Override confirmDelete to handle both modes
const _originalConfirmDelete = window.confirmDelete;
window.confirmDelete = async function () {
    document.getElementById('delete-confirm-modal').style.display = 'none';
    if (_attGalleryMode) {
        try {
            for (const item of _attSelectedForDeletion) {
                await fetch(`${API_URL}/attendance-photos/${item.attendanceId}/${item.type}`, { method: 'DELETE' });
                _attPhotosAll = _attPhotosAll.filter(p => !(p.attendanceId === item.attendanceId && p.type === item.type));
            }
            _attSelectedForDeletion = [];
            document.getElementById('delete-selected-btn').style.display = 'none';
            document.getElementById('download-selected-btn').style.display = 'none';
            _attGalleryImages = _attGalleryImages.filter(p =>
                !_attSelectedForDeletion.some(s => s.attendanceId === p.attendanceId && s.type === p.type));
            _renderAttGalleryImages(_attGalleryImages);
            _renderAttPhotoCards();
            alert('Photo(s) deleted successfully!');
        } catch (e) {
            alert('Error deleting: ' + e.message);
        }
    } else {
        _originalConfirmDelete && _originalConfirmDelete();
    }
};

// Override closeGalleryModal to reset attGalleryMode
const _originalCloseGalleryModal = window.closeGalleryModal;
window.closeGalleryModal = function () {
    _attGalleryMode = false;
    _attSelectedForDeletion = [];
    _originalCloseGalleryModal && _originalCloseGalleryModal();
};

window.loadAttendancePhotos = loadAttendancePhotos;
window.openAttPhotoGallery = openAttPhotoGallery;


