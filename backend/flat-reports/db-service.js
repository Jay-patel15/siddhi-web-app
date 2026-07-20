const { supabase } = require('../services/supabase-db');

// Helper to handle retry for operations
const executeWithRetry = async (operation) => {
    try {
        return await operation();
    } catch (err) {
        console.error('Supabase query error:', err.message);
        throw err;
    }
};

// ==================== SITE CRUD ====================

const getAllSites = async () => {
    return executeWithRetry(async () => {
        const { data: sites, error } = await supabase
            .from('sites')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);

        // Fetch overall progress for each site
        const populatedSites = await Promise.all(sites.map(async (site) => {
            const { data: flats, error: flatsError } = await supabase
                .from('flats')
                .select('id, status')
                .eq('site_id', site.id);

            if (flatsError) throw new Error(flatsError.message);

            let progress = 0;
            if (flats && flats.length > 0) {
                // To get more precise progress, we load their flat reports
                const flatProgresses = await Promise.all(flats.map(async (flat) => {
                    return await getFlatProgressValue(flat.id);
                }));
                const totalProgress = flatProgresses.reduce((acc, p) => acc + p, 0);
                progress = Math.round(totalProgress / flats.length);
            }

            return {
                ...site,
                progress: progress,
                total_flats: flats ? flats.length : 0
            };
        }));

        return populatedSites;
    });
};

const getSiteById = async (id) => {
    return executeWithRetry(async () => {
        const { data, error } = await supabase
            .from('sites')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);
        return data;
    });
};

const createSite = async (siteData) => {
    return executeWithRetry(async () => {
        const { data, error } = await supabase
            .from('sites')
            .insert([siteData])
            .select()
            .single();

        if (error) throw new Error(error.message);

        // Auto-generate flats
        await autoGenerateFlats(data.id);

        return data;
    });
};

const deleteSite = async (id) => {
    return executeWithRetry(async () => {
        const { error } = await supabase
            .from('sites')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
        return { success: true };
    });
};

// ==================== AUTO-GENERATE FLATS ====================

const autoGenerateFlats = async (siteId) => {
    return executeWithRetry(async () => {
        const site = await getSiteById(siteId);
        if (!site) throw new Error('Site not found');

        const { total_floors, flats_per_floor, bhk_types } = site;
        const bhkList = Array.isArray(bhk_types) ? bhk_types : JSON.parse(bhk_types || '[]');

        if (bhkList.length === 0) {
            bhkList.push('2BHK'); // Fallback default
        }

        const flatsToInsert = [];
        
        for (let floor = 1; floor <= total_floors; floor++) {
            for (let idx = 1; idx <= flats_per_floor; idx++) {
                const flatNum = floor * 100 + idx; // e.g., 301, 302...
                const bhkType = bhkList[(idx - 1) % bhkList.length];

                flatsToInsert.push({
                    site_id: siteId,
                    flat_number: String(flatNum),
                    floor_number: floor,
                    bhk_type: bhkType,
                    status: 'not_started',
                    description: `${bhkType} on Floor ${floor}`
                });
            }
        }

        const { data: createdFlats, error } = await supabase
            .from('flats')
            .insert(flatsToInsert)
            .select();

        if (error) throw new Error(error.message);

        // For each flat, create a default report, report_rooms, and report_stages
        for (const flat of createdFlats) {
            // 1. Create Report
            const { data: report, error: repErr } = await supabase
                .from('reports')
                .insert([{ flat_id: flat.id, updated_by: 'System' }])
                .select()
                .single();

            if (repErr) throw new Error(repErr.message);

            // 2. Define default rooms based on BHK
            const bhkNumber = parseInt(flat.bhk_type) || 2; // Extract number from "2BHK"
            const rooms = [
                { room_type: 'hall', room_label: 'Hall' },
                { room_type: 'kitchen', room_label: 'Kitchen' }
            ];

            // Add Bedrooms
            for (let i = 1; i <= bhkNumber; i++) {
                rooms.push({ room_type: 'bedroom', room_label: `Bedroom ${i}` });
            }

            // Add Bathrooms (typically same as BHK number)
            for (let i = 1; i <= bhkNumber; i++) {
                rooms.push({ room_type: 'bathroom', room_label: `Bathroom ${i}` });
            }

            const roomsToInsert = rooms.map(r => ({
                report_id: report.id,
                room_type: r.room_type,
                room_label: r.room_label,
                status: 'not_started',
                light_points: 0,
                fan_points: 0,
                geyser_points: 0,
                remarks: ''
            }));

            const { error: roomsErr } = await supabase
                .from('report_rooms')
                .insert(roomsToInsert);

            if (roomsErr) throw new Error(roomsErr.message);

            // 3. Define default stages
            const stages = [
                { stage_type: 'slab_piping' },
                { stage_type: 'box_piping' },
                { stage_type: 'rope_pulling' },
                { stage_type: 'wiring' },
                { stage_type: 'final_handover' }
            ];

            const stagesToInsert = stages.map(s => ({
                report_id: report.id,
                stage_type: s.stage_type,
                status: 'not_started'
            }));

            const { error: stagesErr } = await supabase
                .from('report_stages')
                .insert(stagesToInsert);

            if (stagesErr) throw new Error(stagesErr.message);
        }

        return createdFlats;
    });
};

