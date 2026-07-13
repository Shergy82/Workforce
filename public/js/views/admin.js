import { getCurrentUser } from '../auth.js';
import { getShifts, createShift, updateShift, getSites, getUsers, createNotification, getPlanners } from '../db.js';
import { formatDate, getLoadingSpinner, getLocalDateString } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';
import { uploadFile } from '../storage.js';
import { openScheduleModal } from './planner.js';

let plannerViewMode = window.innerWidth < 768 ? 'day' : 'week'; // auto day-view on mobile
let weekStart = new Date();
let adminRequiredPhotos = [];
let whiteboardIsFullscreen = false;
// Normalize weekStart to Monday of the current week
const dayOfWeek = weekStart.getDay();
const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
weekStart.setDate(diff);
weekStart.setHours(0, 0, 0, 0);

// Use sessionStorage to persist tab selection across refreshes
function getActiveTab() {
  return sessionStorage.getItem('wb_active_tab') || 'planner';
}

function setActiveTab(tab) {
  sessionStorage.setItem('wb_active_tab', tab);
}

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderWhiteboard(container, user);
}

async function renderWhiteboard(container, user) {
  try {
    const [shifts, sites, users] = await Promise.all([
      getShifts(),
      getSites(),
      getUsers()
    ]);

    const operatives = users.filter(u => u.role === 'operative' && u.status === 'active');
    const activeJobs = [...shifts].sort((a, b) => b.date.localeCompare(a.date));
    const todayStr = getLocalDateString();

    // Generate dates for Mon - Sun of the selected week
    const weekDates = [];
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dateStr = getLocalDateString(d);
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      weekDates.push({ dateStr, dayName: dayNames[i], label });
    }

    const rangeLabel = plannerViewMode === 'week' 
      ? `${weekDates[0].label} - ${weekDates[6].label} ${weekStart.getFullYear()}`
      : `${formatDate(todayStr)}`;

    // Plain English Status Mapper
    function getPlainStatus(status) {
      if (status === 'pending') return 'Awaiting Confirmation';
      if (status === 'confirmed') return 'Confirmed / Accepted';
      if (status === 'on site') return 'Checked In (On Site)';
      if (status === 'completed') return 'Completed Successfully';
      if (status === 'incomplete') return 'Incomplete (Barrier)';
      if (status === 'cancelled') return 'Cancelled';
      return status;
    }

    const activeTab = getActiveTab();

    // ----------------------------------------------------
    // TAB NAVIGATION HEADER
    // ----------------------------------------------------
    const tabHeaderHTML = `
      <div class="admin-tabs-container">
        <button class="btn ${activeTab === 'planner' ? 'btn-primary' : 'btn-secondary'}" id="wb-tab-btn-planner" style="font-weight: 700; padding: 10px 20px; border-radius: var(--radius-sm); font-size: 0.9rem;">
          <i class="fa-solid fa-calendar-days" style="margin-right: 6px;"></i> Plan Labour (Draggable Board)
        </button>
        <button class="btn ${activeTab === 'create' ? 'btn-primary' : 'btn-secondary'}" id="wb-tab-btn-create" style="font-weight: 700; padding: 10px 20px; border-radius: var(--radius-sm); font-size: 0.9rem;">
          <i class="fa-solid fa-circle-plus" style="margin-right: 6px;"></i> Create a Job
        </button>
        <button class="btn ${activeTab === 'board' ? 'btn-primary' : 'btn-secondary'}" id="wb-tab-btn-board" style="font-weight: 700; padding: 10px 20px; border-radius: var(--radius-sm); font-size: 0.9rem;">
          <i class="fa-solid fa-clipboard-list" style="margin-right: 6px;"></i> Active Job Board
        </button>
      </div>
    `;

    let mainContentHTML = '';

    // ----------------------------------------------------
    // TAB CONTENT: PLAN LABOUR (Full Width)
    // ----------------------------------------------------
    if (activeTab === 'planner') {
      const targetDates = plannerViewMode === 'week' ? weekDates : [{ dateStr: todayStr, dayName: 'Today', label: formatDate(todayStr) }];

      mainContentHTML = `
        <style>
          .whiteboard-fullscreen-mode {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 150 !important;
            background-color: hsl(var(--bg-main)) !important;
            padding: 24px !important;
            overflow: auto !important;
            margin: 0 !important;
            border-radius: 0 !important;
            box-sizing: border-box !important;
          }
          body:has(.whiteboard-fullscreen-mode) aside.sidebar {
            display: none !important;
          }
          body:has(.whiteboard-fullscreen-mode) header.top-header {
            display: none !important;
          }
          body:has(.whiteboard-fullscreen-mode) main.main-content {
            margin-left: 0 !important;
            padding-bottom: 0 !important;
          }
          body:has(.whiteboard-fullscreen-mode) .admin-tabs-container {
            display: none !important;
          }
        </style>
        
        <div class="card ${whiteboardIsFullscreen ? 'whiteboard-fullscreen-mode' : ''}" style="padding: 24px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid hsl(var(--primary)/0.06); padding-bottom: 12px; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              ${whiteboardIsFullscreen ? `
                <button class="btn btn-secondary" id="wb-toggle-fullscreen" style="font-weight: 700; padding: 8px 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
                  <i class="fa-solid fa-arrow-left"></i> Exit Full Screen
                </button>
              ` : `
                <button class="btn btn-secondary" id="wb-toggle-fullscreen" style="font-weight: 700; padding: 8px 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
                  <i class="fa-solid fa-expand"></i> Full Screen
                </button>
              `}
              <div>
                <h3 style="font-weight: 800; font-size: 1.35rem; color: hsl(var(--primary)); margin: 0;">Plan Labour</h3>
                <p style="font-size: 0.8rem; color: hsl(var(--text-muted)); margin-top: 2px;">Allocate engineers to jobs by drag-and-drop. Drag an engineer card and drop it onto any unassigned slot.</p>
              </div>
            </div>
            
            <!-- View Toggle -->
            <div style="display: flex; gap: 4px; background-color: hsl(var(--bg-primary)); padding: 4px; border-radius: var(--radius-sm); border: 1px solid hsl(var(--border));">
              <button class="btn" id="wb-toggle-week" style="padding: 6px 14px; font-size: 0.8rem; font-weight: 700; border-radius: 4px; border: none; background-color: ${plannerViewMode === 'week' ? 'hsl(var(--primary))' : 'transparent'}; color: ${plannerViewMode === 'week' ? 'white' : 'hsl(var(--text-muted))'};">
                Weekly View
              </button>
              <button class="btn" id="wb-toggle-day" style="padding: 6px 14px; font-size: 0.8rem; font-weight: 700; border-radius: 4px; border: none; background-color: ${plannerViewMode === 'day' ? 'hsl(var(--primary))' : 'transparent'}; color: ${plannerViewMode === 'day' ? 'white' : 'hsl(var(--text-muted))'};">
                Daily View
              </button>
            </div>
          </div>

          <!-- Date Navigation -->
          <div style="display: flex; justify-content: space-between; align-items: center; background-color: hsl(var(--bg-primary)); padding: 12px 16px; border-radius: var(--radius-sm); font-size: 0.95rem; border: 1px solid hsl(var(--border));">
            <button class="btn btn-secondary" id="wb-planner-prev" style="padding: 6px 14px; font-weight: 600;"><i class="fa-solid fa-chevron-left"></i> Previous</button>
            <strong style="font-weight: 800; color: hsl(var(--text-main)); font-size: 1.05rem;">${rangeLabel}</strong>
            <button class="btn btn-secondary" id="wb-planner-next" style="padding: 6px 14px; font-weight: 600;">Next <i class="fa-solid fa-chevron-right"></i></button>
          </div>

          <div class="whiteboard-planner-container" style="display: flex; gap: 24px; align-items: start; flex-wrap: nowrap; overflow-x: auto;">
            
            <!-- Draggable Engineers Sidebar Tray -->
            <div class="whiteboard-sidebar" style="width: 200px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; border-right: 1px solid hsl(var(--border)/0.8); padding-right: 16px;">
              <strong style="font-size: 0.78rem; text-transform: uppercase; color: hsl(var(--text-muted)); letter-spacing: 0.05em; display: block;">Engineers List</strong>
              <input type="text" id="eng-sidebar-search" placeholder="🔍 Search list..." 
                     style="padding: 6px 10px; font-size: 0.72rem; border-radius: 4px; border: 1px solid hsl(var(--border)); width: 100%; outline: none; background-color: hsl(var(--bg-card)); color: hsl(var(--text-main)); margin-top: 4px; margin-bottom: 2px;">
              <div class="whiteboard-sidebar-cards" style="display: flex; flex-direction: column; gap: 6px; max-height: ${whiteboardIsFullscreen ? '72vh' : '440px'}; overflow-y: auto; padding-right: 4px;">
                ${operatives.map(o => `
                  <div class="engineer-draggable-card" draggable="true" data-eng-id="${o.id}" 
                       style="padding: 8px 10px; font-size: 0.8rem; border-radius: 6px; border: 1px solid hsl(var(--border)); background-color: hsl(var(--bg-card)); box-shadow: var(--shadow-sm); cursor: grab; display: flex; align-items: center; gap: 8px; transition: var(--transition);">
                    <i class="fa-solid fa-grip-vertical" style="color: hsl(var(--text-muted)); cursor: grab; font-size: 0.75rem;"></i>
                    <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${o.color || '#3b82f6'}; border: 1px solid rgba(0,0,0,0.1); flex-shrink: 0; display: inline-block;" title="Colour Code"></span>
                    <div style="min-width: 0; flex: 1;">
                      <div style="font-weight: 700; color: hsl(var(--text-main)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${o.name}</div>
                      <div style="font-size: 0.68rem; color: hsl(var(--text-muted)); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${o.trade || 'Builder'}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>


            <!-- Date Grid Box Columns (Full spacious width) -->
            <div style="flex: 1; min-width: 0; width: 100%;">
              <div style="display: grid; grid-template-columns: repeat(${targetDates.length}, minmax(140px, 1fr)); gap: 12px; overflow-x: auto;">
                ${targetDates.map(wd => {
                  const dayShifts = shifts.filter(s => s.date === wd.dateStr);

                  return `
                    <div class="whiteboard-date-box" data-date="${wd.dateStr}" style="min-height: 420px; max-height: ${whiteboardIsFullscreen ? '78vh' : '520px'}; padding: 12px; background-color: hsl(var(--bg-primary)/0.3); border: 2px dashed hsl(var(--border)); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 8px;">
                      <div class="whiteboard-date-box-header" style="margin-bottom: 6px; border-bottom: 2px solid hsl(var(--border)); padding-bottom: 6px;">
                        <span style="font-size: 0.9rem; font-weight: 800; color: hsl(var(--text-main));">${wd.dayName}</span>
                        <span style="font-size: 0.72rem; font-weight: 600; color: hsl(var(--text-muted)); display: block; margin-top: 2px;">${wd.label}</span>
                      </div>

                      <div class="whiteboard-shift-list-scrollable" style="display: flex; flex-direction: column; gap: 8px; flex: 1; overflow-y: auto; max-height: ${whiteboardIsFullscreen ? '68vh' : '380px'}; padding-right: 4px;">
                        ${dayShifts.map(s => {
                          let statusColorClass = 'status-pending';
                          if (s.status === 'confirmed') statusColorClass = 'status-confirmed';
                          else if (s.status === 'on site') statusColorClass = 'status-on-site';
                          else if (s.status === 'completed') statusColorClass = 'status-completed';
                          else if (s.status === 'incomplete') statusColorClass = 'status-incomplete';
                          else if (s.status === 'cancelled') statusColorClass = 'status-cancelled';

                          const isAssigned = s.userId ? true : false;
                          const worker = users.find(u => u.id === s.userId);
                          const workerStyle = getUserShiftStyle(worker?.color, s.status);

                          return `
                            <div class="whiteboard-job-card ${statusColorClass}" 
                                 data-shift-id="${s.id}" 
                                 data-date="${wd.dateStr}"
                                 draggable="true"
                                 style="padding: 8px 10px; border-radius: 6px; border: 1px solid ${workerStyle.border}; border-left: 4px solid ${workerStyle.border}; background-color: ${workerStyle.bg}; color: ${workerStyle.text}; position: relative; display: flex; flex-direction: column; gap: 4px; font-weight: 500; font-size: 0.74rem; box-shadow: var(--shadow-sm); cursor: grab; transition: transform 0.15s ease;">
                               
                              <div style="font-weight: 800; font-size: 0.78rem; color: inherit; white-space: normal; word-break: break-word; line-height: 1.2;">
                                ${s.eNumber ? `[${s.eNumber}] ` : ''}${s.siteAddress}
                              </div>
                              <div style="font-size: 0.68rem; color: inherit; opacity: 0.85; line-height: 1.25; word-break: break-word;">
                                <strong>Task:</strong> ${s.task}
                              </div>
                              
                              <!-- Assignment Status -->
                              <div style="margin-top: 4px; border-top: 1px dashed ${workerStyle.border}80; padding-top: 4px; display: flex; align-items: center; justify-content: space-between; font-size: 0.68rem; gap: 4px;">
                                ${isAssigned ? `
                                  <span style="font-weight: 700; color: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px;"><i class="fa-solid fa-helmet-safety"></i> ${s.userName}</span>
                                  <span class="status-badge" style="font-size: 0.58rem; padding: 1px 4px; white-space: nowrap; background-color: ${workerStyle.border}; color: ${workerStyle.text}; border-radius: 3px; font-weight: 700;">${getPlainStatus(s.status).split(' ')[0]}</span>
                                ` : `
                                  <span style="font-weight: 700; font-size: 0.65rem; color: hsl(var(--primary)); text-align: center; width: 100%;"><i class="fa-solid fa-arrow-down-long"></i> Drag Engineer</span>
                                `}
                              </div>
                            </div>
                          `;
                        }).join('')}
                        
                        ${dayShifts.length === 0 ? `
                          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: hsl(var(--text-muted)); font-size: 0.8rem; font-style: italic; opacity: 0.7; text-align: center; padding: 12px; border: 2px dashed hsl(var(--border)/0.5); border-radius: 6px; background-color: hsl(var(--bg-card)); min-height: 100px;">
                            <i class="fa-regular fa-clipboard" style="font-size: 1.2rem; margin-bottom: 4px; opacity: 0.4;"></i>
                            <span>No jobs planned</span>
                          </div>
                        ` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

          </div>
        </div>
      `;
    }

    // ----------------------------------------------------
    // TAB CONTENT: CREATE JOB FORM (Centered, Elegant)
    // ----------------------------------------------------
    if (activeTab === 'create') {
      mainContentHTML = `
        <div class="card" style="max-width: 650px; margin: 0 auto 30px auto; padding: 30px; box-shadow: var(--shadow-md);">
          <h3 style="font-weight: 800; font-size: 1.4rem; color: hsl(var(--primary)); border-bottom: 2px solid hsl(var(--primary)/0.06); padding-bottom: 12px; margin-bottom: 24px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-circle-plus"></i> Create a Job
          </h3>
          
          <form id="wb-create-job-form">
            <!-- Quick Presets Dropdown -->
            <div class="form-group-large" style="background-color: hsl(var(--primary)/0.03); padding: 16px; border-radius: 8px; border: 1px solid hsl(var(--primary)/0.1); margin-bottom: 20px;">
              <label class="form-label" for="wb-job-preset-select" style="font-weight: 800; color: hsl(var(--primary)); display: flex; align-items: center; gap: 8px; font-size: 0.95rem;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> Load Quick Shift Preset
              </label>
              <select class="form-input-large" id="wb-job-preset-select" style="font-size: 0.9rem; padding: 10px;">
                <option value="">-- Select Preset (Manual Entry) --</option>
              </select>
              <span style="font-size: 0.7rem; color: hsl(var(--text-muted)); display: block; margin-top: 4px;">Loads pre-saved site address, client, description, and required photo checklist.</span>
            </div>
            <div class="form-group-large">
              <label class="form-label" for="wb-job-site">Where is the work site? (Site Address)</label>
              <input class="form-input-large" type="text" id="wb-job-site" required placeholder="e.g. 12 River Road, London">
            </div>

            <div class="form-group-large">
              <label class="form-label" for="wb-job-client">What is the Scheme? (replaces Client / Contract)</label>
              <input class="form-input-large" type="text" id="wb-job-client" required placeholder="e.g. Phase A Scheme">
            </div>

            <div class="form-group-large">
              <label class="form-label" for="wb-job-desc">What needs to be done? (Task Description)</label>
              <textarea class="form-input-large" id="wb-job-desc" rows="3" required placeholder="e.g. Structural welding on the bridge joints"></textarea>
            </div>

            <div style="display: flex; flex-direction: column; gap: 16px;">
              <div class="form-group-large" style="margin-bottom: 0;">
                <label class="form-label" for="wb-job-date">Which day?</label>
                <input class="form-input-large" type="date" id="wb-job-date" required value="${todayStr}" style="width:100%;">
              </div>
              <div class="form-group-large" style="margin-bottom: 0;">
                <label class="form-label" style="font-weight: 700; margin-bottom: 8px;">Shift Start Time</label>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 10px;">
                  <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; color: hsl(var(--text-main)); background: hsl(var(--bg-primary)); border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); padding: 10px 16px;">
                    <input type="radio" name="wb-job-time-period" value="All Day" checked style="width: 18px; height: 18px; accent-color: hsl(var(--primary));"> All Day
                  </label>
                  <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; color: hsl(var(--text-main)); background: hsl(var(--bg-primary)); border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); padding: 10px 16px;">
                    <input type="radio" name="wb-job-time-period" value="AM" style="width: 18px; height: 18px; accent-color: hsl(var(--primary));"> AM Shift
                  </label>
                  <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; color: hsl(var(--text-main)); background: hsl(var(--bg-primary)); border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); padding: 10px 16px;">
                    <input type="radio" name="wb-job-time-period" value="PM" style="width: 18px; height: 18px; accent-color: hsl(var(--primary));"> PM Shift
                  </label>
                </div>
                <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.88rem; color: hsl(var(--text-muted)); font-weight: 600; cursor: pointer;">
                  <input type="checkbox" id="wb-job-specify-exact" style="width: 18px; height: 18px; accent-color: hsl(var(--primary));"> Specify exact time
                </label>
                <div id="wb-job-exact-time-container" style="display: none; margin-top: 10px;">
                  <input class="form-input-large" type="time" id="wb-job-time" value="08:00" style="padding: 10px; width: 100%; font-size: 1rem;">
                </div>
              </div>
            </div>

            <!-- Required Completion Photos Checklist -->
            <div class="form-group-large" style="margin-top: 16px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 16px;">
              <label class="form-label" style="font-weight: 700; margin-bottom: 2px;">Required Completion Photos Checklist</label>
              <span style="font-size: 0.72rem; color: hsl(var(--text-muted)); display: block; margin-bottom: 10px;">List the specific photos the engineer must upload to finish this shift.</span>
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <input type="text" id="wb-job-photo-req-input" placeholder="e.g. Photo of completed sign board" class="form-input-large" style="font-size: 0.85rem; padding: 8px 12px; flex: 1;">
                <button type="button" id="wb-job-add-photo-req-btn" class="btn btn-secondary" style="font-size: 0.8rem; padding: 8px 16px; font-weight: 700; white-space: nowrap;">+ Add Photo</button>
              </div>
              <div id="wb-job-photo-req-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto; margin-top: 8px;"></div>
            </div>

            <div class="form-group-large">
              <label class="form-label" for="wb-job-notes">Any special instructions? (Optional)</label>
              <textarea class="form-input-large" id="wb-job-notes" rows="2" placeholder="e.g. Access via side gate. High-vis vest mandatory."></textarea>
            </div>

            <div class="form-group-large">
              <label class="form-label" for="wb-job-files">Attach drawings or specifications (Optional)</label>
              <input class="form-input-large" type="file" id="wb-job-files" multiple style="font-size: 0.85rem; padding: 12px;">
            </div>

            <!-- Save Preset Option -->
            <div class="form-group-large" style="margin-top: 20px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 16px; background-color: hsl(var(--bg-primary)/0.3); padding: 12px; border-radius: 8px;">
              <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 0.92rem; color: hsl(var(--text-main)); font-weight: 700; cursor: pointer;">
                <input type="checkbox" id="wb-job-save-preset-chk" style="width: 18px; height: 18px; accent-color: hsl(var(--primary));"> Save details as a Quick Preset
              </label>
              <div id="wb-job-save-preset-name-container" style="display: none; margin-top: 12px;">
                <input type="text" id="wb-job-save-preset-name" placeholder="Preset name (e.g. Welding Shift)" class="form-input-large" style="font-size: 0.85rem; padding: 10px;">
              </div>
            </div>

            <button type="submit" class="btn btn-primary" id="wb-btn-create-job" style="width: 100%; padding: 16px; font-size: 1.15rem; font-weight: 800; border-radius: var(--radius-md); text-transform: uppercase; letter-spacing: 0.05em; background-color: hsl(var(--success)); border-color: transparent; margin-top: 10px;">
              Create Job
            </button>
          </form>
        </div>
      `;
    }

    // ----------------------------------------------------
    // TAB CONTENT: JOB BOARD (Spacious Grid Layout)
    // ----------------------------------------------------
    if (activeTab === 'board') {
      const jobsBySite = {};
      activeJobs.forEach(job => {
        const siteKey = job.siteAddress || 'Unknown Site';
        if (!jobsBySite[siteKey]) {
          jobsBySite[siteKey] = {
            siteAddress: siteKey,
            eNumber: job.eNumber || '',
            jobs: []
          };
        }
        jobsBySite[siteKey].jobs.push(job);
      });

      Object.values(jobsBySite).forEach(group => {
        group.jobs.sort((a, b) => b.date.localeCompare(a.date));
      });

      const sortedSites = Object.values(jobsBySite).sort((a, b) => a.siteAddress.localeCompare(b.siteAddress));

      mainContentHTML = `
        <style>
          details.site-job-details[open] .toggle-chevron {
            transform: rotate(180deg);
          }
          details.site-job-details summary::-webkit-details-marker {
            display: none;
          }
          details.site-job-details summary {
            list-style: none;
          }
          .job-board-site-card {
            background-color: hsl(var(--bg-card));
            border: 1px solid hsl(var(--border));
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-sm);
            padding: 16px;
            transition: all 0.2s ease;
          }
        </style>
        <div style="margin-bottom: 24px;">
          <h3 style="font-weight: 800; font-size: 1.4rem; color: hsl(var(--primary)); margin-bottom: 6px;">Active Job Board Feed</h3>
          <p style="font-size: 0.85rem; color: hsl(var(--text-muted));">An overview of all job tasks, assignments, and check-in statuses grouped by site.</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 24px;">
          ${sortedSites.map(site => `
            <details class="site-job-details job-board-site-card">
              
              <!-- Site Header Summary -->
              <summary style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; outline: none; user-select: none;">
                <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-right: 12px;">
                  <span style="font-weight: 800; font-size: 1.15rem; color: hsl(var(--primary)); letter-spacing: -0.01em;">
                    ${site.eNumber || 'No E-Number'}
                  </span>
                  <span style="font-size: 0.84rem; color: hsl(var(--text-muted)); font-weight: 600; line-height: 1.3;">
                    ${site.siteAddress}
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                  <span class="status-badge" style="background-color: hsl(var(--primary)/0.08); color: hsl(var(--primary)); font-weight: 800; font-size: 0.72rem; padding: 4px 10px; border-radius: 20px; border: none;">
                    ${site.jobs.length} ${site.jobs.length === 1 ? 'Job' : 'Jobs'}
                  </span>
                  <i class="fa-solid fa-chevron-down toggle-chevron" style="color: hsl(var(--text-muted)); font-size: 0.8rem; transition: transform 0.2s;"></i>
                </div>
              </summary>

              <!-- Collapsible RSS-like Feed container -->
              <div class="job-feed" style="display: flex; flex-direction: column; gap: 16px; position: relative; margin-top: 16px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 16px;">
                ${site.jobs.map((job, index) => {
                  let statusColorClass = 'status-pending';
                  if (job.status === 'confirmed') statusColorClass = 'status-confirmed';
                  else if (job.status === 'on site') statusColorClass = 'status-on-site';
                  else if (job.status === 'completed') statusColorClass = 'status-completed';
                  else if (job.status === 'incomplete') statusColorClass = 'status-incomplete';
                  else if (job.status === 'cancelled') statusColorClass = 'status-cancelled';

                  const photoCount = (job.completionPhotos || []).length + (job.incompletePhotos || []).length;
                  const fileCount = (job.files || []).length;

                  return `
                    <div class="feed-item" style="display: flex; gap: 14px; position: relative; ${index < site.jobs.length - 1 ? 'border-bottom: 1px dashed hsl(var(--border)/0.5); padding-bottom: 16px;' : ''}">
                      
                      <!-- Timeline indicator -->
                      <div style="display: flex; flex-direction: column; align-items: center; position: relative; flex-shrink: 0; width: 12px;">
                        <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${getStatusBorderColor(job.status)}; z-index: 2; margin-top: 5px;"></div>
                        ${index < site.jobs.length - 1 ? `
                          <div style="position: absolute; top: 15px; bottom: -20px; width: 2px; background-color: hsl(var(--border)/0.4); z-index: 1;"></div>
                        ` : ''}
                      </div>

                      <!-- Feed Content -->
                      <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0;">
                        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.78rem;">
                          <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="status-badge ${statusColorClass}" style="font-weight: 700; font-size: 0.65rem; padding: 2px 6px;">${getPlainStatus(job.status)}</span>
                            <span style="font-weight: 600; color: hsl(var(--text-muted));">${formatDate(job.date)}</span>
                          </div>
                          <div style="font-weight: 500; color: hsl(var(--text-main));">
                            <i class="fa-solid fa-helmet-safety" style="color: hsl(var(--text-muted)); margin-right: 3px;"></i>
                            Worker: <strong style="color: hsl(var(--primary));">${job.userName || 'Unassigned'}</strong>
                          </div>
                        </div>

                        <!-- Task Description -->
                        <div style="font-size: 0.85rem; padding: 8px 12px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.3); color: hsl(var(--text-main)); border-left: 3px solid ${getStatusBorderColor(job.status)}; font-weight: 500; line-height: 1.35; word-break: break-word;">
                          ${job.task}
                        </div>

                        <!-- Additional notes / comments -->
                        ${job.completionNotes ? `
                          <div style="font-size: 0.74rem; color: hsl(var(--text-muted)); font-style: italic; background-color: hsl(var(--success)/0.03); border-left: 2px solid hsl(var(--success)); padding: 4px 8px; border-radius: 2px;">
                            <strong>Notes:</strong> ${job.completionNotes}
                          </div>
                        ` : ''}
                        
                        ${job.incompleteReason ? `
                          <div style="font-size: 0.74rem; color: hsl(var(--danger)); font-weight: 600; background-color: hsl(var(--danger)/0.03); border-left: 2px solid hsl(var(--danger)); padding: 4px 8px; border-radius: 2px;">
                            <strong>Reason for Barrier:</strong> ${job.incompleteReason}
                          </div>
                        ` : ''}

                        <!-- File attachments info -->
                        ${photoCount > 0 || fileCount > 0 ? `
                          <div style="font-size: 0.72rem; color: hsl(var(--primary)); font-weight: 700; display: flex; gap: 10px;">
                            ${photoCount > 0 ? `<span><i class="fa-regular fa-image"></i> ${photoCount} Photos</span>` : ''}
                            ${fileCount > 0 ? `<span><i class="fa-solid fa-paperclip"></i> ${fileCount} Drawings</span>` : ''}
                          </div>
                        ` : ''}

                        <!-- Action buttons -->
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
                          <button class="btn btn-secondary" style="font-size: 0.7rem; padding: 4px 8px; flex: unset; font-weight: 700;" data-action="edit-job" data-id="${job.id}">
                            <i class="fa-regular fa-pen-to-square"></i> Edit
                          </button>
                          <button class="btn btn-secondary" style="font-size: 0.7rem; padding: 4px 8px; flex: unset; font-weight: 700;" data-action="assign-job" data-id="${job.id}">
                            <i class="fa-solid fa-user-plus"></i> Assign
                          </button>
                          ${photoCount > 0 ? `
                            <button class="btn btn-secondary" style="font-size: 0.7rem; padding: 4px 8px; flex: unset; font-weight: 700;" data-action="view-photos" data-id="${job.id}">
                              <i class="fa-regular fa-images"></i> Photos
                            </button>
                          ` : ''}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </details>
          `).join('')}
          ${activeJobs.length === 0 ? `
            <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: hsl(var(--text-muted));">
              <i class="fa-regular fa-clipboard fa-3x" style="margin-bottom: 12px; opacity: 0.4;"></i>
              <p style="font-style: italic;">No active jobs listed on board.</p>
            </div>
          ` : ''}
        </div>
      `;
    }

    // ----------------------------------------------------
    // COMBINED MAIN RENDER
    // ----------------------------------------------------
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; width: 100%;">
        ${tabHeaderHTML}
        <div id="wb-tab-content-mount">
          ${mainContentHTML}
        </div>
      </div>
    `;

    setupWhiteboardEvents(container, operatives, sites, shifts, users, weekDates);
  } catch (err) {
    console.error("Whiteboard load error:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading digital whiteboard: ${err.message}</p></div>`;
  }
}

function getStatusBorderColor(status) {
  if (status === 'confirmed') return '#3b82f6';
  if (status === 'on site') return '#f59e0b';
  if (status === 'completed') return '#10b981';
  if (status === 'incomplete') return '#ef4444';
  if (status === 'cancelled') return '#71717a';
  return '#9ca3af'; // pending
}

function getUserShiftStyle(hexColor, status) {
  if (status === 'cancelled') {
    return { bg: 'hsl(240 5% 94%)', text: 'hsl(240 5% 45%)', border: 'hsl(240 5% 80%)' };
  }
  let color = hexColor || '#3b82f6';
  if (!color.startsWith('#')) {
    color = '#' + color;
  }
  
  let r = 0, g = 0, b = 0;
  if (color.length === 4) {
    r = parseInt(color[1] + color[1], 16);
    g = parseInt(color[2] + color[2], 16);
    b = parseInt(color[3] + color[3], 16);
  } else if (color.length === 7) {
    r = parseInt(color.substring(1, 3), 16);
    g = parseInt(color.substring(3, 5), 16);
    b = parseInt(color.substring(5, 7), 16);
  } else {
    return { bg: 'hsl(217 91% 95%)', text: 'hsl(217 91% 35%)', border: 'hsl(217 91% 80%)' };
  }
  r /= 255; g /= 255; b /= 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  const sClamped = Math.max(s, 55); 
  const bg = `hsl(${h} ${sClamped}% 94%)`;
  const text = `hsl(${h} ${sClamped}% 25%)`;
  const border = `hsl(${h} ${sClamped}% 80%)`;
  return { bg, text, border };
}

function setupWhiteboardEvents(container, operatives, sites, shifts, allUsers, weekDates) {
  // Tab Button Listeners
  const btnPlanner = document.getElementById('wb-tab-btn-planner');
  const btnCreate = document.getElementById('wb-tab-btn-create');
  const btnBoard = document.getElementById('wb-tab-btn-board');

  if (btnPlanner) {
    btnPlanner.addEventListener('click', () => {
      setActiveTab('planner');
      init(container);
    });
  }
  if (btnCreate) {
    btnCreate.addEventListener('click', () => {
      adminRequiredPhotos = [];
      setActiveTab('create');
      init(container);
    });
  }
  if (btnBoard) {
    btnBoard.addEventListener('click', () => {
      setActiveTab('board');
      init(container);
    });
  }

  // 1. Create Job Form Submission (only if activeTab is 'create')
  const createForm = document.getElementById('wb-create-job-form');
  if (createForm) {
    // Populate presets selector
    const presetSelect = createForm.querySelector('#wb-job-preset-select');

    // Photo checklist UI updater — defined first so it can be called from preset loader
    const listContainer = createForm.querySelector('#wb-job-photo-req-list');
    const updateAdminPhotoReqListUI = () => {
      if (!listContainer) return;
      listContainer.innerHTML = adminRequiredPhotos.map((req, idx) => `
        <div style="display: flex; align-items: center; justify-content: space-between; background-color: hsl(var(--bg-primary)/0.6); padding: 8px 12px; border-radius: 6px; border: 1px solid hsl(var(--border)/0.6); font-size: 0.8rem; margin-top: 4px;">
          <span style="font-weight: 600; display: inline-flex; align-items: center; gap: 6px; color: hsl(var(--text-main));">
            <i class="fa-solid fa-camera" style="color: hsl(var(--primary)); font-size: 0.75rem;"></i> ${req}
          </span>
          <button type="button" class="btn-remove-admin-req" data-idx="${idx}" style="background: none; border: none; color: hsl(var(--danger)); cursor: pointer; padding: 2px;">
            <i class="fa-regular fa-trash-can" style="font-size: 0.8rem;"></i>
          </button>
        </div>
      `).join('');

      listContainer.querySelectorAll('.btn-remove-admin-req').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-idx'));
          adminRequiredPhotos.splice(idx, 1);
          updateAdminPhotoReqListUI();
        });
      });
    };

    const populateAdminPresets = async () => {
      if (!presetSelect) return;
      const { getPresets } = await import('../db.js');
      const allPresets = await getPresets();
      presetSelect.innerHTML = `
        <option value="">-- Select Preset (Manual Entry) --</option>
        ${allPresets.map(p => `
          <option value="${p.id}">${p.name} ${p.userId ? `(${operatives.find(o => o.id === p.userId)?.name || 'Personal'})` : '(General)'}</option>
        `).join('')}
      `;
    };
    populateAdminPresets();

    // Handle preset select change
    if (presetSelect) {
      presetSelect.addEventListener('change', async (e) => {
        const selectedId = e.target.value;
        if (!selectedId) return;

        const { getPresets } = await import('../db.js');
        const allPresets = await getPresets();
        const preset = allPresets.find(p => p.id === selectedId);

        if (preset) {
          const siteInput = createForm.querySelector('#wb-job-site');
          const clientInput = createForm.querySelector('#wb-job-client');
          if (siteInput && clientInput) {
            const parts = preset.siteAddress.split(',');
            siteInput.value = parts[0].trim();
            clientInput.value = parts[1] ? parts[1].trim() : '';
          }

          const descInput = createForm.querySelector('#wb-job-desc');
          if (descInput) descInput.value = preset.task;

          const specTimeCheckbox = createForm.querySelector('#wb-job-specify-exact');
          const exactTimeContainer = createForm.querySelector('#wb-job-exact-time-container');
          const timeInput = createForm.querySelector('#wb-job-time');
          
          if (preset.startTime === 'AM' || preset.startTime === 'PM') {
            if (specTimeCheckbox) specTimeCheckbox.checked = false;
            if (exactTimeContainer) exactTimeContainer.style.display = 'none';
            const radio = createForm.querySelector(`input[name="wb-job-time-period"][value="${preset.startTime}"]`);
            if (radio) radio.checked = true;
          } else {
            if (specTimeCheckbox) specTimeCheckbox.checked = true;
            if (exactTimeContainer) exactTimeContainer.style.display = 'block';
            if (timeInput) timeInput.value = preset.startTime;
          }

          const notesInput = createForm.querySelector('#wb-job-notes');
          if (notesInput) notesInput.value = preset.notes || '';

          adminRequiredPhotos = preset.requiredPhotos ? [...preset.requiredPhotos] : [];
          updateAdminPhotoReqListUI();
        }
      });
    }

    // Save Preset checkbox toggle
    const wbSavePresetChk = createForm.querySelector('#wb-job-save-preset-chk');
    const wbSavePresetNameContainer = createForm.querySelector('#wb-job-save-preset-name-container');
    const wbSavePresetNameInput = createForm.querySelector('#wb-job-save-preset-name');
    if (wbSavePresetChk && wbSavePresetNameContainer) {
      wbSavePresetChk.addEventListener('change', (e) => {
        wbSavePresetNameContainer.style.display = e.target.checked ? 'block' : 'none';
        if (wbSavePresetNameInput) wbSavePresetNameInput.required = e.target.checked;
      });
    }

    // Specify exact time toggle
    const wbSpecTimeCheckbox = createForm.querySelector('#wb-job-specify-exact');
    const wbExactTimeContainer = createForm.querySelector('#wb-job-exact-time-container');
    if (wbSpecTimeCheckbox && wbExactTimeContainer) {
      wbSpecTimeCheckbox.addEventListener('change', (e) => {
        wbExactTimeContainer.style.display = e.target.checked ? 'block' : 'none';
      });
    }

    // Photo checklist interactive list
    const addPhotoBtn = createForm.querySelector('#wb-job-add-photo-req-btn');
    const photoInput = createForm.querySelector('#wb-job-photo-req-input');

    if (addPhotoBtn && photoInput) {
      addPhotoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const val = photoInput.value.trim();
        if (val) {
          adminRequiredPhotos.push(val);
          photoInput.value = '';
          updateAdminPhotoReqListUI();
        }
      });

      photoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = photoInput.value.trim();
          if (val) {
            adminRequiredPhotos.push(val);
            photoInput.value = '';
            updateAdminPhotoReqListUI();
          }
        }
      });
    }

    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const siteAddress = document.getElementById('wb-job-site').value;
      const client = document.getElementById('wb-job-client').value;
      const task = document.getElementById('wb-job-desc').value;
      const date = document.getElementById('wb-job-date').value;
      
      const specifyExact = document.getElementById('wb-job-specify-exact').checked;
      let startTime = 'All Day';
      if (specifyExact) {
        startTime = document.getElementById('wb-job-time').value || '08:00';
      } else {
        const checkedRadio = document.querySelector('input[name="wb-job-time-period"]:checked');
        startTime = checkedRadio ? checkedRadio.value : 'All Day';
      }

      const notes = document.getElementById('wb-job-notes').value;
      const filesInput = document.getElementById('wb-job-files');

      const createBtn = document.getElementById('wb-btn-create-job');
      createBtn.disabled = true;
      createBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Creating Job...`;

      try {
        const filesArray = [];
        if (filesInput.files && filesInput.files.length > 0) {
          for (let i = 0; i < filesInput.files.length; i++) {
            const file = filesInput.files[i];
            const fileUrl = await uploadFile(`jobs/draft`, file);
            filesArray.push({
              name: file.name,
              url: fileUrl,
              type: file.type,
              uploadedBy: 'Office Admin',
              date: getLocalDateString()
            });
          }
        }

        const matchedSite = sites.find(s => s.address.toLowerCase().trim() === siteAddress.toLowerCase().trim());
        const siteId = matchedSite ? matchedSite.id : ('site-' + Math.random().toString(36).substr(2, 5));
        const eNumber = matchedSite ? (matchedSite.eNumber || '') : '';
        
        let managerIds = [];
        let relevantPeopleIds = [];
        if (matchedSite) {
          managerIds = matchedSite.managerIds || [];
          relevantPeopleIds = matchedSite.relevantPeopleIds || [];
        }
        
        // Find default planners
        const allPlanners = await getPlanners();
        const sitePlanners = allPlanners.filter(p => (p.siteIds || []).includes(siteId));
        if (sitePlanners.length > 0 && managerIds.length === 0 && relevantPeopleIds.length === 0) {
          managerIds = sitePlanners[0].managerIds || [];
          relevantPeopleIds = sitePlanners[0].relevantPeopleIds || [];
        }
        
        const managerNames = managerIds.map(id => users.find(u => u.id === id)?.name || 'Unknown');
        const relevantPeopleNames = relevantPeopleIds.map(id => users.find(u => u.id === id)?.name || 'Unknown');

        // Create shift
        await createShift({
          siteId,
          siteAddress: siteAddress,
          eNumber,
          userId: '',
          userName: '',
          date,
          startTime,
          task,
          notes,
          status: 'pending',
          managerIds,
          managerNames,
          relevantPeopleIds,
          relevantPeopleNames,
          files: filesArray,
          requiredPhotos: adminRequiredPhotos
        });

        // Save preset if requested
        const savePresetChecked = document.getElementById('wb-job-save-preset-chk').checked;
        if (savePresetChecked) {
          const presetName = document.getElementById('wb-job-save-preset-name').value.trim();
          if (presetName) {
            const { createPreset } = await import('../db.js');
            await createPreset({
              name: presetName,
              siteId: siteId,
              siteAddress: siteAddress,
              task,
              startTime,
              notes,
              requiredPhotos: adminRequiredPhotos,
              userId: ''
            });
            showToast(`Preset "${presetName}" saved!`, "success");
          }
        }

        showToast("Job created successfully!", "success");
        // Clear form
        createForm.reset();
        adminRequiredPhotos = [];
        document.getElementById('wb-job-date').value = getLocalDateString();
        
        // Auto transition back to the planner board tab
        setActiveTab('planner');
        init(container);
      } catch (err) {
        showToast(err.message, "error");
        createBtn.disabled = false;
        createBtn.innerHTML = `Create Job`;
      }
    });
  }

  // 2. Planner View Toggles (only if activeTab is 'planner')
  const toggleWeek = document.getElementById('wb-toggle-week');
  const toggleDay = document.getElementById('wb-toggle-day');

  if (toggleWeek && toggleDay) {
    toggleWeek.addEventListener('click', () => {
      plannerViewMode = 'week';
      init(container);
    });
    toggleDay.addEventListener('click', () => {
      plannerViewMode = 'day';
      init(container);
    });
  }

  // 3. Date Navigation (only if activeTab is 'planner')
  const btnPrev = document.getElementById('wb-planner-prev');
  const btnNext = document.getElementById('wb-planner-next');

  if (btnPrev && btnNext) {
    btnPrev.addEventListener('click', () => {
      if (plannerViewMode === 'week') {
        weekStart.setDate(weekStart.getDate() - 7);
      } else {
        weekStart.setDate(weekStart.getDate() - 1);
      }
      init(container);
    });

    btnNext.addEventListener('click', () => {
      if (plannerViewMode === 'week') {
        weekStart.setDate(weekStart.getDate() + 7);
      } else {
        weekStart.setDate(weekStart.getDate() + 1);
      }
      init(container);
    });
  }

  // 5. Full Screen Toggles
  const btnToggleFullscreen = document.getElementById('wb-toggle-fullscreen');
  if (btnToggleFullscreen) {
    btnToggleFullscreen.addEventListener('click', (e) => {
      e.preventDefault();
      whiteboardIsFullscreen = !whiteboardIsFullscreen;
      
      // Hook up escape key to exit fullscreen
      const handleEscKey = (ev) => {
        if (ev.key === 'Escape' && whiteboardIsFullscreen) {
          whiteboardIsFullscreen = false;
          document.removeEventListener('keydown', handleEscKey);
          init(container);
        }
      };
      document.addEventListener('keydown', handleEscKey);

      init(container);
    });
  }

  // 6b. Delete Engineer Sidebar Action
  document.querySelectorAll('.btn-delete-eng-sidebar').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const uId = btn.getAttribute('data-id');
      const uName = btn.getAttribute('data-name');
      const currentUser = getCurrentUser();
      if (uId === currentUser?.id) { showToast("You cannot delete your own account.", "error"); return; }
      
      showModal({
        title: `Delete ${uName}?`,
        bodyHTML: `
          <div style="text-align:center; padding:8px 0;">
            <i class="fa-solid fa-circle-exclamation" style="font-size:2.5rem; color:hsl(var(--danger)); display:block; margin-bottom:12px;"></i>
            <p style="font-weight:700;">This cannot be undone.</p>
            <p style="color:hsl(var(--text-muted)); font-size:0.9rem; margin-top:8px; line-height:1.6;">
              <strong>${uName}</strong> will be permanently removed. Their shifts remain but they will lose system access.
            </p>
          </div>
        `,
        confirmText: 'Yes, Delete',
        cancelText: 'Cancel',
        onConfirm: async () => {
          try {
            const { deleteUser } = await import('../db.js');
            await deleteUser(uId);
            showToast(`${uName} deleted.`, 'success');
            hideModal();
            init(container);
          } catch (err) { showToast(err.message, 'error'); }
        }
      });
    });
  });

  // 6. Engineer Sidebar Search Filter
  const engSearch = document.getElementById('eng-sidebar-search');
  if (engSearch) {
    // Keep focus when list updates if necessary, but standard input events are synchronous
    engSearch.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const cards = document.querySelectorAll('#wb-tab-content-mount .engineer-draggable-card');
      cards.forEach(card => {
        const name = card.querySelector('div > div:first-child')?.textContent.toLowerCase() || '';
        const trade = card.querySelector('div > div:nth-child(2)')?.textContent.toLowerCase() || '';
        if (name.includes(term) || trade.includes(term)) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }

  // 4. Drag & Drop - Engineer cards (only if activeTab is 'planner')
  document.querySelectorAll('.engineer-draggable-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        id: card.getAttribute('data-eng-id'),
        type: 'engineer'
      }));
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  // Drag & Drop - Job cards inside cells (rescheduling date)
  document.querySelectorAll('.whiteboard-job-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        id: card.getAttribute('data-shift-id'),
        type: 'shift'
      }));
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  // Drop targets - Date Boxes
  document.querySelectorAll('.whiteboard-date-box').forEach(box => {
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.classList.add('drag-over');
    });

    box.addEventListener('dragleave', () => {
      box.classList.remove('drag-over');
    });

    box.addEventListener('drop', async (e) => {
      e.preventDefault();
      box.classList.remove('drag-over');

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;

      try {
        const dragData = JSON.parse(raw);
        const targetDate = box.getAttribute('data-date');

        if (dragData.type === 'shift') {
          // Move job to different date
          const shiftId = dragData.id;
          const shift = shifts.find(s => s.id === shiftId);
          if (shift && shift.date !== targetDate) {
            await updateShift(shiftId, { date: targetDate });
            
            // Notification handled by Cloud Function
            showToast("Job rescheduled successfully!", "success");
            init(container);
          }
        } else if (dragData.type === 'engineer') {
          const engineer = operatives.find(o => o.id === dragData.id);
          if (engineer) {
            openScheduleModal(container, engineer.id, 'select', 'select', targetDate, operatives, weekDates, sites, null, allUsers, () => init(container));
          }
        }
      } catch (err) {
        console.error(err);
      }
    });
  });

  // Drop targets - Job Cards (to assign engineer directly by dropping on it)
  document.querySelectorAll('.whiteboard-job-card').forEach(jobCard => {
    jobCard.addEventListener('dragover', (e) => {
      e.preventDefault();
      jobCard.style.transform = 'scale(1.03)';
      jobCard.style.borderColor = 'hsl(var(--primary))';
    });

    jobCard.addEventListener('dragleave', () => {
      jobCard.style.transform = 'scale(1)';
      jobCard.style.borderColor = 'hsl(var(--border))';
    });

    jobCard.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      jobCard.style.transform = 'scale(1)';
      jobCard.style.borderColor = 'hsl(var(--border))';

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;

      try {
        const dragData = JSON.parse(raw);
        const shiftId = jobCard.getAttribute('data-shift-id');

        if (dragData.type === 'engineer') {
          const engineer = operatives.find(o => o.id === dragData.id);
          const shift = shifts.find(s => s.id === shiftId);

          if (engineer && shift) {
            await updateShift(shiftId, {
              userId: engineer.id,
              userName: engineer.name,
              status: 'pending' // reset status
            });

            // Notification handled by Cloud Function

            showToast(`Assigned ${engineer.name} to job successfully!`, "success");
            init(container);
          }
        }
      } catch (err) {
        console.error(err);
      }
    });
  });

  // 5. Job Board Actions (Edit, Assign, View Photos, Cancel, Mark Complete)
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const jobId = btn.getAttribute('data-id');
    const job = shifts.find(s => s.id === jobId);

    if (!job) return;

    if (action === 'edit-job') {
      showModal({
        title: 'Modify Job Details',
        bodyHTML: `
          <form id="wb-edit-job-form">
            <div class="form-group">
              <label class="form-label" for="wb-edit-site">Where is the work site?</label>
              <input class="form-input" type="text" id="wb-edit-site" value="${job.siteAddress}" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="wb-edit-task">What needs to be done? (Task)</label>
              <input class="form-input" type="text" id="wb-edit-task" value="${job.task}" required>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <div class="form-group" style="flex: 1; min-width: 140px;">
                <label class="form-label" for="wb-edit-date">Which day?</label>
                <input class="form-input" type="date" id="wb-edit-date" value="${job.date}" required>
              </div>
              <div class="form-group" style="flex: 1.5; min-width: 240px;">
                <label class="form-label" style="font-weight: 700; margin-bottom: 6px;">Shift Start Time</label>
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                  <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="radio" name="wb-edit-time-period" value="All Day" ${job.startTime === 'All Day' || !job.startTime || (!['AM', 'PM'].includes(job.startTime) && !job.startTime.includes(':')) ? 'checked' : ''} style="width: 14px; height: 14px; accent-color: hsl(var(--primary));"> All Day
                  </label>
                  <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="radio" name="wb-edit-time-period" value="AM" ${job.startTime === 'AM' ? 'checked' : ''} style="width: 14px; height: 14px; accent-color: hsl(var(--primary));"> AM
                  </label>
                  <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="radio" name="wb-edit-time-period" value="PM" ${job.startTime === 'PM' ? 'checked' : ''} style="width: 14px; height: 14px; accent-color: hsl(var(--primary));"> PM
                  </label>
                </div>
                <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; color: hsl(var(--text-muted)); font-weight: 600; cursor: pointer;">
                  <input type="checkbox" id="wb-edit-specify-exact" ${(job.startTime && job.startTime.includes(':')) ? 'checked' : ''} style="width: 14px; height: 14px; accent-color: hsl(var(--primary));"> Specify exact time
                </label>
                <div id="wb-edit-exact-time-container" style="display: ${(job.startTime && job.startTime.includes(':')) ? 'block' : 'none'}; margin-top: 6px;">
                  <input class="form-input" type="time" id="wb-edit-time" value="${(job.startTime && job.startTime.includes(':')) ? job.startTime : '08:00'}" style="padding: 4px 8px; width: 120px; font-size: 0.8rem;">
                </div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="wb-edit-notes">Instructions / Notes</label>
              <textarea class="form-input" id="wb-edit-notes" rows="2">${job.notes || ''}</textarea>
            </div>
          </form>
        `,
        confirmText: 'Save Changes',
        onConfirm: async (body) => {
          const siteAddress = body.querySelector('#wb-edit-site').value.trim();
          const task = body.querySelector('#wb-edit-task').value.trim();
          const date = body.querySelector('#wb-edit-date').value;
          
          const specifyExact = body.querySelector('#wb-edit-specify-exact').checked;
          let startTime = 'All Day';
          if (specifyExact) {
            startTime = body.querySelector('#wb-edit-time').value || '08:00';
          } else {
            const checkedRadio = body.querySelector('input[name="wb-edit-time-period"]:checked');
            startTime = checkedRadio ? checkedRadio.value : 'All Day';
          }
          const notes = body.querySelector('#wb-edit-notes').value.trim();

          try {
            await updateShift(jobId, { siteAddress, task, date, startTime, notes });
            showToast("Job details updated successfully!", "success");
            hideModal();
            init(container);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });

      const editSpecTime = document.getElementById('wb-edit-specify-exact');
      const editExactTimeContainer = document.getElementById('wb-edit-exact-time-container');
      if (editSpecTime && editExactTimeContainer) {
        editSpecTime.addEventListener('change', (e) => {
          editExactTimeContainer.style.display = e.target.checked ? 'block' : 'none';
        });
      }
    } else if (action === 'assign-job') {
      showModal({
        title: 'Assign Worker to Job',
        bodyHTML: `
          <form id="wb-assign-form">
            <div class="form-group">
              <label class="form-label" for="wb-assign-select">Select Engineer</label>
              <select class="form-input" id="wb-assign-select">
                <option value="">-- Unassigned --</option>
                ${operatives.map(o => `<option value="${o.id}" ${o.id === job.userId ? 'selected' : ''}>${o.name} (${o.trade || 'Builder'})</option>`).join('')}
              </select>
            </div>
          </form>
        `,
        confirmText: 'Save Assignment',
        onConfirm: async (body) => {
          const userId = body.querySelector('#wb-assign-select').value;
          const engineer = operatives.find(o => o.id === userId);

          try {
            await updateShift(jobId, {
              userId: userId || '',
              userName: engineer ? engineer.name : '',
              status: userId ? 'pending' : 'pending' // reset status
            });

            // Notification handled by Cloud Function
            showToast("Worker assigned successfully.", "success");
            hideModal();
            init(container);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    } else if (action === 'view-photos') {
      showModal({
        title: 'Uploaded Evidence Photos',
        showFooter: true,
        confirmText: 'Close Window',
        onConfirm: () => hideModal(),
        bodyHTML: `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${(job.completionPhotos || []).map((url, idx) => {
              const label = (job.requiredPhotos && job.requiredPhotos[idx]) ? job.requiredPhotos[idx] : 'Completion Photo';
              return `
                <div style="display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid hsl(var(--border)/0.8); border-radius: 8px; background-color: hsl(var(--bg-primary)/0.2);">
                  <img src="${url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid hsl(var(--border)); cursor: pointer;" onclick="window.open('${url}')">
                  <strong style="font-size: 0.85rem; color: hsl(var(--text-main));">${label}</strong>
                </div>
              `;
            }).join('')}
            ${(job.incompletePhotos || []).map(url => `
              <div style="display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid hsl(var(--border)/0.8); border-radius: 8px; background-color: hsl(var(--danger)/0.05); border-left: 4px solid hsl(var(--danger));">
                <img src="${url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid hsl(var(--border)); cursor: pointer;" onclick="window.open('${url}')">
                <div>
                  <strong style="font-size: 0.85rem; color: hsl(var(--danger)); display: block;">Incomplete Work Proof</strong>
                  <span style="font-size: 0.78rem; color: hsl(var(--text-muted)); font-style: italic;">Reason: ${job.incompleteReason || 'No reason provided.'}</span>
                </div>
              </div>
            `).join('')}
            ${(!job.completionPhotos || job.completionPhotos.length === 0) && (!job.incompletePhotos || job.incompletePhotos.length === 0) ? `
              <p style="text-align: center; color: hsl(var(--text-muted)); font-style: italic; font-size: 0.85rem;">No photos uploaded for this job.</p>
            ` : ''}
          </div>
        `
      });
    } else if (action === 'cancel-job') {
      if (confirm("Are you sure you want to cancel this job? The engineer will see the job is cancelled.")) {
        const now = new Date().toISOString();
        const timestamps = job.timestamps || {};
        timestamps.cancelled = now;

        await updateShift(jobId, { status: 'cancelled', timestamps });
        // Notification handled by Cloud Function
        showToast("Job has been cancelled.", "warning");
        init(container);
      }
    } else if (action === 'complete-job') {
      const note = prompt("Enter completion notes for this job (optional):");
      if (note === null) return; // cancelled prompt

      const now = new Date().toISOString();
      const timestamps = job.timestamps || {};
      timestamps.completed = now;

      await updateShift(jobId, {
        status: 'completed',
        completionNotes: note,
        timestamps
      });

      // Notification handled by Cloud Function
      showToast("Job marked completed successfully!", "success");
      init(container);
    }
  });
}

export function destroy() {}

