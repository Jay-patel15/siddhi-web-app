const API_URL = '/api/flat-reports';

// Verify and retrieve user session
function getSession() {
    const sessionStr = localStorage.getItem('payroll_session');
    if (!sessionStr) {
        window.location.href = '/login.html';
        return null;
    }

    try {
        const session = JSON.parse(sessionStr);
        const now = Date.now();
        const limit = 12 * 60 * 60 * 1000; // 12 Hours

        if (now - session.timestamp > limit) {
            localStorage.removeItem('payroll_session');
            window.location.href = '/login.html';
            return null;
        }
        return session;
    } catch (e) {
        localStorage.removeItem('payroll_session');
        window.location.href = '/login.html';
        return null;
    }
}

// Ensure the page is accessed by correct roles
function enforceRole(requiredRole) {
    const session = getSession();
    if (!session) return;

    if (requiredRole === 'admin' && session.role !== 'admin') {
        // Supervisors go to employee portal / supervisor view
        window.location.replace('/flat-reports/supervisor-portal.html');
    } else if (requiredRole === 'employee' && session.role !== 'employee' && session.role !== 'admin') {
        window.location.replace('/login.html');
    }
}

// Generate authentication headers
function getHeaders(contentType = 'application/json') {
    const session = getSession();
    if (!session) return {};

    const userId = session.role === 'admin' ? 'admin' : (session.employeeId || '');
    const userName = session.role === 'admin' ? (session.username || 'Admin') : (session.employeeName || 'Unknown');

    const headers = {
        'x-user-role': session.role,
        'x-user-id': String(userId),
        'x-user-name': String(userName)
    };

    if (contentType) {
        headers['Content-Type'] = contentType;
    }

    return headers;
}

// Wrapped fetch with authorization
async function apiFetch(endpoint, options = {}) {
    const session = getSession();
    if (!session) throw new Error('Unauthorized');

    // Default to JSON content type unless body is FormData (e.g., photo upload)
    const isFormData = options.body instanceof FormData;
    const contentType = isFormData ? null : 'application/json';
    
    const headers = {
        ...getHeaders(contentType),
        ...(options.headers || {})
    };

    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers
    });

    if (res.status === 401 || res.status === 403) {
        alert('Session expired or access denied.');
        window.location.href = '/login.html';
        throw new Error('Unauthorized');
    }

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error! status: ${res.status}`);
    }

    return await res.json();
}

// ==================== SIDEBAR & UTILS ====================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.overlay');
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}

function closeSidebarOnMobile() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

function logout() {
    localStorage.removeItem('payroll_session');
    window.location.href = '/login.html';
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
    
    // For supervisor top bar buttons
    const supIcon = document.getElementById('portal-dark-btn');
    if (supIcon) supIcon.textContent = isDark ? '☀️' : '🌙';
}

// Initialize Dark Mode instantly on script load
initDarkMode();
