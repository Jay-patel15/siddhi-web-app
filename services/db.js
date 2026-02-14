const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const DB_PATH = path.join(__dirname, '..', 'data', 'payroll.db');

// Initialize database
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
const initDB = () => {
    // Employees table
    db.exec(`
        CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            contact TEXT,
            salary REAL NOT NULL,
            customId TEXT,
            designation TEXT,
            password TEXT,
            normalHours REAL DEFAULT 8.5,
            slabBaseHours REAL DEFAULT 6
        )
    `);

    // Attendance table
    db.exec(`
        CREATE TABLE IF NOT EXISTS attendance (
            id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            employeeId TEXT NOT NULL,
            employeeName TEXT,
            slabMode INTEGER DEFAULT 0,
            timeIn TEXT,
            timeOut TEXT,
            fare REAL DEFAULT 0,
            workedHours REAL,
            FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
        )
    `);

    // Advances table
    db.exec(`
        CREATE TABLE IF NOT EXISTS advances (
            id TEXT PRIMARY KEY,
            employeeId TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            deductionMonth TEXT,
            mode TEXT,
            notes TEXT,
            screenshot TEXT,
            FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
        )
    `);

    // Payments table
    db.exec(`
        CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            employeeId TEXT NOT NULL,
            salaryMonth TEXT NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            mode TEXT,
            notes TEXT,
            screenshot TEXT,
            FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
        )
    `);

    // Settings table
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            standardHours REAL DEFAULT 8.5,
            slabHours REAL DEFAULT 6
        )
    `);

    // Holidays table
    db.exec(`
        CREATE TABLE IF NOT EXISTS holidays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE NOT NULL
        )
    `);

    // Insert default settings if not exists
    const settingsExists = db.prepare('SELECT COUNT(*) as count FROM settings').get();
    if (settingsExists.count === 0) {
        db.prepare('INSERT INTO settings (id, standardHours, slabHours) VALUES (1, 8.5, 6)').run();
    }

    console.log('Database initialized successfully');
};

// Initialize on module load
initDB();

// ==================== EMPLOYEES ====================

const getAllEmployees = () => {
    return db.prepare('SELECT * FROM employees').all();
};

const getEmployeeById = (id) => {
    return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
};

const createEmployee = (employee) => {
    const stmt = db.prepare(`
        INSERT INTO employees (id, name, contact, salary, customId, designation, password, normalHours, slabBaseHours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
        employee.id,
        employee.name,
        employee.contact,
        employee.salary,
        employee.customId,
        employee.designation,
        employee.password,
        employee.normalHours || 8.5,
        employee.slabBaseHours || 6
    );
    return getEmployeeById(employee.id);
};

const updateEmployee = (id, employee) => {
    const stmt = db.prepare(`
        UPDATE employees 
        SET name = ?, contact = ?, salary = ?, customId = ?, designation = ?, password = ?, normalHours = ?, slabBaseHours = ?
        WHERE id = ?
    `);
    stmt.run(
        employee.name,
        employee.contact,
        employee.salary,
        employee.customId,
        employee.designation,
        employee.password,
        employee.normalHours,
        employee.slabBaseHours,
        id
    );
    return getEmployeeById(id);
};

const deleteEmployee = (id) => {
    const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
    stmt.run(id);
    return { success: true };
};

// ==================== ATTENDANCE ====================

const getAllAttendance = () => {
    return db.prepare('SELECT * FROM attendance').all().map(row => ({
        ...row,
        slabMode: Boolean(row.slabMode)
    }));
};

const getAttendanceById = (id) => {
    const row = db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
    if (row) {
        row.slabMode = Boolean(row.slabMode);
    }
    return row;
};

