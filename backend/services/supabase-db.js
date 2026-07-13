require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_Service_Role_KEY = process.env.SUPABASE_SERVICE_KEY; // Using Service Role Key for backend administration

if (!SUPABASE_URL || !SUPABASE_Service_Role_KEY) {
    console.error('❌ Supabase credentials missing! Please check your .env file.');
    console.error('Ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set.');
    // Don't crash immediately to allow for setup, but functionality will fail
}

const supabase = createClient(SUPABASE_URL, SUPABASE_Service_Role_KEY, {
    db: { schema: 'public' },
    global: {
        headers: { 'x-connection-encrypted': 'true' }
    },
    auth: { persistSession: false }
});

// Retry Helper for Transient Network Errors
// Safe for all operations — inserts use low maxRetries (1) to avoid true duplicates
const retry = async (operation, maxRetries = 5, delay = 800) => {
    let lastError;
    // Exponential backoff with jitter
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            // Treat known Supabase pooler/connection errors as transient
            // schema_migrations error = Supabase PgBouncer transaction-mode bug (very common)
            const isPgBouncerBug = error.message.includes('schema_migrations');
            const isNetworkError =
                isPgBouncerBug ||
                error.message.includes('fetch failed') ||
                error.message.includes('network') ||
                error.message.includes('timeout') ||
                error.message.includes('ECONNRESET') ||
                error.message.includes('connection') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('503') ||
                error.message.includes('connection refused') ||
                error.message.includes('Connection terminated');

            if (isNetworkError) {
                // PgBouncer bug needs a longer cool-down before retry
                const retryDelay = isPgBouncerBug
                    ? delay * (i + 2)   // longer wait: 1.6s, 2.4s, 3.2s, 4s
                    : delay * (i + 1);  // standard backoff

                console.warn(`⚠️  DB transient error (Attempt ${i + 1}/${maxRetries})${isPgBouncerBug ? ' [PgBouncer/schema_migrations]' : ''}: ${error.message}. Retrying in ${retryDelay}ms...`);
                if (i < maxRetries - 1) await new Promise(res => setTimeout(res, retryDelay));
            } else {
                // Logic error (e.g. constraint violation) — fail fast, no retry
                throw error;
            }
        }
    }
    throw lastError;
};

// ==================== EMPLOYEES ====================

const getAllEmployees = async () => {
    return retry(async () => {
        const { data, error } = await supabase.from('employees').select('*');
        if (error) throw new Error(error.message);
        return data || [];
    });
};

const getEmployeeById = async (id) => {
    return retry(async () => {
        const { data, error } = await supabase.from('employees').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data;
    });
};

const createEmployee = async (employee) => {
    // Retry once on transient pooler errors. maxRetries=2 keeps duplicate risk low.
    return retry(async () => {
        const { data, error } = await supabase.from('employees').insert([employee]).select().single();
        if (error) throw new Error(error.message);
        return data;
    }, 2, 800);
};

const updateEmployee = async (id, employee) => {
    return retry(async () => {
        const { data, error } = await supabase.from('employees').update(employee).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data;
    });
};

const deleteEmployee = async (id) => {
    return retry(async () => {
        // 1. Delete associated Attendance
        await supabase.from('attendance').delete().eq('employeeId', id);

        // 2. Delete associated Advances
        await supabase.from('advances').delete().eq('employeeId', id);

        // 3. Delete associated Payments
        await supabase.from('payments').delete().eq('employeeId', id);

        // 4. Delete associated Uploads (metadata out of DB)
        // (Note: To keep this safe/simple without tracking raw bucket file tokens in a single transaction, 
        // we just drop the DB metadata. Or we can leave orphan images. The request is DB wipe.)
        await supabase.from('uploads').delete().eq('employeeId', id);

        // 5. Finally, Delete the Employee record itself
        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
    });
};

// ==================== ATTENDANCE ====================

const getAllAttendance = async () => {
    return retry(async () => {
        let allData = [];
        let from = 0;
        let to = 999;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase.from('attendance').select('*').range(from, to);
            if (error) throw new Error(error.message);
            if (data && data.length > 0) {
                allData = allData.concat(data);
                if (data.length < 1000) {
                    hasMore = false;
                } else {
                    from += 1000;
                    to += 1000;
                }
            } else {
                hasMore = false;
            }
        }
        return allData;
    });
};

