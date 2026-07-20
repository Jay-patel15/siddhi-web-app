// Supervisor Portal Logic

let assignedSites = [];
let siteFlats = [];
let selectedSite = null;
let selectedFlat = null;
let currentReportData = null;
let uploadTarget = null; // { type: 'room' | 'stage', id: string, label: string }

// Initialize supervisor flow
async function initSupervisorPortal() {
    try {
        const session = getSession();
        if (!session) return;

        document.getElementById('supervisor-name-label').textContent = `Supervisor: ${session.employeeName || 'Unknown'}`;
        
        await loadAssignedSites();
    } catch (e) {
        console.error('Initialization error:', e);
    }
}

// Fetch assigned sites from API
async function loadAssignedSites() {
    const listEl = document.getElementById('assigned-sites-list');
    try {
        assignedSites = await apiFetch('/sites');
        listEl.innerHTML = '';

        if (assignedSites.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; color:var(--gray); padding:2rem;">No sites assigned to you yet. Please contact Admin.</p>';
            return;
        }

        assignedSites.forEach(site => {
            const card = document.createElement('div');
            card.className = 'card site-card';
            card.onclick = () => selectSite(site.id);
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                    <h3 style="color:var(--primary); font-size:1.15rem; font-weight:700;">${site.name}</h3>
                    <span class="badge badge-completed">${site.progress}% Complete</span>
                </div>
                <p style="color:var(--gray); font-size:0.85rem; margin-bottom:0.75rem;">📍 ${site.address || 'No address specified'}</p>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${site.progress}%"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--gray); margin-top:0.25rem; font-weight:600;">
                    <span>${site.total_flats} Total Flats</span>
                    <span>FLAT REPORT GENERATOR</span>
                </div>
            `;
            listEl.appendChild(card);
        });

        // If only 1 site is assigned, auto-select it for efficiency
        if (assignedSites.length === 1) {
            selectSite(assignedSites[0].id);
        }
    } catch (e) {
        listEl.innerHTML = `<p style="text-align:center; color:var(--danger); padding:2rem;">Error: ${e.message}</p>`;
    }
}

// Select a site to view its flats
async function selectSite(siteId) {
    selectedSite = assignedSites.find(s => s.id === siteId);
    if (!selectedSite) return;

    document.getElementById('selected-site-title').textContent = selectedSite.name;
    document.getElementById('site-selector-container').style.display = 'none';
    document.getElementById('flats-viewer-container').style.display = 'block';

    const gridEl = document.getElementById('flats-grid');
    gridEl.innerHTML = '<p style="text-align:center; color:var(--gray); padding:2rem; grid-column: 1/-1;">Loading flats...</p>';

    try {
        siteFlats = await apiFetch(`/sites/${siteId}/flats`);
        
        // Populate Filters
        populateFilters(siteFlats);
        
        filterFlatsGrid();
    } catch (e) {
        gridEl.innerHTML = `<p style="text-align:center; color:var(--danger); padding:2rem; grid-column: 1/-1;">Error loading flats: ${e.message}</p>`;
    }
}

function showSiteSelector() {
    selectedSite = null;
    document.getElementById('site-selector-container').style.display = 'block';
    document.getElementById('flats-viewer-container').style.display = 'none';
    loadAssignedSites();
}

// Populate filters dynamically based on flat types present
function populateFilters(flats) {
    const floorSelect = document.getElementById('filter-floor');
    const bhkSelect = document.getElementById('filter-bhk');

    // Store current select values
    const prevFloor = floorSelect.value;
    const prevBhk = bhkSelect.value;

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

    // Reapply selection if valid
    if (floors.includes(parseInt(prevFloor))) floorSelect.value = prevFloor;
    if (bhks.includes(prevBhk)) bhkSelect.value = prevBhk;
}

// Filter flats by Floor and BHK selections
function filterFlatsGrid() {
    const floorFilter = document.getElementById('filter-floor').value;
    const bhkFilter = document.getElementById('filter-bhk').value;

    let filtered = [...siteFlats];

    if (floorFilter !== 'all') {
        filtered = filtered.filter(f => f.floor_number === parseInt(floorFilter));
    }
    if (bhkFilter !== 'all') {
        filtered = filtered.filter(f => f.bhk_type === bhkFilter);
    }

    renderFlatsGrid(filtered);
}

// Render flats grid
function renderFlatsGrid(flats) {
    const gridEl = document.getElementById('flats-grid');
    gridEl.innerHTML = '';

    if (flats.length === 0) {
        gridEl.innerHTML = '<p style="text-align:center; color:var(--gray); padding:2rem; grid-column:1/-1;">No flats match the filters.</p>';
        return;
    }

    flats.forEach(flat => {
        const card = document.createElement('div');
        card.className = `flat-card status-${flat.status}`;
        card.onclick = () => openReportForm(flat.id);
        card.innerHTML = `
            <div class="flat-number">${flat.flat_number}</div>
            <div class="flat-bhk">${flat.bhk_type}</div>
            <div style="font-size:0.75rem; font-weight:700; color:var(--primary); margin-top:0.4rem;">${flat.progress}%</div>
        `;
        gridEl.appendChild(card);
    });
}

// ==================== FLAT REPORT EDITING ====================

// Open the slide-up report form
async function openReportForm(flatId) {
    selectedFlat = siteFlats.find(f => f.id === flatId);
    if (!selectedFlat) return;

    // Set header
    document.getElementById('form-flat-title').textContent = `Flat ${selectedFlat.flat_number} Report`;
    document.getElementById('form-flat-subtitle').textContent = `${selectedFlat.bhk_type} • Floor ${selectedFlat.floor_number} • ${selectedSite.name}`;

    const accordionContainer = document.getElementById('rooms-accordion-container');
    const stagesContainer = document.getElementById('stages-container');

    accordionContainer.innerHTML = '<p style="text-align:center; color:var(--gray); padding:1rem;">Loading report data...</p>';
    stagesContainer.innerHTML = '';

    document.getElementById('report-form-overlay').classList.add('active');

    try {
        currentReportData = await apiFetch(`/flats/${flatId}/report`);
        
        // Render last updated tag
        const r = currentReportData.report;
        if (r.updated_by) {
            const dateStr = new Date(r.updated_at).toLocaleString();
            document.getElementById('last-updated-label').textContent = `Last updated by ${r.updated_by} on ${dateStr}`;
        } else {
            document.getElementById('last-updated-label').textContent = '';
        }

        renderRoomsAccordion(currentReportData.rooms, currentReportData.photos);
        renderStages(currentReportData.stages, currentReportData.photos);
    } catch (e) {
        accordionContainer.innerHTML = `<p style="text-align:center; color:var(--danger); padding:1rem;">Error: ${e.message}</p>`;
    }
}

function closeReportForm() {
    document.getElementById('report-form-overlay').classList.remove('active');
    selectedFlat = null;
    currentReportData = null;
    filterFlatsGrid(); // Refresh grid view
}

// Render Room Accordion Items
function renderRoomsAccordion(rooms, photos) {
    const container = document.getElementById('rooms-accordion-container');
    container.innerHTML = '';

    rooms.forEach((room, idx) => {
        const item = document.createElement('div');
        item.className = 'room-accordion-item';
        if (idx === 0) item.classList.add('active'); // Expand first item by default

        // Filter photos for this room
        const roomPhotos = photos.filter(p => p.room_id === room.id);

        // Determine point counters to render
        let pointsHtml = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap:0.75rem; margin-bottom:1.25rem;">
                <div style="text-align:center;">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--gray); display:block; margin-bottom:0.25rem;">💡 Light Pts</label>
                    <div class="stepper-container" style="margin:0 auto;">
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'light', -1); event.stopPropagation();">-</button>
                        <input type="number" id="light-${room.id}" class="stepper-input" value="${room.light_points || 0}" readonly>
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'light', 1); event.stopPropagation();">+</button>
                    </div>
                </div>
                <div style="text-align:center;">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--gray); display:block; margin-bottom:0.25rem;">🌀 Fan Pts</label>
                    <div class="stepper-container" style="margin:0 auto;">
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'fan', -1); event.stopPropagation();">-</button>
                        <input type="number" id="fan-${room.id}" class="stepper-input" value="${room.fan_points || 0}" readonly>
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'fan', 1); event.stopPropagation();">+</button>
                    </div>
                </div>
        `;

        if (room.room_type === 'kitchen' || room.room_type === 'bathroom') {
            pointsHtml += `
                <div style="text-align:center;">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--gray); display:block; margin-bottom:0.25rem;">🔥 Geyser Pts</label>
                    <div class="stepper-container" style="margin:0 auto;">
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'geyser', -1); event.stopPropagation();">-</button>
                        <input type="number" id="geyser-${room.id}" class="stepper-input" value="${room.geyser_points || 0}" readonly>
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'geyser', 1); event.stopPropagation();">+</button>
                    </div>
                </div>
            `;
        }

        if (room.room_type === 'hall' || room.room_type === 'bedroom') {
            pointsHtml += `
                <div style="text-align:center;">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--gray); display:block; margin-bottom:0.25rem;">❄️ AC Pts</label>
                    <div class="stepper-container" style="margin:0 auto;">
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'ac', -1); event.stopPropagation();">-</button>
                        <input type="number" id="ac-${room.id}" class="stepper-input" value="${room.ac_points || 0}" readonly>
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'ac', 1); event.stopPropagation();">+</button>
                    </div>
                </div>
                <div style="text-align:center;">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--gray); display:block; margin-bottom:0.25rem;">📺 TV Pts</label>
                    <div class="stepper-container" style="margin:0 auto;">
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'tv', -1); event.stopPropagation();">-</button>
                        <input type="number" id="tv-${room.id}" class="stepper-input" value="${room.tv_points || 0}" readonly>
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'tv', 1); event.stopPropagation();">+</button>
                    </div>
                </div>
                <div style="text-align:center;">
                    <label style="font-size:0.75rem; font-weight:700; color:var(--gray); display:block; margin-bottom:0.25rem;">🌐 Internet</label>
                    <div class="stepper-container" style="margin:0 auto;">
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'internet', -1); event.stopPropagation();">-</button>
                        <input type="number" id="internet-${room.id}" class="stepper-input" value="${room.internet_points || 0}" readonly>
                        <button class="stepper-btn" onclick="stepCounter('${room.id}', 'internet', 1); event.stopPropagation();">+</button>
                    </div>
                </div>
            `;
        }

        pointsHtml += `</div>`;

        item.innerHTML = `
            <div class="room-accordion-header" onclick="toggleAccordionItem(this.parentElement)">
                <div class="left">
                    <span style="font-size:1.1rem;">${getRoomIcon(room.room_type)}</span>
                    <span>${room.room_label}</span>
                </div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span class="badge badge-${room.status.replace('_', '-')}">${room.status.replace('_', ' ')}</span>
                    <span class="arrow">▼</span>
                </div>
            </div>
            <div class="room-accordion-content">
                <!-- Status -->
                <div class="form-group">
                    <label>Status</label>
                    <select class="form-control room-status-select" data-id="${room.id}" onchange="updateAccordionBadge(this)">
                        <option value="not_started" ${room.status === 'not_started' ? 'selected' : ''}>Not Started</option>
                        <option value="in_progress" ${room.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="completed" ${room.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>

                <!-- Point Counters -->
                ${pointsHtml}

                <!-- Remarks -->
                <div class="form-group">
                    <label>Remarks / Issues</label>
                    <input type="text" id="remarks-${room.id}" class="form-control" value="${room.remarks || ''}" placeholder="e.g. wiring half done, board broken">
                </div>

                <!-- Photo Upload Grid -->
                <div class="form-group">
                    <label>Photos (${roomPhotos.length})</label>
                    <div class="photo-upload-grid">
                        ${roomPhotos.map(p => `
                            <div class="photo-preview-tile" onclick="window.open('${p.drive_view_url}', '_blank')">
                                <img src="${p.drive_thumbnail_url}" alt="Room Photo">
                            </div>
                        `).join('')}
                        <div class="photo-upload-tile" onclick="triggerPhotoUpload('room', '${room.id}', '${room.room_label}')">
                            📸
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

function toggleAccordionItem(itemEl) {
    const isActive = itemEl.classList.contains('active');
    
    // Collapse all
    document.querySelectorAll('.room-accordion-item').forEach(el => el.classList.remove('active'));
    
    // Open targeted
    if (!isActive) {
        itemEl.classList.add('active');
    }
}

function updateAccordionBadge(selectEl) {
    const itemEl = selectEl.closest('.room-accordion-item');
    const badgeEl = itemEl.querySelector('.room-accordion-header .badge');
    const val = selectEl.value;

    badgeEl.className = `badge badge-${val.replace('_', '-')}`;
    badgeEl.textContent = val.replace('_', ' ');
}

function getRoomIcon(type) {
    switch (type) {
        case 'hall': return '📺';
        case 'kitchen': return '🍳';
        case 'bedroom': return '🛏️';
        case 'bathroom': return '🚿';
        default: return '🚪';
    }
}

// Increment/decrement counts
function stepCounter(roomId, type, delta) {
    const input = document.getElementById(`${type}-${roomId}`);
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta); // Clamp to 0
    input.value = val;
}

// ==================== STAGES ====================

// Render stages list
function renderStages(stages, photos) {
    const container = document.getElementById('stages-container');
    container.innerHTML = '';

    stages.forEach(stage => {
        const stagePhotos = photos.filter(p => p.stage_id === stage.id);
        const stageLabel = formatStageLabel(stage.stage_type);

        const row = document.createElement('div');
        row.className = 'stage-row';
        row.innerHTML = `
            <div style="flex:1; padding-right:1rem;">
                <div class="stage-name">${stageLabel}</div>
                <!-- Mini thumbnail grid if photos exist -->
                ${stagePhotos.length > 0 ? `
                    <div style="display:flex; gap:0.25rem; margin-top:0.4rem; overflow-x:auto;">
                        ${stagePhotos.map(p => `
                            <img src="${p.drive_thumbnail_url}" onclick="window.open('${p.drive_view_url}', '_blank')" 
                                 style="width:30px; height:30px; object-fit:cover; border-radius:4px; border:1px solid #ccc; cursor:pointer;">
                        `).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="stage-controls">
                <!-- Dropdown -->
                <select class="form-control stage-status-select" data-id="${stage.id}" data-type="${stage.stage_type}" onchange="toggleHandoverDate(this)" style="width:125px; padding:0.45rem 0.5rem; font-size:0.85rem;">
                    <option value="not_started" ${stage.status === 'not_started' ? 'selected' : ''}>Not Started</option>
                    <option value="in_progress" ${stage.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="completed" ${stage.status === 'completed' ? 'selected' : ''}>Completed</option>
                </select>

                <!-- Photo Upload Trigger -->
                <button class="btn btn-outline" onclick="triggerPhotoUpload('stage', '${stage.id}', '${stageLabel}')" style="padding:0.45rem 0.65rem;" title="Upload photo">📸</button>
            </div>
        `;

        // Special row configuration for Handover Date
        if (stage.stage_type === 'final_handover') {
            const handoverInputRow = document.createElement('div');
            handoverInputRow.id = 'handover-date-container';
            handoverInputRow.style.display = stage.status === 'completed' ? 'block' : 'none';
            handoverInputRow.style.width = '100%';
            handoverInputRow.style.marginTop = '0.5rem';
            handoverInputRow.innerHTML = `
                <div class="form-group" style="margin-bottom:0;">
                    <label style="font-size:0.8rem; margin-bottom:0.25rem;">Handover Date</label>
                    <input type="date" id="handover-date" class="form-control" value="${stage.handover_date || ''}">
                </div>
            `;
            
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.width = '100%';
            wrapper.appendChild(row);
            wrapper.appendChild(handoverInputRow);
            container.appendChild(wrapper);
        } else {
            container.appendChild(row);
        }
    });
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

function toggleHandoverDate(selectEl) {
    if (selectEl.dataset.type === 'final_handover') {
        const container = document.getElementById('handover-date-container');
        if (container) {
            container.style.display = selectEl.value === 'completed' ? 'block' : 'none';
        }
    }
}

// ==================== IMAGE COMPRESSION & UPLOAD ====================

function triggerPhotoUpload(type, id, label) {
    uploadTarget = { type, id, label };
    document.getElementById('file-uploader-input').click();
}

async function handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Reset input so upload can trigger again for same file if needed
    event.target.value = '';

    // Show loading prompt
    const originalText = `Uploading to Google Drive... Please wait.`;
    const loadingBanner = showBanner(originalText, 'info');

    try {
        // 1. Compress Image client-side using Canvas API (copied from app.js)
        const compressedFile = await compressImage(file, 1024, 0.7);

        // 2. Prepare FormData
        const formData = new FormData();
        formData.append('photo', compressedFile);
        formData.append('siteName', selectedSite.name);
        formData.append('flatNumber', selectedFlat.flat_number);
        formData.append('locationName', uploadTarget.label);

        if (uploadTarget.type === 'room') {
            formData.append('roomId', uploadTarget.id);
        } else {
            formData.append('stageId', uploadTarget.id);
        }

        // 3. Post to API
        const headers = getHeaders(null);

        const res = await fetch(`/api/flat-reports/reports/${currentReportData.report.id}/upload`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Photo upload failed');
        }

        removeBanner(loadingBanner);
        showBanner('Photo uploaded and linked to Drive!', 'success');
        
        // Refresh overlay details to show the new thumbnail
        openReportForm(selectedFlat.id);

    } catch (err) {
        removeBanner(loadingBanner);
        console.error(err);
        showBanner(err.message, 'danger');
    }
}

// Canvas client-side compressor
async function compressImage(file, maxWidth = 1024, quality = 0.7) {
    if (!file || !file.type.startsWith('image/')) return file;
    if (file.size < 200 * 1024) return file; // Skip under 200KB

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

// ==================== SAVE ACTION ====================

async function saveReportForm() {
    if (!selectedFlat || !currentReportData) return;

    // Gather rooms
    const rooms = [];
    document.querySelectorAll('.room-status-select').forEach(select => {
        const id = select.dataset.id;
        rooms.push({
            id,
            status: select.value,
            light_points: parseInt(document.getElementById(`light-${id}`).value) || 0,
            fan_points: parseInt(document.getElementById(`fan-${id}`).value) || 0,
            geyser_points: document.getElementById(`geyser-${id}`) ? (parseInt(document.getElementById(`geyser-${id}`).value) || 0) : 0,
            ac_points: document.getElementById(`ac-${id}`) ? (parseInt(document.getElementById(`ac-${id}`).value) || 0) : 0,
            tv_points: document.getElementById(`tv-${id}`) ? (parseInt(document.getElementById(`tv-${id}`).value) || 0) : 0,
            internet_points: document.getElementById(`internet-${id}`) ? (parseInt(document.getElementById(`internet-${id}`).value) || 0) : 0,
            remarks: document.getElementById(`remarks-${id}`).value || ''
        });
    });

    // Gather stages
    const stages = [];
    let handover_date = null;

    document.querySelectorAll('.stage-status-select').forEach(select => {
        const id = select.dataset.id;
        const type = select.dataset.type;
        const stageObj = {
            id,
            status: select.value
        };

        if (type === 'final_handover') {
            const dateInput = document.getElementById('handover-date');
            stageObj.handover_date = select.value === 'completed' ? (dateInput ? dateInput.value : null) : null;
        }

        stages.push(stageObj);
    });

    try {
        const res = await apiFetch(`/flats/${selectedFlat.id}/report`, {
            method: 'PUT',
            body: JSON.stringify({ rooms, stages })
        });

        showBanner('Flat report updated successfully!', 'success');
        closeReportForm();
    } catch (e) {
        showBanner(e.message, 'danger');
    }
}

// ==================== POPUP BANNERS ====================

function showBanner(message, type = 'success') {
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '1.5rem';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.zIndex = '9999';
    banner.style.padding = '0.75rem 1.5rem';
    banner.style.borderRadius = '50px';
    banner.style.color = 'white';
    banner.style.fontWeight = '600';
    banner.style.fontSize = '0.9rem';
    banner.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.2)';
    
    if (type === 'success') banner.style.backgroundColor = 'var(--secondary)';
    else if (type === 'danger') banner.style.backgroundColor = 'var(--danger)';
    else banner.style.backgroundColor = 'var(--primary)'; // info

    banner.textContent = message;
    document.body.appendChild(banner);

    if (type !== 'info') {
        setTimeout(() => {
            removeBanner(banner);
        }, 3000);
    }
    return banner;
}

function removeBanner(banner) {
    if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    enforceRole('employee');
    initSupervisorPortal();
});