const createAttendance = (attendance) => {
    const stmt = db.prepare(`
        INSERT INTO attendance (id, date, employeeId, employeeName, slabMode, timeIn, timeOut, fare, workedHours)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
        attendance.id,
        attendance.date,
        attendance.employeeId,
        attendance.employeeName,
        attendance.slabMode ? 1 : 0,
        attendance.timeIn,
        attendance.timeOut,
        attendance.fare || 0,
        attendance.workedHours
    );
    return getAttendanceById(attendance.id);
};

const updateAttendance = (id, attendance) => {
    const stmt = db.prepare(`
        UPDATE attendance 
        SET date = ?, employeeId = ?, employeeName = ?, slabMode = ?, timeIn = ?, timeOut = ?, fare = ?, workedHours = ?
        WHERE id = ?
    `);
    stmt.run(
        attendance.date,
        attendance.employeeId,
        attendance.employeeName,
        attendance.slabMode ? 1 : 0,
        attendance.timeIn,
        attendance.timeOut,
        attendance.fare || 0,
        attendance.workedHours,
        id
    );
    return getAttendanceById(id);
};

const deleteAttendance = (id) => {
    const stmt = db.prepare('DELETE FROM attendance WHERE id = ?');
    stmt.run(id);
    return { success: true };
};

// ==================== ADVANCES ====================

const getAllAdvances = () => {
    return db.prepare('SELECT * FROM advances').all();
};

const getAdvanceById = (id) => {
    return db.prepare('SELECT * FROM advances WHERE id = ?').get(id);
};

const createAdvance = (advance) => {
    const stmt = db.prepare(`
        INSERT INTO advances (id, employeeId, amount, date, deductionMonth, mode, notes, screenshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
        advance.id,
        advance.employeeId,
        advance.amount,
        advance.date,
        advance.deductionMonth,
        advance.mode,
        advance.notes,
        advance.screenshot
    );
    return getAdvanceById(advance.id);
};

const updateAdvance = (id, advance) => {
    const stmt = db.prepare(`
        UPDATE advances 
        SET employeeId = ?, amount = ?, date = ?, deductionMonth = ?, mode = ?, notes = ?, screenshot = ?
        WHERE id = ?
    `);
    stmt.run(
        advance.employeeId,
        advance.amount,
        advance.date,
        advance.deductionMonth,
        advance.mode,
        advance.notes,
        advance.screenshot,
        id
    );
    return getAdvanceById(id);
};

const deleteAdvance = (id) => {
    const stmt = db.prepare('DELETE FROM advances WHERE id = ?');
    stmt.run(id);
    return { success: true };
};

// ==================== PAYMENTS ====================

const getAllPayments = () => {
    return db.prepare('SELECT * FROM payments').all();
};

const getPaymentById = (id) => {
    return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
};

const createPayment = (payment) => {
    const stmt = db.prepare(`
        INSERT INTO payments (id, employeeId, salaryMonth, amount, date, mode, notes, screenshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
        payment.id,
        payment.employeeId,
        payment.salaryMonth,
        payment.amount,
        payment.date,
        payment.mode,
        payment.notes,
        payment.screenshot
    );
    return getPaymentById(payment.id);
};

// ==================== SETTINGS ====================

const getSettings = () => {
    return db.prepare('SELECT * FROM settings WHERE id = 1').get();
};

const updateSettings = (settings) => {
    const stmt = db.prepare(`
        UPDATE settings 
        SET standardHours = ?, slabHours = ?
        WHERE id = 1
    `);
    stmt.run(settings.standardHours, settings.slabHours);
    return getSettings();
};

// ==================== HOLIDAYS ====================

const getAllHolidays = () => {
    return db.prepare('SELECT date FROM holidays').all().map(row => row.date);
};

const setHolidays = (dates) => {
    // Clear existing holidays
    db.prepare('DELETE FROM holidays').run();
    
    // Insert new holidays
    const stmt = db.prepare('INSERT INTO holidays (date) VALUES (?)');
    const insertMany = db.transaction((dates) => {
        for (const date of dates) {
            stmt.run(date);
        }
    });
    
    insertMany(dates);
    return { success: true };
};

// ==================== FACTORY RESET ====================

const factoryReset = () => {
    db.exec('DELETE FROM employees');
    db.exec('DELETE FROM attendance');
    db.exec('DELETE FROM advances');
    db.exec('DELETE FROM payments');
    db.exec('DELETE FROM holidays');
    db.exec('UPDATE settings SET standardHours = 8.5, slabHours = 6 WHERE id = 1');
    return { success: true };
};

// Export all functions
module.exports = {
    db,
    // Employees
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    // Attendance
    getAllAttendance,
    getAttendanceById,
    createAttendance,
    updateAttendance,
    deleteAttendance,
    // Advances
    getAllAdvances,
    getAdvanceById,
    createAdvance,
    updateAdvance,
    deleteAdvance,
    // Payments
    getAllPayments,
    getPaymentById,
    createPayment,
    // Settings
    getSettings,
    updateSettings,
    // Holidays
    getAllHolidays,
    setHolidays,
    // Factory Reset
    factoryReset
};
