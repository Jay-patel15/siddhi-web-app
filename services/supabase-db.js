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

const supabase = createClient(SUPABASE_URL, SUPABASE_Service_Role_KEY);

// Retry Helper for Transient Network Errors
// Only use for Idempotent operations (Select, Update, Delete)
const retry = async (operation, maxRetries = 3, delay = 500) => {
    let lastError;
    // Simple exponential backoff
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            // Only retry network errors or timeouts (fetch failed usually means network)
            const isNetworkError = error.message.includes('fetch failed') || error.message.includes('network') || error.message.includes('timeout') || error.message.includes('ECONNRESET');

            if (isNetworkError) {
                console.warn(`Database operation failed (Attempt ${i + 1}/${maxRetries}): ${error.message}. Retrying...`);
                if (i < maxRetries - 1) await new Promise(res => setTimeout(res, delay * (i + 1)));
            } else {
                // If logic error (e.g. constraint violation), fail fast
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
    // Insert is NOT retried automatically to avoid dupes unless error is strictly network BEFORE transmit
    // But for simplicity/safety, we don't retry Insert here.
    const { data, error } = await supabase.from('employees').insert([employee]).select().single();
    if (error) throw new Error(error.message);
    return data;
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
        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return { success: true };
    });
};

// ==================== ATTENDANCE ====================

const getAllAttendance = async () => {
    return retry(async () => {
        const { data, error } = await supabase.from('attendance').select('*');
        if (error) throw new Error(error.message);
        return data || [];
    });
};

const getAttendanceById = async (id) => {
    return retry(async () => {
        const { data, error } = await supabase.from('attendance').select('*').eq('id', id).single();
        if (error) throw new Error(error.message);
        return data;
    });
};

const createAttendance = async (attendance) => {
    const { data, error } = await supabase.from('attendance').insert([attendance]).select().single();
    if (error) throw new Error(error.message);
    return data;
};

const updateAttendance = async (id, attendance) => {
    return retry(async () => {
        const { data, error } = await supabase.from('attendance').update(attendance).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return data;
    });
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
        const { data, error } = await supabase.from('advances').select('*');
        if (error) throw new Error(error.message);
        return data || [];
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
    const { data, error } = await supabase.from('advances').insert([advance]).select().single();
    if (error) throw new Error(error.message);
    return data;
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
        const { data, error } = await supabase.from('payments').select('*');
        if (error) throw new Error(error.message);
        return data || [];
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
    const { data, error } = await supabase.from('payments').insert([payment]).select().single();
    if (error) throw new Error(error.message);
    return data;
};

// ==================== SETTINGS ====================

const getSettings = async () => {
    return retry(async () => {
        const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
        if (error) {
            // If no settings found, return defaults (or create them)
            if (error.code === 'PGRST116') { // specific error for 0 rows
                return { standardHours: 8.5, slabHours: 6 };
            }
            throw new Error(error.message);
        }
        return data || { standardHours: 8.5, slabHours: 6 };
    });
};

const updateSettings = async (settings) => {
    return retry(async () => {
        const { data, error } = await supabase.from('settings').update(settings).eq('id', 1).select().single();
        if (error) throw new Error(error.message);
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
    getAllAdvances,
    getAdvanceById,
    createAdvance,
    updateAdvance,
    deleteAdvance,
    getAllPayments,
    getPaymentById,
    createPayment,
    getSettings,
    updateSettings,
    getAllHolidays,
    setHolidays,
    factoryReset,
    uploadFile,
    deleteFile
};