const getAttendanceById = async (id) => {
    return retry(async () => {
        const { data, error } = await supabase.from('attendance').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data;
    });
};

const checkDuplicateAttendance = async (employeeId, date) => {
    return retry(async () => {
        const { data, error } = await supabase
            .from('attendance')
            .select('id')
            .eq('employeeId', employeeId)
            .eq('date', date)
            .limit(1);

        if (error) throw new Error(error.message);
        return data && data.length > 0;
    });
};

const createAttendance = async (attendance) => {
    return retry(async () => {
        const { data, error } = await supabase.from('attendance').insert([attendance]).select().single();
        if (error) throw new Error(error.message);
        return data;
    }, 2, 800);
};

const updateAttendance = async (id, attendance) => {
    // Use higher base delay (1200ms) to give PgBouncer/schema_migrations time to recover.
    // Checkout operations are the most user-visible, so we retry more patiently.
    return retry(async () => {
        const { data, error } = await supabase.from('attendance').update(attendance).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data;
    }, 5, 1200);
};

const deleteAttendance = async (id) => {
    return retry(async () => {
        const { error } = await supabase.from('attendance').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
    });
};

// ==================== ADVANCES ====================

const getAllAdvances = async () => {
    return retry(async () => {
        let allData = [];
        let from = 0;
        let to = 999;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase.from('advances').select('*').range(from, to);
            if (error) throw new Error(error.message);
            if (data && data.length > 0) {
                allData = allData.concat(data);
                if (data.length < 1000) {
                    hasMore = false;
                } else {
                    from += 1000;
                    to += 1000;
                }
            } else {
                hasMore = false;
            }
        }
        return allData;
    });
};

const getAdvanceById = async (id) => {
    return retry(async () => {
        const { data, error } = await supabase.from('advances').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data;
    });
};

const createAdvance = async (advance) => {
    return retry(async () => {
        const { data, error } = await supabase.from('advances').insert([advance]).select().single();
        if (error) throw new Error(error.message);
        return data;
    }, 2, 800);
};

const updateAdvance = async (id, advance) => {
    return retry(async () => {
        const { data, error } = await supabase.from('advances').update(advance).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data;
    });
};

const deleteAdvance = async (id) => {
    return retry(async () => {
        const { error } = await supabase.from('advances').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
    });
};

// ==================== PAYMENTS ====================

const getAllPayments = async () => {
    return retry(async () => {
        let allData = [];
        let from = 0;
        let to = 999;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase.from('payments').select('*').range(from, to);
            if (error) throw new Error(error.message);
            if (data && data.length > 0) {
                allData = allData.concat(data);
                if (data.length < 1000) {
                    hasMore = false;
                } else {
                    from += 1000;
                    to += 1000;
                }
            } else {
                hasMore = false;
            }
        }
        return allData;
    });
};

const getPaymentById = async (id) => {
    return retry(async () => {
        const { data, error } = await supabase.from('payments').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data;
    });
};

const createPayment = async (payment) => {
    return retry(async () => {
        const { data, error } = await supabase.from('payments').insert([payment]).select().single();
        if (error) throw new Error(error.message);
        return data;
    }, 2, 800);
};

const updatePayment = async (id, payment) => {
    return retry(async () => {
        const { data, error } = await supabase.from('payments').update(payment).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data;
    });
};

const deletePayment = async (id) => {
    return retry(async () => {
        const { error } = await supabase.from('payments').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
    });
};

// ==================== SETTINGS ====================

const getSettings = async () => {
    return retry(async () => {
        const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
        if (error) {
            // If no settings found, return defaults (or create them)
            if (error.code === 'PGRST116') { // specific error for 0 rows
                return { standardHours: 8.5, slabHours: 6, maintenanceMode: false, restrictEarlyCheckIn: false };
            }
            throw new Error(error.message);
        }
        const result = data || { standardHours: 8.5, slabHours: 6, maintenanceMode: false, restrictEarlyCheckIn: false };
        // Ensure booleans are always proper booleans
        result.maintenanceMode = Boolean(result.maintenanceMode);
        result.restrictEarlyCheckIn = Boolean(result.restrictEarlyCheckIn);
        return result;
    });
};