// ==================== FLAT & REPORT RETRIEVAL ====================

const getFlatsBySite = async (siteId) => {
    return executeWithRetry(async () => {
        const { data: flats, error } = await supabase
            .from('flats')
            .select('*')
            .eq('site_id', siteId)
            .order('floor_number', { ascending: true })
            .order('flat_number', { ascending: true });

        if (error) throw new Error(error.message);

        // Fetch progress value for each flat dynamically
        const populatedFlats = await Promise.all(flats.map(async (flat) => {
            const progress = await getFlatProgressValue(flat.id);
            return {
                ...flat,
                progress: progress
            };
        }));

        return populatedFlats;
    });
};

const getReportForFlat = async (flatId) => {
    return executeWithRetry(async () => {
        // Fetch report
        const { data: report, error: repErr } = await supabase
            .from('reports')
            .select('*')
            .eq('flat_id', flatId)
            .single();

        if (repErr) throw new Error(repErr.message);

        // Fetch rooms
        const { data: rooms, error: rmsErr } = await supabase
            .from('report_rooms')
            .select('*')
            .eq('report_id', report.id)
            .order('room_label', { ascending: true });

        if (rmsErr) throw new Error(rmsErr.message);

        // Fetch stages
        const { data: stages, error: stgErr } = await supabase
            .from('report_stages')
            .select('*')
            .eq('report_id', report.id);

        if (stgErr) throw new Error(stgErr.message);

        // Fetch photos
        const { data: photos, error: phtErr } = await supabase
            .from('photos')
            .select('*')
            .eq('report_id', report.id);

        if (phtErr) throw new Error(phtErr.message);

        // Fetch history
        const { data: history, error: histErr } = await supabase
            .from('report_history')
            .select('*')
            .eq('report_id', report.id)
            .order('changed_at', { ascending: false });

        if (histErr) throw new Error(histErr.message);

        return {
            report,
            rooms,
            stages,
            photos,
            history
        };
    });
};

// Helper to get raw progress value of a flat
const getFlatProgressValue = async (flatId) => {
    const { data: report } = await supabase
        .from('reports')
        .select('id')
        .eq('flat_id', flatId)
        .single();

    if (!report) return 0;

    const { data: rooms } = await supabase
        .from('report_rooms')
        .select('status')
        .eq('report_id', report.id);

    const { data: stages } = await supabase
        .from('report_stages')
        .select('status')
        .eq('report_id', report.id);

    const roomProgress = calculateCompletionPercentage(rooms || []);
    const stageProgress = calculateCompletionPercentage(stages || []);

    return Math.round((roomProgress * 0.40) + (stageProgress * 0.60));
};

const calculateCompletionPercentage = (items) => {
    if (items.length === 0) return 0;

    let score = 0;
    items.forEach(item => {
        if (item.status === 'completed') score += 1.0;
        else if (item.status === 'in_progress') score += 0.5;
    });

    return (score / items.length) * 100;
};

// ==================== UPDATE REPORT & WRITE HISTORY ====================

