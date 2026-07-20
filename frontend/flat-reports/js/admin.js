// Admin Dashboard Logic

let sitesList = [];
let currentSiteId = null;
let currentSiteFlats = [];
let allEmployees = [];
let currentAssignments = [];
let selectedFlatId = null;

// Initialize Admin Portal
async function initAdminPortal() {
    // Detect which page we are on
    const form = document.getElementById('create-site-form');
    if (form) {
        // Site Configuration Page
        return;
    }

    // Dashboard View Page
    await loadSitesSummary();
}

// Fetch and render all sites
async function loadSitesSummary() {
    const gridEl = document.getElementById('sites-grid');
    gridEl.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:3rem; color:var(--gray);">Loading project sites...</p>';

    try {
        sitesList = await apiFetch('/sites');
        gridEl.innerHTML = '';

        if (sitesList.length === 0) {
            gridEl.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding:3rem; color:var(--gray);">No project sites created yet. Click "Create New Site" to configure one.</p>';
            return;
        }

        sitesList.forEach(site => {
            const card = document.createElement('div');
            card.className = 'card site-card';
            card.onclick = () => viewSiteDetails(site.id);
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                    <h3 style="color:var(--primary); font-size:1.2rem; font-weight:700;">${site.name}</h3>
                    <span class="badge badge-completed">${site.progress}% Complete</span>
                </div>
                <p style="color:var(--gray); font-size:0.85rem; margin-bottom:0.75rem;">📍 ${site.address || 'No address specified'}</p>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${site.progress}%"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--gray); margin-top:0.35rem; font-weight:600;">
                    <span>${site.total_flats} Generated Flats</span>
                    <span>Floors: ${site.total_floors} • Flats/Floor: ${site.flats_per_floor}</span>
                </div>
            `;
            gridEl.appendChild(card);
        });
    } catch (e) {
        gridEl.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--danger); padding:3rem;">Error loading sites: ${e.message}</p>`;
    }
}

// Show Site Details View
async function viewSiteDetails(siteId) {
    currentSiteId = siteId;
    const selectedSite = sitesList.find(s => s.id === siteId);
    if (!selectedSite) return;

    document.getElementById('detail-site-name').textContent = selectedSite.name;
    document.getElementById('sites-summary-view').style.display = 'none';
    document.getElementById('site-detail-view').style.display = 'block';

    const flatsGrid = document.getElementById('admin-flats-grid');
    flatsGrid.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:1.5rem; color:var(--gray);">Loading metrics...</p>';

    try {
        const metrics = await apiFetch(`/sites/${siteId}/dashboard`);
        
        // 1. Overall Progress
        document.getElementById('detail-progress-bar').style.width = `${metrics.completionProgress}%`;
        document.getElementById('detail-progress-text').textContent = `${metrics.completionProgress}%`;

        // 2. Stage Completion bars
        renderStageMetrics(metrics.stageCompletion);

        // 3. Room Completion bars
        renderRoomMetrics(metrics.roomTypeCompletion);

        // 4. Populate audit logs feed
        renderAuditLogs(metrics.recentActivity);

        // 5. Store flats
        currentSiteFlats = metrics.flatMetrics;
        populateAdminFilters(currentSiteFlats);
        filterAdminFlats();

    } catch (e) {
        flatsGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--danger); padding:1.5rem;">Error loading metrics: ${e.message}</p>`;
    }
}

function showSitesSummary() {
    currentSiteId = null;
    currentSiteFlats = [];
    document.getElementById('sites-summary-view').style.display = 'block';
    document.getElementById('site-detail-view').style.display = 'none';
    loadSitesSummary();
}

// Render Stage Progress Row Meters
function renderStageMetrics(stages) {
    const container = document.getElementById('stage-progress-bars');
    container.innerHTML = '';

    const labels = {
        slab_piping: 'Slab Piping',
        box_piping: 'Box Piping',
        rope_pulling: 'Rope Pulling',
        wiring: 'Wiring',
        final_handover: 'Final Handover'
    };

    Object.keys(labels).forEach(type => {
        const val = stages[type] || 0;
        const row = document.createElement('div');
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600; margin-bottom:0.2rem;">
                <span>${labels[type]}</span>
                <span>${val}%</span>
            </div>
            <div class="progress-bar-container" style="margin:0; height:6px;">
                <div class="progress-bar-fill" style="width: ${val}%; background-color: var(--secondary);"></div>
            </div>
        `;
        container.appendChild(row);
    });
}

// Render Room Progress Row Meters
function renderRoomMetrics(rooms) {
    const container = document.getElementById('room-progress-bars');
    container.innerHTML = '';

    const labels = {
        hall: 'Hall',
        kitchen: 'Kitchen',
        bedroom: 'Bedrooms',
        bathroom: 'Bathrooms'
    };

    Object.keys(labels).forEach(type => {
        const val = rooms[type] || 0;
        const row = document.createElement('div');
        row.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; font-weight:600; margin-bottom:0.2rem;">
                <span>${labels[type]}</span>
                <span>${val}%</span>
            </div>
            <div class="progress-bar-container" style="margin:0; height:6px;">
                <div class="progress-bar-fill" style="width: ${val}%; background-color: #3b82f6;"></div>
            </div>
        `;
        container.appendChild(row);
    });
}

// Populate audit log feed
function renderAuditLogs(logs) {
    const list = document.getElementById('activity-logs-list');
    list.innerHTML = '';

    if (logs.length === 0) {
        list.innerHTML = '<li class="activity-item" style="text-align:center; color:var(--gray); padding:1rem;">No reports or modifications logged yet.</li>';
        return;
    }

    logs.forEach(log => {
        const li = document.createElement('li');
        li.className = 'activity-item';
        
        let details = '';
        if (log.old_value === null && log.new_value === 'New Photo Added') {
            details = `uploaded a photo for <strong>${log.field_changed}</strong>`;
        } else {
            details = `updated <strong>${log.field_changed}</strong> from <code>${log.old_value || 'None'}</code> to <code>${log.new_value || 'None'}</code>`;
        }

        const timeStr = new Date(log.changed_at).toLocaleString();

        li.innerHTML = `
            <div>👷 <strong>${log.changed_by}</strong> ${details} in Flat <strong>${log.flat_number}</strong></div>
            <div class="activity-meta">${timeStr}</div>
        `;
        list.appendChild(li);
    });
}

// Populate floor and bhk filters
function populateAdminFilters(flats) {
    const floorSelect = document.getElementById('admin-filter-floor');
    const bhkSelect = document.getElementById('admin-filter-bhk');

    floorSelect.innerHTML = '<option value="all">All Floors</option>';
    bhkSelect.innerHTML = '<option value="all">All BHKs</option>';

    const floors = [...new Set(flats.map(f => f.floor_number))].sort((a, b) => a - b);
    const bhks = [...new Set(flats.map(f => f.bhk_type))].sort();

    floors.forEach(f => {
        floorSelect.innerHTML += `<option value="${f}">Floor ${f}</option>`;
    });

    bhks.forEach(b => {
        bhkSelect.innerHTML += `<option value="${b}">${b}</option>`;
    });
}

// Filter flats
function filterAdminFlats() {
    const floorFilter = document.getElementById('admin-filter-floor').value;
    const bhkFilter = document.getElementById('admin-filter-bhk').value;

    let filtered = [...currentSiteFlats];

    if (floorFilter !== 'all') {
        filtered = filtered.filter(f => f.floor_number === parseInt(floorFilter));
    }
    if (bhkFilter !== 'all') {
        filtered = filtered.filter(f => f.bhk_type === bhkFilter);
    }

    renderAdminFlatsGrid(filtered);
}

// Render flats
function renderAdminFlatsGrid(flats) {
    const gridEl = document.getElementById('admin-flats-grid');
    gridEl.innerHTML = '';

    if (flats.length === 0) {
        gridEl.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:1.5rem; color:var(--gray);">No matching flats.</p>';
        return;
    }

    flats.forEach(flat => {
        const card = document.createElement('div');
        card.className = `flat-card status-${flat.status}`;
        card.onclick = () => openAdminFlatModal(flat.id);
        card.innerHTML = `
            <div class="flat-number">${flat.flat_number}</div>
            <div class="flat-bhk">${flat.bhk_type}</div>
            <div style="font-size:0.75rem; font-weight:700; color:var(--primary); margin-top:0.4rem;">${flat.progress}%</div>
        `;
        gridEl.appendChild(card);
    });
}

// ==================== FLAT DETAIL MODAL FOR ADMINS ====================

async function openAdminFlatModal(flatId) {
    selectedFlatId = flatId;
    const flat = currentSiteFlats.find(f => f.id === flatId);
    if (!flat) return;

    // Reset edit form display state
    document.getElementById('admin-flat-edit-form').style.display = 'none';

    document.getElementById('admin-modal-title').textContent = `Flat ${flat.flat_number} Details`;
    document.getElementById('admin-modal-subtitle').textContent = `${flat.bhk_type} • Floor ${flat.floor_number} • ${flat.progress}% Complete`;

    const roomsContainer = document.getElementById('admin-modal-rooms');
    const stagesContainer = document.getElementById('admin-modal-stages');

    roomsContainer.innerHTML = '<p style="text-align:center; color:var(--gray); padding:1rem;">Loading...</p>';
    stagesContainer.innerHTML = '';

    document.getElementById('admin-flat-modal').style.display = 'flex';

    try {
        const res = await apiFetch(`/flats/${flatId}/report`);
        
        // Rooms Render
        roomsContainer.innerHTML = '';
        res.rooms.forEach(room => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '1rem';
            card.style.marginBottom = '0';
            
            const roomPhotos = res.photos.filter(p => p.room_id === room.id);

            let pointsHtml = `<span>💡 Lights: ${room.light_points || 0}</span>
                              <span>🌀 Fans: ${room.fan_points || 0}</span>`;
            if (room.room_type === 'kitchen' || room.room_type === 'bathroom') {
                pointsHtml += `<span>🔥 Geysers: ${room.geyser_points || 0}</span>`;
            }
            if (room.room_type === 'hall' || room.room_type === 'bedroom') {
                pointsHtml += `<span>❄️ AC: ${room.ac_points || 0}</span>
                               <span>📺 TV: ${room.tv_points || 0}</span>
                               <span>🌐 Internet: ${room.internet_points || 0}</span>`;
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.5rem;">
                    <div style="font-weight:700;">🚪 ${room.room_label}</div>
                    <span class="badge badge-${room.status.replace('_', '-')}">${room.status.replace('_', ' ')}</span>
                </div>
                <div style="display:flex; gap:1rem; flex-wrap:wrap; font-size:0.8rem; font-weight:600; color:var(--gray); margin-bottom:0.5rem;">
                    ${pointsHtml}
                </div>
                ${room.remarks ? `<p style="font-size:0.8rem; background:rgba(0,0,0,0.03); padding:0.4rem; border-radius:4px; font-style:italic;">"${room.remarks}"</p>` : ''}
                
                ${roomPhotos.length > 0 ? `
                    <div style="display:flex; gap:0.4rem; margin-top:0.5rem; overflow-x:auto;">
                        ${roomPhotos.map(p => `
                            <img src="${p.drive_thumbnail_url}" onclick="window.open('${p.drive_view_url}', '_blank')" 
                                 style="width:50px; height:50px; object-fit:cover; border-radius:6px; border:1px solid #ccc; cursor:pointer;" title="View in Drive">
                        `).join('')}
                    </div>
                ` : ''}
            `;
            roomsContainer.appendChild(card);
        });

        // Stages Render
        stagesContainer.innerHTML = '';
        res.stages.forEach(stage => {
            const row = document.createElement('div');
            row.className = 'stage-row';
            
            const stagePhotos = res.photos.filter(p => p.stage_id === stage.id);
            const label = formatStageLabel(stage.stage_type);

            row.innerHTML = `
                <div style="flex:1;">
                    <div style="font-weight:700;">${label}</div>
                    ${stage.handover_date ? `<div style="font-size:0.75rem; color:var(--gray); margin-top:2px;">Handover: ${stage.handover_date}</div>` : ''}
                    
                    ${stagePhotos.length > 0 ? `
                        <div style="display:flex; gap:0.4rem; margin-top:0.4rem;">
                            ${stagePhotos.map(p => `
                                <img src="${p.drive_thumbnail_url}" onclick="window.open('${p.drive_view_url}', '_blank')" 
                                     style="width:40px; height:40px; object-fit:cover; border-radius:4px; border:1px solid #ccc; cursor:pointer;">
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                <span class="badge badge-${stage.status.replace('_', '-')}">${stage.status.replace('_', ' ')}</span>
            `;
            stagesContainer.appendChild(row);
        });

    } catch (e) {
        roomsContainer.innerHTML = `<p style="text-align:center; color:var(--danger); padding:1rem;">Error: ${e.message}</p>`;
    }
}

function formatStageLabel(type) {
    switch (type) {
        case 'slab_piping': return 'Slab Piping';
        case 'box_piping': return 'Box Piping';
        case 'rope_pulling': return 'Rope Pulling';
        case 'wiring': return 'Wiring';
        case 'final_handover': return 'Final Handover';
        default: return type;
    }
}

function closeAdminFlatModal() {
    document.getElementById('admin-flat-modal').style.display = 'none';
    document.getElementById('admin-flat-edit-form').style.display = 'none';
    selectedFlatId = null;
}

function toggleEditFlatMode(show) {
    const form = document.getElementById('admin-flat-edit-form');
    const isVisible = form.style.display === 'block';
    const shouldShow = show !== undefined ? show : !isVisible;

    if (shouldShow && selectedFlatId) {
        const flat = currentSiteFlats.find(f => f.id === selectedFlatId);
        if (flat) {
            document.getElementById('edit-flat-number').value = flat.flat_number || '';
            document.getElementById('edit-flat-bhk').value = flat.bhk_type || '2BHK';
            document.getElementById('edit-flat-desc').value = flat.description || '';
        }
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
    }
}

async function saveFlatMetadata() {
    if (!selectedFlatId) return;

    const flatNumber = document.getElementById('edit-flat-number').value.trim();
    const bhkType = document.getElementById('edit-flat-bhk').value;
    const description = document.getElementById('edit-flat-desc').value.trim();

    if (!flatNumber) {
        alert('Please enter a flat number.');
        return;
    }

    try {
        const saveBtn = document.querySelector('#admin-flat-edit-form .btn-primary');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        await apiFetch(`/flats/${selectedFlatId}`, {
            method: 'PUT',
            body: JSON.stringify({
                flat_number: flatNumber,
                bhk_type: bhkType,
                description
            })
        });

        // Hide form
        toggleEditFlatMode(false);

        // Reload site flats grid to update the UI cards
        if (currentSiteId) {
            await viewSiteDetails(currentSiteId);
        }

        // Re-open/refresh modal to show updated title, subtitle, and reconciled rooms list
        await openAdminFlatModal(selectedFlatId);

    } catch (e) {
        alert('Failed to update flat: ' + e.message);
    } finally {
        const saveBtn = document.querySelector('#admin-flat-edit-form .btn-primary');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

// ==================== SITE DELETE (Admin only) ====================

async function deleteSelectedSite() {
    if (!currentSiteId) return;
    
    const confirmDelete = confirm('⚠️ WARNING: Deleting this site will permanently remove all of its generated flats, flat progress reports, uploaded photo configurations, and activity log trails. This cannot be undone.\n\nAre you sure you want to delete this site?');
    if (!confirmDelete) return;

    try {
        await apiFetch(`/sites/${currentSiteId}`, {
            method: 'DELETE'
        });
        alert('Site deleted successfully.');
        showSitesSummary();
    } catch (e) {
        alert('Delete failed: ' + e.message);
    }
}

// ==================== ASSIGN SUPERVISORS MODAL ====================

async function openAssignModal() {
    const listEl = document.getElementById('supervisors-checkboxes-list');
    listEl.innerHTML = '<p style="text-align:center; padding:1rem; color:var(--gray);">Loading employees...</p>';

    document.getElementById('assign-modal').style.display = 'flex';

    try {
        // Fetch all employees + site assignments in parallel
        const [emps, assigns] = await Promise.all([
            apiFetch('/employees'),
            apiFetch(`/sites/${currentSiteId}/assignments`)
        ]);

        allEmployees = emps;
        currentAssignments = assigns;

        listEl.innerHTML = '';

        if (allEmployees.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; padding:1rem; color:var(--gray);">No employees found in system. Add them in Employee section.</p>';
            return;
        }

        allEmployees.forEach(emp => {
            const isAssigned = currentAssignments.some(a => a.employee_id === String(emp.id));
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '0.5rem';
            div.innerHTML = `
                <input type="checkbox" id="chk-emp-${emp.id}" data-id="${emp.id}" ${isAssigned ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
                <label for="chk-emp-${emp.id}" style="cursor:pointer; font-weight:600;">
                    ${emp.name} <span style="font-size:0.75rem; color:var(--gray); font-weight:500;">(${emp.designation || 'Electrician'})</span>
                </label>
            `;
            listEl.appendChild(div);
        });
    } catch (e) {
        listEl.innerHTML = `<p style="text-align:center; color:var(--danger); padding:1rem;">Error: ${e.message}</p>`;
    }
}

function closeAssignModal() {
    document.getElementById('assign-modal').style.display = 'none';
}

async function saveAssignments() {
    const checkboxes = document.querySelectorAll('#supervisors-checkboxes-list input[type="checkbox"]');
    
    try {
        for (const chk of checkboxes) {
            const employeeId = String(chk.dataset.id);
            const isChecked = chk.checked;
            const wasAssigned = currentAssignments.some(a => a.employee_id === employeeId);

            if (isChecked && !wasAssigned) {
                // Add assignment
                await apiFetch(`/sites/${currentSiteId}/assign`, {
                    method: 'POST',
                    body: JSON.stringify({ employeeId })
                });
            } else if (!isChecked && wasAssigned) {
                // Remove assignment
                await apiFetch(`/sites/${currentSiteId}/assign/${employeeId}`, {
                    method: 'DELETE'
                });
            }
        }

        alert('Assignments updated successfully.');
        closeAssignModal();
        viewSiteDetails(currentSiteId); // Refresh dashboard to update logs
    } catch (e) {
        alert('Save assignments failed: ' + e.message);
    }
}

// ==================== CONFIGURE SITE SUBMISSION ====================

async function handleCreateSite(e) {
    e.preventDefault();

    const name = document.getElementById('site-name').value;
    const address = document.getElementById('site-address').value;
    const description = document.getElementById('site-desc').value;
    const total_floors = document.getElementById('total-floors').value;
    const flats_per_floor = document.getElementById('flats-per-floor').value;

    // Collect active BHK chips
    const bhkChips = document.querySelectorAll('#bhk-chips-container .bhk-chip.active');
    const bhk_types = Array.from(bhkChips).map(c => c.dataset.val);

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⚙️ Generating Flats...';

    try {
        await apiFetch('/sites', {
            method: 'POST',
            body: JSON.stringify({
                name,
                address,
                description,
                total_floors,
                flats_per_floor,
                bhk_types
            })
        });

        alert(`Site "${name}" created and flats auto-generated successfully!`);
        location.href = 'admin-dashboard.html';
    } catch (err) {
        alert('Generation failed: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    enforceRole('admin');
    initAdminPortal();
});