const updateSettings = async (settings) => {
    return retry(async () => {
        // Build a clean payload with only known fields
        const payload = {
            standardHours: settings.standardHours,
            slabHours: settings.slabHours,
            maintenanceMode: settings.maintenanceMode !== undefined ? Boolean(settings.maintenanceMode) : false,
            restrictEarlyCheckIn: settings.restrictEarlyCheckIn !== undefined ? Boolean(settings.restrictEarlyCheckIn) : false
        };
        const { data, error } = await supabase.from('settings').update(payload).eq('id', 1).select().single();
        if (error) throw new Error(error.message);
        if (data) {
            data.maintenanceMode = Boolean(data.maintenanceMode);
            data.restrictEarlyCheckIn = Boolean(data.restrictEarlyCheckIn);
        }
        return data;
    });
};

// ==================== HOLIDAYS ====================

const getAllHolidays = async () => {
    return retry(async () => {
        const { data, error } = await supabase.from('holidays').select('date');
        if (error) throw new Error(error.message);
        return (data || []).map(row => row.date);
    });
};

const setHolidays = async (dates) => {
    // Transaction-like logic. Retrying partly done ops is risky.
    // But 'delete' + 'insert' is roughly idempotent IF dates are unique?
    // We'll skip retry for this complex op for now.

    // 1. Delete all holidays
    // Note: We need a way to delete all. 'neq' is a useful workaround if ID is standard
    // Or we can just delete where ID > 0
    const { error: deleteError } = await supabase.from('holidays').delete().gt('id', 0);
    if (deleteError) throw new Error(deleteError.message);

    // 2. Insert new holidays if any
    if (dates.length > 0) {
        const rows = dates.map(date => ({ date }));
        const { error: insertError } = await supabase.from('holidays').insert(rows);
        if (insertError) throw new Error(insertError.message);
    }

    return { success: true };
};

// ==================== FACTORY RESET ====================

const factoryReset = async () => {
    // Delete all data (Idempotent, safe to retry potentially)
    return retry(async () => {
        await supabase.from('attendance').delete().gt('id', ''); // String ID
        await supabase.from('advances').delete().gt('id', '');
        await supabase.from('payments').delete().gt('id', '');
        await supabase.from('employees').delete().gt('id', '');
        await supabase.from('holidays').delete().gt('id', 0); // Integer ID

        // Reset settings
        await supabase.from('settings').update({ standardHours: 8.5, slabHours: 6 }).eq('id', 1);

        return { success: true };
    });
};

// ==================== STORAGE ====================

const uploadFile = async (fileBuffer, fileName, mimeType) => {
    // Uploads are upsert=true, so idempotent. Safe to retry.
    // BUT uploading large files might be heavy to retry.
    // We'll retry once or twice.
    return retry(async () => {
        // 1. Upload file to 'uploads' bucket
        const { data, error } = await supabase.storage
            .from('uploads')
            .upload(fileName, fileBuffer, {
                contentType: mimeType,
                upsert: true
            });

        if (error) throw new Error(error.message);

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('uploads')
            .getPublicUrl(fileName);

        return publicUrl;
    }, 2, 1000); // Max 2 retries, 1s delay
};

const getStorageUsage = async () => {
    return retry(async () => {
        // List all files in the 'uploads' bucket
        // The list function returns a maximum of 100 items by default.
        // For a complete count we need to handle pagination if there are more than 100
        let allFiles = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabase.storage
                .from('uploads')
                .list('', {
                    limit: limit,
                    offset: offset,
                    sortBy: { column: 'name', order: 'asc' },
                });

            if (error) throw new Error(error.message);

            if (data && data.length > 0) {
                allFiles = allFiles.concat(data);
                offset += limit;
                // If we got fewer items than the limit, we've reached the end
                if (data.length < limit) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        // Add up the sizes of all files in bytes
        const totalBytes = allFiles.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);

        // Convert to Megabytes (MB)
        const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

        return {
            bytes: totalBytes,
            megabytes: totalMB,
            limitMB: 1024, // Supabase Free tier limit is 1GB
            percentageUsed: ((totalMB / 1024) * 100).toFixed(2),
            fileCount: allFiles.length
        };
    });
};