const updateReport = async (flatId, { rooms, stages, userName }) => {
    return executeWithRetry(async () => {
        // 1. Fetch current report state
        const currentData = await getReportForFlat(flatId);
        const reportId = currentData.report.id;
        const auditLogs = [];

        // 2. Diff & Update Rooms
        if (rooms && Array.isArray(rooms)) {
            for (const newRoom of rooms) {
                const currentRoom = currentData.rooms.find(r => r.id === newRoom.id);
                if (!currentRoom) continue;

                const roomChanges = [];

                if (currentRoom.status !== newRoom.status) {
                    roomChanges.push({
                        field: `${currentRoom.room_label} Status`,
                        oldVal: currentRoom.status,
                        newVal: newRoom.status
                    });
                }
                if (currentRoom.light_points !== newRoom.light_points) {
                    roomChanges.push({
                        field: `${currentRoom.room_label} Light Points`,
                        oldVal: String(currentRoom.light_points),
                        newVal: String(newRoom.light_points)
                    });
                }
                if (currentRoom.fan_points !== newRoom.fan_points) {
                    roomChanges.push({
                        field: `${currentRoom.room_label} Fan Points`,
                        oldVal: String(currentRoom.fan_points),
                        newVal: String(newRoom.fan_points)
                    });
                }
                if (currentRoom.geyser_points !== newRoom.geyser_points) {
                    roomChanges.push({
                        field: `${currentRoom.room_label} Geyser Points`,
                        oldVal: String(currentRoom.geyser_points),
                        newVal: String(newRoom.geyser_points)
                    });
                }
                if (currentRoom.ac_points !== newRoom.ac_points) {
                    roomChanges.push({
                        field: `${currentRoom.room_label} AC Points`,
                        oldVal: String(currentRoom.ac_points || 0),
                        newVal: String(newRoom.ac_points || 0)
                    });
                }
                if (currentRoom.tv_points !== newRoom.tv_points) {
                    roomChanges.push({
                        field: `${currentRoom.room_label} TV Points`,
                        oldVal: String(currentRoom.tv_points || 0),
                        newVal: String(newRoom.tv_points || 0)
                    });
                }
                if (currentRoom.internet_points !== newRoom.internet_points) {
                    roomChanges.push({
                        field: `${currentRoom.room_label} Internet Points`,
                        oldVal: String(currentRoom.internet_points || 0),
                        newVal: String(newRoom.internet_points || 0)
                    });
                }
                if (currentRoom.remarks !== newRoom.remarks) {
                    roomChanges.push({
                        field: `${currentRoom.room_label} Remarks`,
                        oldVal: currentRoom.remarks,
                        newVal: newRoom.remarks
                    });
                }

                if (roomChanges.length > 0) {
                    // Update database
                    const { error: roomUpdErr } = await supabase
                        .from('report_rooms')
                        .update({
                            status: newRoom.status,
                            light_points: newRoom.light_points,
                            fan_points: newRoom.fan_points,
                            geyser_points: newRoom.geyser_points,
                            ac_points: newRoom.ac_points,
                            tv_points: newRoom.tv_points,
                            internet_points: newRoom.internet_points,
                            remarks: newRoom.remarks
                        })
                        .eq('id', newRoom.id);

                    if (roomUpdErr) throw new Error(roomUpdErr.message);

                    // Add to logs
                    roomChanges.forEach(c => {
                        auditLogs.push({
                            report_id: reportId,
                            field_changed: c.field,
                            old_value: c.oldVal,
                            new_value: c.newVal,
                            changed_by: userName || 'System'
                        });
                    });
                }
            }
        }

        // 3. Diff & Update Stages
        if (stages && Array.isArray(stages)) {
            for (const newStage of stages) {
                const currentStage = currentData.stages.find(s => s.id === newStage.id);
                if (!currentStage) continue;

                const stageChanges = [];
                if (currentStage.status !== newStage.status) {
                    stageChanges.push({
                        field: `${formatStageName(currentStage.stage_type)} Status`,
                        oldVal: currentStage.status,
                        newVal: newStage.status
                    });
                }
                if (currentStage.handover_date !== newStage.handover_date) {
                    stageChanges.push({
                        field: `${formatStageName(currentStage.stage_type)} Handover Date`,
                        oldVal: currentStage.handover_date,
                        newVal: newStage.handover_date
                    });
                }

                if (stageChanges.length > 0) {
                    // Update database
                    const { error: stgUpdErr } = await supabase
                        .from('report_stages')
                        .update({
                            status: newStage.status,
                            handover_date: newStage.handover_date || null
                        })
                        .eq('id', newStage.id);

                    if (stgUpdErr) throw new Error(stgUpdErr.message);

                    // Add to logs
                    stageChanges.forEach(c => {
                        auditLogs.push({
                            report_id: reportId,
                            field_changed: c.field,
                            old_value: c.oldVal,
                            new_value: c.newVal,
                            changed_by: userName || 'System'
                        });
                    });
                }
            }
        }

        // 4. Save history logs
        if (auditLogs.length > 0) {
            const { error: histErr } = await supabase
                .from('report_history')
                .insert(auditLogs);

            if (histErr) throw new Error(histErr.message);
        }

        // 5. Update overall report metadata (updated_at, updated_by)
        await supabase
            .from('reports')
            .update({
                updated_by: userName || 'System',
                updated_at: new Date().toISOString()
            })
            .eq('id', reportId);

        // 6. Recalculate flat progress percentage and status
        const newProgress = await getFlatProgressValue(flatId);
        let newStatus = 'in_progress';
        if (newProgress === 0) newStatus = 'not_started';
        else if (newProgress === 100) newStatus = 'completed';

        const { error: flatUpdErr } = await supabase
            .from('flats')
            .update({
                status: newStatus
            })
            .eq('id', flatId);

        if (flatUpdErr) throw new Error(flatUpdErr.message);

        return { success: true, progress: newProgress, status: newStatus };
    });
};

const formatStageName = (type) => {
    return type
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
};

// ==================== PHOTO MANAGEMENT ====================

const addPhotoLink = async ({ reportId, roomId, stageId, drive_file_id, drive_view_url, drive_thumbnail_url, caption, userName }) => {
    return executeWithRetry(async () => {
        const { data, error } = await supabase
            .from('photos')
            .insert([{
                report_id: reportId,
                room_id: roomId || null,
                stage_id: stageId || null,
                drive_file_id,
                drive_view_url,
                drive_thumbnail_url,
                caption: caption || '',
                uploaded_by: userName || 'System'
            }])
            .select()
            .single();

        if (error) throw new Error(error.message);

        // Add history log for photo upload
        let locationLabel = 'Flat';
        if (roomId) {
            const { data: rm } = await supabase.from('report_rooms').select('room_label').eq('id', roomId).single();
            if (rm) locationLabel = rm.room_label;
        } else if (stageId) {
            const { data: stg } = await supabase.from('report_stages').select('stage_type').eq('id', stageId).single();
            if (stg) locationLabel = formatStageName(stg.stage_type);
        }

        await supabase.from('report_history').insert([{
            report_id: reportId,
            field_changed: `${locationLabel} Photo Upload`,
            old_value: null,
            new_value: 'New Photo Added',
            changed_by: userName || 'System'
        }]);

        return data;
    });
};

// ==================== ASSIGNMENTS & SUPERVISORS ====================

const getSiteAssignments = async (siteId) => {
    return executeWithRetry(async () => {
        const { data, error } = await supabase
            .from('site_assignments')
            .select('id, employee_id, assigned_at')
            .eq('site_id', siteId);

        if (error) throw new Error(error.message);
        return data;
    });
};

const assignEmployeeToSite = async (siteId, employeeId) => {
    return executeWithRetry(async () => {
        const { data, error } = await supabase
            .from('site_assignments')
            .insert([{ site_id: siteId, employee_id: employeeId }])
            .select()
            .single();

        if (error) throw new Error(error.message);
        return data;
    });
};

const removeEmployeeAssignment = async (siteId, employeeId) => {
    return executeWithRetry(async () => {
        const { error } = await supabase
            .from('site_assignments')
            .delete()
            .eq('site_id', siteId)
            .eq('employee_id', employeeId);

        if (error) throw new Error(error.message);
        return { success: true };
    });
};