const deleteFile = async (pathOrUrl) => {
    if (!pathOrUrl) return;

    return retry(async () => {
        let fileName = pathOrUrl;
        if (pathOrUrl.includes('/uploads/')) {
            fileName = pathOrUrl.split('/uploads/').pop();
        }

        const { error } = await supabase.storage
            .from('uploads')
            .remove([fileName]);

        if (error) console.error('Error deleting file:', error.message);
        return { success: true };
    });
};

const getDatabaseUsageEstimate = async () => {
    return retry(async () => {
        // Fetch a rough count/sample of all main tables
        // There's no direct way to get raw DB size from the free tier REST API.
        // We'll approximate by pulling all records (which we already do for dashboard)
        // and sizing the JSON.

        const [emp, att, adv, pay] = await Promise.all([
            supabase.from('employees').select('*'),
            supabase.from('attendance').select('*'),
            supabase.from('advances').select('*'),
            supabase.from('payments').select('*')
        ]);

        let totalBytes = 0;

        const sizeOf = (obj) => obj && !obj.error ? JSON.stringify(obj.data).length : 0;

        // Count approximate JSON bytes
        totalBytes += sizeOf(emp);
        totalBytes += sizeOf(att);
        totalBytes += sizeOf(adv);
        totalBytes += sizeOf(pay);

        // Add Postgres overhead multiplier (approx 2x-3x for indexes/bloat)
        const estimatedBytes = totalBytes * 2.5;

        const totalMB = (estimatedBytes / (1024 * 1024)).toFixed(3);
        const limitMB = 500; // Supabase Free tier DB limit

        return {
            bytes: estimatedBytes,
            megabytes: totalMB,
            limitMB: limitMB,
            percentageUsed: ((totalMB / limitMB) * 100).toFixed(4)
        };
    });
};

const importData = async (payload) => {
    return retry(async () => {
        const { employees, attendance, advances, payments } = payload;

        let results = {
            employees: 0,
            attendance: 0,
            advances: 0,
            payments: 0
        };

        // Employees
        if (employees && employees.length > 0) {
            const { error } = await supabase.from('employees').upsert(employees, { onConflict: 'id' });
            if (error) throw new Error("Employee Import Error: " + error.message);
            results.employees = employees.length;
        }

        // Attendance
        if (attendance && attendance.length > 0) {
            const { error } = await supabase.from('attendance').upsert(attendance, { onConflict: 'id' });
            if (error) throw new Error("Attendance Import Error: " + error.message);
            results.attendance = attendance.length;
        }

        // Advances
        if (advances && advances.length > 0) {
            const { error } = await supabase.from('advances').upsert(advances, { onConflict: 'id' });
            if (error) throw new Error("Advances Import Error: " + error.message);
            results.advances = advances.length;
        }

        // Payments
        if (payments && payments.length > 0) {
            const { error } = await supabase.from('payments').upsert(payments, { onConflict: 'id' });
            if (error) throw new Error("Payments Import Error: " + error.message);
            results.payments = payments.length;
        }

        return results;
    });
};

module.exports = {
    supabase,
    getAllEmployees,
    getEmployeeById,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getAllAttendance,
    getAttendanceById,
    createAttendance,
    updateAttendance,
    deleteAttendance,
    checkDuplicateAttendance,
    getAllAdvances,
    getAdvanceById,
    createAdvance,
    updateAdvance,
    deleteAdvance,
    getAllPayments,
    getPaymentById,
    createPayment,
    updatePayment,
    deletePayment,
    getSettings,
    updateSettings,
    getAllHolidays,
    setHolidays,
    factoryReset,
    uploadFile,
    getStorageUsage,
    getDatabaseUsageEstimate,
    importData,
    deleteFile
};