const getAssignedSitesForEmployee = async (employeeId) => {
    return executeWithRetry(async () => {
        const { data: assignments, error } = await supabase
            .from('site_assignments')
            .select('site_id')
            .eq('employee_id', employeeId);

        if (error) throw new Error(error.message);
        if (assignments.length === 0) return [];

        const siteIds = assignments.map(a => a.site_id);
        const { data: sites, error: sitesErr } = await supabase
            .from('sites')
            .select('*')
            .in('id', siteIds);

        if (sitesErr) throw new Error(sitesErr.message);

        // Populate progress
        const populatedSites = await Promise.all(sites.map(async (site) => {
            const { data: flats } = await supabase
                .from('flats')
                .select('id')
                .eq('site_id', site.id);

            let progress = 0;
            if (flats && flats.length > 0) {
                const flatProgresses = await Promise.all(flats.map(async (flat) => {
                    return await getFlatProgressValue(flat.id);
                }));
                progress = Math.round(flatProgresses.reduce((acc, p) => acc + p, 0) / flats.length);
            }

            return {
                ...site,
                progress: progress,
                total_flats: flats ? flats.length : 0
            };
        }));

        return populatedSites;
    });
};

// ==================== DASHBOARD & AUDITS ====================

const getSiteDashboardMetrics = async (siteId) => {
    return executeWithRetry(async () => {
        const flats = await getFlatsBySite(siteId);
        if (flats.length === 0) {
            return {
                completionProgress: 0,
                stageCompletion: {},
                roomTypeCompletion: {},
                flatMetrics: [],
                recentActivity: []
            };
        }

        // 1. Overall Completion Progress
        const totalProgress = flats.reduce((acc, f) => acc + f.progress, 0);
        const overallProgress = Math.round(totalProgress / flats.length);

        // 2. Progress by Stage
        const { data: allReports } = await supabase
            .from('reports')
            .select('id')
            .in('flat_id', flats.map(f => f.id));

        const reportIds = allReports.map(r => r.id);

        let stageMetrics = {};
        if (reportIds.length > 0) {
            const { data: stages } = await supabase
                .from('report_stages')
                .select('stage_type, status')
                .in('report_id', reportIds);

            const stageCounts = {};
            const stageScores = {};

            stages.forEach(s => {
                if (!stageCounts[s.stage_type]) {
                    stageCounts[s.stage_type] = 0;
                    stageScores[s.stage_type] = 0;
                }
                stageCounts[s.stage_type]++;
                if (s.status === 'completed') stageScores[s.stage_type] += 1;
                else if (s.status === 'in_progress') stageScores[s.stage_type] += 0.5;
            });

            Object.keys(stageCounts).forEach(type => {
                stageMetrics[type] = Math.round((stageScores[type] / stageCounts[type]) * 100);
            });
        }

        // 3. Progress by Room Type
        let roomMetrics = {};
        if (reportIds.length > 0) {
            const { data: rooms } = await supabase
                .from('report_rooms')
                .select('room_type, status')
                .in('report_id', reportIds);

            const roomCounts = {};
            const roomScores = {};

            rooms.forEach(r => {
                if (!roomCounts[r.room_type]) {
                    roomCounts[r.room_type] = 0;
                    roomScores[r.room_type] = 0;
                }
                roomCounts[r.room_type]++;
                if (r.status === 'completed') roomScores[r.room_type] += 1;
                else if (r.status === 'in_progress') roomScores[r.room_type] += 0.5;
            });

            Object.keys(roomCounts).forEach(type => {
                roomMetrics[type] = Math.round((roomScores[type] / roomCounts[type]) * 100);
            });
        }

        // 4. Recent Activity (History)
        let recentActivity = [];
        if (reportIds.length > 0) {
            const { data: history } = await supabase
                .from('report_history')
                .select('id, report_id, field_changed, old_value, new_value, changed_by, changed_at')
                .in('report_id', reportIds)
                .order('changed_at', { ascending: false })
                .limit(20);

            // Populate with Flat Number
            const reportToFlatMap = {};
            const { data: reps } = await supabase
                .from('reports')
                .select('id, flat_id')
                .in('id', reportIds);
            
            reps.forEach(r => {
                const fl = flats.find(f => f.id === r.flat_id);
                if (fl) reportToFlatMap[r.id] = fl.flat_number;
            });

            recentActivity = (history || []).map(h => ({
                ...h,
                flat_number: reportToFlatMap[h.report_id] || 'Unknown'
            }));
        }

        return {
            completionProgress: overallProgress,
            stageCompletion: stageMetrics,
            roomTypeCompletion: roomMetrics,
            flatMetrics: flats,
            recentActivity
        };
    });
};

const updateFlat = async (flatId, { flat_number, bhk_type, description }) => {
    return executeWithRetry(async () => {
        // 1. Fetch current flat to check if BHK changes
        const { data: currentFlat, error: fetchErr } = await supabase
            .from('flats')
            .select('*')
            .eq('id', flatId)
            .single();

        if (fetchErr) throw new Error(fetchErr.message);

        // 2. Perform flat metadata update
        const { data: updatedFlat, error: updErr } = await supabase
            .from('flats')
            .update({
                flat_number: flat_number || currentFlat.flat_number,
                bhk_type: bhk_type || currentFlat.bhk_type,
                description: description || currentFlat.description
            })
            .eq('id', flatId)
            .select()
            .single();

        if (updErr) throw new Error(updErr.message);

        // 3. Reconcile rooms if BHK type changed
        if (bhk_type && bhk_type !== currentFlat.bhk_type) {
            // Find flat report
            const { data: report, error: repErr } = await supabase
                .from('reports')
                .select('id')
                .eq('flat_id', flatId)
                .single();

            if (repErr) throw new Error(repErr.message);

            // Compute target room labels for the new BHK type
            const bhkNumber = parseInt(bhk_type) || 2;
            const newRooms = [
                { room_type: 'hall', room_label: 'Hall' },
                { room_type: 'kitchen', room_label: 'Kitchen' }
            ];

            // Add Bedrooms
            for (let i = 1; i <= bhkNumber; i++) {
                newRooms.push({ room_type: 'bedroom', room_label: `Bedroom ${i}` });
            }

            // Add Bathrooms
            for (let i = 1; i <= bhkNumber; i++) {
                newRooms.push({ room_type: 'bathroom', room_label: `Bathroom ${i}` });
            }

            const newLabels = newRooms.map(r => r.room_label);

            // Fetch existing rooms in database
            const { data: existingRooms, error: roomsErr } = await supabase
                .from('report_rooms')
                .select('id, room_label')
                .eq('report_id', report.id);

            if (roomsErr) throw new Error(roomsErr.message);

            // A. Identify rooms to delete (excess)
            const roomsToDelete = existingRooms.filter(er => !newLabels.includes(er.room_label));
            if (roomsToDelete.length > 0) {
                const idsToDelete = roomsToDelete.map(r => r.id);
                const { error: delErr } = await supabase
                    .from('report_rooms')
                    .delete()
                    .in('id', idsToDelete);
                
                if (delErr) throw new Error(delErr.message);
            }

            // B. Identify rooms to insert (missing)
            const roomsToInsert = newRooms.filter(nr => !existingRooms.some(er => er.room_label === nr.room_label));
            if (roomsToInsert.length > 0) {
                const insertPayload = roomsToInsert.map(r => ({
                    report_id: report.id,
                    room_type: r.room_type,
                    room_label: r.room_label,
                    status: 'not_started',
                    light_points: 0,
                    fan_points: 0,
                    geyser_points: 0,
                    ac_points: 0,
                    tv_points: 0,
                    internet_points: 0,
                    remarks: ''
                }));

                const { error: insErr } = await supabase
                    .from('report_rooms')
                    .insert(insertPayload);

                if (insErr) throw new Error(insErr.message);
            }

            // C. Log audit change for BHK modification
            await supabase.from('report_history').insert([{
                report_id: report.id,
                field_changed: 'Flat BHK Configuration',
                old_value: currentFlat.bhk_type,
                new_value: bhk_type,
                changed_by: 'Admin'
            }]);

            // D. Recalculate flat progress
            const newProgress = await getFlatProgressValue(flatId);
            let newStatus = 'in_progress';
            if (newProgress === 0) newStatus = 'not_started';
            else if (newProgress === 100) newStatus = 'completed';

            await supabase
                .from('flats')
                .update({ status: newStatus })
                .eq('id', flatId);
        }

        return { success: true };
    });
};

module.exports = {
    getAllSites,
    getSiteById,
    createSite,
    deleteSite,
    autoGenerateFlats,
    getFlatsBySite,
    getReportForFlat,
    updateReport,
    addPhotoLink,
    getSiteAssignments,
    assignEmployeeToSite,
    removeEmployeeAssignment,
    getAssignedSitesForEmployee,
    getSiteDashboardMetrics,
    updateFlat
};
