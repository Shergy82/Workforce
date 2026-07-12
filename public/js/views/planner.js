import { getCurrentUser } from '../auth.js';
import { 
  getShifts, 
  getSites, 
  getUsers, 
  updateShift, 
  createNotification, 
  getPlanners, 
  createPlanner, 
  updatePlanner, 
  deletePlanner,
  createShift,
  deleteShift,
  updateUser,
  createSite
} from '../db.js';
import { formatDate, getLoadingSpinner, getLocalDateString } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';

let weekStart = new Date();
// Set to Monday of the current week in local time
const dayOfWeek = weekStart.getDay();
const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
weekStart.setDate(diff);
weekStart.setHours(0, 0, 0, 0);

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const plannerId = urlParams.get('id');

  container.innerHTML = getLoadingSpinner();

  if (plannerId) {
    await renderPlannerBoard(container, user, plannerId);
  } else {
    await renderPlannersDirectory(container, user);
  }
}

// -----------------------------------------------------------------------------
// DIRECTORY MODE (Show lists of Planner Boards)
// -----------------------------------------------------------------------------
async function renderPlannersDirectory(container, user) {
  try {
    const [planners, sites, users] = await Promise.all([
      getPlanners(),
      getSites(),
      getUsers()
    ]);

    const activeSites = sites.filter(s => s.status === 'active');
    const managers = users.filter(u => u.role === 'admin' || u.role === 'manager' || u.role === 'owner');
    const relevantPeople = users.filter(u => u.role === 'operative' || u.role === 'supervisor');

    // Pre-resolve names for display cards
    const resolvedPlanners = planners.map(p => {
      const managerNames = (p.managerIds || []).map(id => users.find(u => u.id === id)?.name || 'Unknown');
      const relevantPeopleNames = (p.relevantPeopleIds || []).map(id => users.find(u => u.id === id)?.name || 'Unknown');
      return { ...p, managerNames, relevantPeopleNames };
    });

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-weight: 800; color: hsl(var(--primary)); margin: 0;">Planners Directory</h2>
          <p style="font-size: 0.85rem; color: hsl(var(--text-muted)); margin-top: 4px;">Select or create a planner board to manage weekly schedules.</p>
        </div>
        <button class="btn btn-primary" id="btn-new-planner"><i class="fa-solid fa-plus"></i> Create Planner Board</button>
      </div>

      <div class="dashboard-grid" id="planners-grid">
        ${resolvedPlanners.length > 0 ? resolvedPlanners.map(p => `
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-top: 5px solid hsl(var(--primary)); box-shadow: var(--shadow-md); transition: var(--transition);" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
            <div>
              <h3 style="font-weight: 800; font-size: 1.25rem; color: hsl(var(--primary)); margin-bottom: 6px;">${p.name}</h3>
              <span style="font-size: 0.78rem; font-weight: 700; color: hsl(var(--text-muted)); text-transform: uppercase; background-color: hsl(var(--primary)/0.08); padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 12px;">
                Scheme: ${p.scheme || 'N/A'}
              </span>
              
              <div style="font-size: 0.82rem; color: hsl(var(--text-main)); margin-bottom: 10px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 8px;">
                <strong>Managers:</strong> ${p.managerNames.length > 0 ? p.managerNames.join(', ') : 'None'}
              </div>
              <div style="font-size: 0.82rem; color: hsl(var(--text-main)); margin-bottom: 10px;">
                <strong>Relevant People:</strong> ${p.relevantPeopleNames.length > 0 ? p.relevantPeopleNames.join(', ') : 'None'}
              </div>
              <div style="font-size: 0.82rem; color: hsl(var(--text-muted));">
                <strong>Sites Allocated:</strong> ${(p.siteIds || []).filter(id => { const s = sites.find(x => x.id === id); return s && s.status === 'active'; }).length} sites
              </div>
            </div>
            
            <div style="display: flex; gap: 8px; margin-top: 16px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 12px;">
              <button class="btn btn-primary" style="flex: 1; font-size: 0.8rem; padding: 8px;" onclick="location.hash='#/planner?id=${p.id}'">
                <i class="fa-solid fa-calendar-days"></i> Open Board
              </button>
              <button class="btn btn-danger btn-delete-planner" data-id="${p.id}" style="font-size: 0.8rem; padding: 8px 12px;">
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </div>
        `).join('') : `
          <div class="card" style="grid-column: span 3; text-align: center; padding: 40px 0; color: hsl(var(--text-muted));">
            <i class="fa-solid fa-chalkboard-user fa-3x" style="margin-bottom:16px; opacity:0.4;"></i>
            <p>No planner boards have been created yet.</p>
            <button class="btn btn-primary" id="btn-new-planner-empty" style="margin-top: 12px;"><i class="fa-solid fa-plus"></i> Create First Board</button>
          </div>
        `}
      </div>
    `;

    setupDirectoryEvents(container, user, planners, activeSites, managers, relevantPeople);
  } catch (err) {
    console.error("Error loading planners:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading planners directory: ${err.message}</p></div>`;
  }
}

function setupDirectoryEvents(container, user, planners, activeSites, managers, relevantPeople) {
  const createBtn = document.getElementById('btn-new-planner') || document.getElementById('btn-new-planner-empty');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      showModal({
        title: 'Create New Planner Board',
        bodyHTML: `
          <form id="new-planner-form">
            <div class="form-group">
              <label class="form-label" for="new-planner-name">Planner Board Name</label>
              <input class="form-input" type="text" id="new-planner-name" required placeholder="e.g. Phase 1 Board">
            </div>
            <div class="form-group">
              <label class="form-label" for="new-planner-scheme">Scheme / Contract</label>
              <input class="form-input" type="text" id="new-planner-scheme" required placeholder="e.g. Scheme A">
            </div>

            <div class="form-group">
              <label class="form-label">Default Board Managers</label>
              <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${managers.map(m => `
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="planner-managers" value="${m.id}">
                    <span>${m.name} (${m.role})</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Default Relevant People</label>
              <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${relevantPeople.map(p => `
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="planner-relevant" value="${p.id}">
                    <span>${p.name} (${p.trade || p.role})</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Select Sites to Include on this Board</label>
              <div style="max-height: 150px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${activeSites.map(s => `
                  <label style="display: flex; align-items: start; gap: 8px; font-size: 0.8rem; margin-bottom: 6px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="planner-sites" value="${s.id}" style="margin-top: 2px;">
                    <div>
                      <strong>${s.eNumber || 'No E-Number'}</strong> - ${s.address} <span style="font-size:0.7rem; color:hsl(var(--text-muted));">(${s.scheme || s.client || 'General'})</span>
                    </div>
                  </label>
                `).join('')}
                ${activeSites.length === 0 ? '<p style="font-size:0.8rem; font-style:italic; color:hsl(var(--text-muted)); text-align:center;">No active sites. Create one in Sites first.</p>' : ''}
              </div>
            </div>
          </form>
        `,
        confirmText: 'Create Board',
        onConfirm: async (body) => {
          const name = body.querySelector('#new-planner-name').value.trim();
          const scheme = body.querySelector('#new-planner-scheme').value.trim();
          const managerIds = Array.from(body.querySelectorAll('input[name="planner-managers"]:checked')).map(el => el.value);
          const relevantPeopleIds = Array.from(body.querySelectorAll('input[name="planner-relevant"]:checked')).map(el => el.value);
          const siteIds = Array.from(body.querySelectorAll('input[name="planner-sites"]:checked')).map(el => el.value);

          if (!name || !scheme) {
            showToast("Planner name and Scheme are required.", "error");
            return;
          }

          try {
            await createPlanner({ name, scheme, managerIds, relevantPeopleIds, siteIds });
            showToast("Planner board created!", "success");
            hideModal();
            renderPlannersDirectory(container, user);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  }

  // Delete Board Event Listener
  container.querySelectorAll('.btn-delete-planner').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const p = planners.find(board => board.id === id);

      showModal({
        title: 'Delete Planner Board',
        bodyHTML: `
          <div style="padding: 10px 0;">
            <p style="font-weight: 600; font-size: 0.95rem; color: hsl(var(--text-main));">
              Are you sure you want to permanently delete the planner board <strong>"${p ? p.name : 'this board'}"</strong>?
            </p>
            <p style="font-size: 0.82rem; color: hsl(var(--text-muted)); margin-top: 6px;">
              This will only delete the board configuration. Actual sites, address directories, and scheduled shifts will not be deleted.
            </p>
          </div>
        `,
        confirmText: 'Delete Board',
        onConfirm: async () => {
          try {
            await deletePlanner(id);
            showToast("Planner board deleted.", "success");
            hideModal();
            renderPlannersDirectory(container, user);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  });
}

// -----------------------------------------------------------------------------
// BOARD MODE (Show Weekly Grid for a specific Planner Board)
// -----------------------------------------------------------------------------
async function renderPlannerBoard(container, user, plannerId) {
  try {
    const [planners, shifts, sites, users] = await Promise.all([
      getPlanners(),
      getShifts(),
      getSites(),
      getUsers()
    ]);

    const planner = planners.find(p => p.id === plannerId);
    if (!planner) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px;">
          <i class="fa-solid fa-triangle-exclamation fa-3x" style="color:hsl(var(--danger)); margin-bottom:16px;"></i>
          <h3>Planner Board Not Found</h3>
          <button class="btn btn-primary" onclick="location.hash='#/planner'" style="margin-top:16px;">Back to Directory</button>
        </div>
      `;
      return;
    }

    // Filter sites belonging to this planner
    const plannerSiteIds = planner.siteIds || [];
    const plannerSites = sites.filter(s => plannerSiteIds.includes(s.id) && s.status === 'active');
    const operatives = users.filter(u => u.role === 'operative' && u.status === 'active');
    const managersList = users.filter(u => u.role === 'admin' || u.role === 'manager' || u.role === 'owner');
    const relevantPeopleList = users.filter(u => u.role === 'operative' || u.role === 'supervisor');

    // Pre-resolve manager & relevant names for display in the subheader
    const managerNames = (planner.managerIds || []).map(id => users.find(u => u.id === id)?.name || 'Unknown');
    const relevantPeopleNames = (planner.relevantPeopleIds || []).map(id => users.find(u => u.id === id)?.name || 'Unknown');

    // Generate dates for Mon - Sun of the selected week (Timezone Safe Local Time)
    const weekDates = [];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      weekDates.push({ dateStr, dayName: dayNames[i], label });
    }

    const rangeLabel = `${weekDates[0].label} - ${weekDates[6].label} ${weekStart.getFullYear()}`;

    // Draggable Roster Tray
    const rosterBarHTML = `
      <div class="card" style="padding: 16px; margin-bottom: 20px; box-shadow: var(--shadow-sm); border: 1px solid hsl(var(--border)/0.8);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 12px;">
          <div>
            <strong style="font-size: 0.95rem; color: hsl(var(--primary)); display: flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-helmet-safety"></i> Draggable Engineers List
            </strong>
            <span style="font-size: 0.72rem; color: hsl(var(--text-muted)); font-weight: 500; display: block; margin-top: 2px;">
              Drag card onto a day cell or site address, OR click any empty cell/address to assign.
            </span>
          </div>
          <div>
            <input type="text" id="roster-search" placeholder="🔍 Search engineer by name or skill..." 
                   style="padding: 8px 12px; font-size: 0.8rem; border-radius: 6px; border: 1px solid hsl(var(--border)); width: 260px; outline: none; background-color: hsl(var(--bg-card)); color: hsl(var(--text-main)); box-shadow: var(--shadow-sm); transition: var(--transition);">
          </div>
        </div>
        <div id="roster-cards-container" style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; flex-wrap: nowrap; -webkit-overflow-scrolling: touch;">
          ${operatives.map(o => `
            <div class="engineer-draggable-card" draggable="true" data-eng-id="${o.id}" data-search-term="${(o.name + ' ' + (o.trade || 'Builder')).toLowerCase()}"
                 style="padding: 8px 12px; font-size: 0.8rem; border-radius: 6px; border: 1px solid hsl(var(--border)); background-color: hsl(var(--bg-card)); cursor: grab; display: flex; align-items: center; gap: 8px; flex-shrink: 0; min-width: 140px; box-shadow: var(--shadow-sm); transition: var(--transition);">
              <i class="fa-solid fa-grip-vertical" style="color: hsl(var(--text-muted));"></i>
              <div style="min-width: 0;">
                <div style="font-weight: 700; color: hsl(var(--text-main)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.82rem;">${o.name}</div>
                <div style="font-size: 0.65rem; color: hsl(var(--text-muted));">${o.trade || 'Builder'}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

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

    const tableHTML = `
      <div style="overflow-x: auto; background-color: hsl(var(--bg-card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius-md); box-shadow: var(--shadow-sm);">
        <table style="border-collapse: collapse; width: 100%; min-width: 900px; table-layout: fixed;">
          <thead>
            <tr style="background-color: hsl(var(--bg-primary)/0.5); border-bottom: 2px solid hsl(var(--border));">
              <th style="padding: 14px 16px; text-align: left; font-weight: 700; font-size: 0.85rem; color: hsl(var(--text-muted)); width: 240px; position: sticky; left: 0; background-color: hsl(var(--bg-card)); z-index: 5; border-right: 2px solid hsl(var(--border));">
                Sites / Addresses
              </th>
              ${weekDates.map(wd => `
                <th style="padding: 12px; text-align: center; font-weight: 700; font-size: 0.85rem; color: hsl(var(--text-main)); border-right: 1px solid hsl(var(--border)/0.5);">
                  <div>${wd.dayName}</div>
                  <div style="font-size: 0.72rem; color: hsl(var(--text-muted)); font-weight: 500; margin-top: 2px;">${wd.label}</div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${plannerSites.map(site => {
              const siteName = site.address || site.name || 'Unnamed Site';

              let cellsHTML = weekDates.map(wd => {
                const cellShifts = shifts.filter(s => s.siteId === site.id && s.date === wd.dateStr);

                return `
                  <td style="vertical-align: top; padding: 6px; border: 1px solid hsl(var(--border)/0.8); background-color: hsl(var(--bg-card)); position: relative;">
                    <div class="planner-cell-dropzone" 
                         data-site-id="${site.id}" 
                         data-site-address="${siteName}" 
                         data-date="${wd.dateStr}"
                         style="min-height: 90px; display: flex; flex-direction: column; gap: 6px; height: 100%; width: 100%; border: 1px dashed transparent; border-radius: 4px; padding: 4px; cursor: pointer; transition: background-color 0.15s ease;"
                         onmouseover="this.style.backgroundColor='hsl(var(--bg-primary)/0.4)'"
                         onmouseout="this.style.backgroundColor='transparent'">
                      
                      ${cellShifts.map(s => {
                        const worker = users.find(u => u.id === s.userId);
                        const style = getUserShiftStyle(worker?.color, s.status);
                        return `
                          <div class="planner-shift-badge" 
                               data-shift-id="${s.id}" 
                               data-shift-user-id="${s.userId || ''}"
                               data-shift-address="${s.siteAddress || ''}"
                               data-shift-date="${s.date || ''}"
                               style="padding: 8px 10px; font-size: 0.75rem; border-radius: 6px; display: flex; flex-direction: column; gap: 3px; background-color: ${style.bg}; color: ${style.text}; border: 1px solid ${style.border}; box-shadow: var(--shadow-sm); font-weight: 600; line-height: 1.3;">
                            <div style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.78rem;">
                              <i class="fa-solid fa-user" style="font-size: 0.7rem; margin-right: 2px;"></i> ${s.userName}
                            </div>
                            <div style="font-size: 0.65rem; opacity: 0.95; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                              ${s.startTime || '08:00'} | ${s.status || 'awaiting'}
                            </div>
                            <div style="display: flex; gap: 6px; margin-top: 6px;">
                              ${s.status !== 'cancelled' ? `
                                <button class="planner-cancel-shift-btn planner-action-btn" data-shift-id="${s.id}" 
                                        style="color: ${style.text};"
                                        title="Cancel shift">
                                  <i class="fa-solid fa-ban" style="font-size: 0.65rem; flex-shrink: 0;"></i><span>Cancel</span>
                                </button>
                              ` : ''}
                              <button class="planner-delete-shift-btn planner-action-btn" data-shift-id="${s.id}" 
                                      title="Delete shift">
                                <i class="fa-solid fa-trash" style="font-size: 0.65rem; flex-shrink: 0;"></i><span>Delete</span>
                              </button>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </td>
                `;
              }).join('');

              const weekShifts = shifts.filter(s => s.siteId === site.id && weekDates.some(wd => wd.dateStr === s.date));
              const weeklyWorkers = [...new Set(weekShifts.map(s => s.userName).filter(Boolean))];

              return `
                <tr style="border-bottom: 1px solid hsl(var(--border));">
                  <td class="planner-site-dropzone" 
                      data-site-id="${site.id}" 
                      data-site-address="${siteName}" 
                      style="font-weight: 700; font-size: 0.85rem; padding: 14px 16px; background-color: hsl(var(--bg-primary)/0.4); position: sticky; left: 0; z-index: 4; border-right: 2px solid hsl(var(--border)); vertical-align: top; white-space: normal; word-break: break-word; border: 2px dashed transparent; transition: var(--transition);" 
                      title="${siteName}">
                    
                    <!-- Prominent E-Number in site list -->
                    <div style="font-size: 1.1rem; font-weight: 800; color: hsl(var(--primary)); margin-bottom: 4px;">
                      ${site.eNumber || 'No E-Number'}
                    </div>

                    <div style="display: flex; align-items: start; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                      <a href="#/site-detail?id=${site.id}" style="text-decoration: underline; color: hsl(var(--text-main)); font-size: 0.82rem; font-weight: 700; display: block; white-space: normal; word-break: break-word;" title="${siteName}">${siteName}</a>
                      <button class="btn btn-secondary site-assign-btn" 
                              data-site-id="${site.id}" 
                              data-site-address="${siteName}" 
                              style="padding: 2px 6px; font-size: 0.65rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; cursor: pointer;"
                              title="Assign engineer to this site">
                        <i class="fa-solid fa-plus"></i> Assign
                      </button>
                    </div>
                    
                    <div style="font-size: 0.72rem; color: hsl(var(--text-muted)); font-weight: 500;">
                      Scheme: ${site.scheme || site.client || 'N/A'}
                    </div>
                    
                    <!-- Weekly Team Badge Section -->
                    <div style="margin-top: 12px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 8px;">
                      <span style="font-size: 0.62rem; color: hsl(var(--text-muted)); font-weight: 700; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">Team this week:</span>
                      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        ${weeklyWorkers.map(name => `
                          <span style="font-size: 0.62rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; background-color: hsl(var(--primary)/0.08); color: hsl(var(--primary)); border: none; display: inline-flex; align-items: center; gap: 3px;">
                            <i class="fa-solid fa-user" style="font-size: 0.55rem;"></i> ${name.split(' ')[0]}
                          </span>
                        `).join('')}
                        ${weeklyWorkers.length === 0 ? `
                          <span style="font-size: 0.65rem; color: hsl(var(--text-muted)); font-style: italic;">No workers</span>
                        ` : ''}
                      </div>
                    </div>
                  </td>
                  ${cellsHTML}
                </tr>
              `;
            }).join('')}
            ${plannerSites.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: hsl(var(--text-muted));">
                  No active sites associated with this planner. Click **Edit Board** to add sites to it.
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;

    // Combined Output
    container.innerHTML = `
      <style>
        .planner-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1px solid;
          cursor: pointer;
          font-weight: 700;
          font-size: 0.65rem;
          overflow: hidden;
          white-space: nowrap;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          background: transparent;
        }
        .planner-action-btn span {
          display: inline-block;
          opacity: 0;
          max-width: 0;
          transition: all 0.2s ease;
          font-size: 0.6rem;
          margin-left: 0;
        }
        .planner-action-btn:hover {
          width: unset;
          height: 22px;
          padding: 0 8px;
          border-radius: 11px;
          gap: 4px;
        }
        .planner-action-btn:hover span {
          opacity: 1;
          max-width: 60px;
        }
        .planner-cancel-shift-btn {
          border-color: currentColor;
          color: inherit;
        }
        .planner-cancel-shift-btn:hover {
          background-color: rgba(0,0,0,0.06);
        }
        .planner-delete-shift-btn {
          border-color: hsl(var(--danger)/0.3);
          background-color: hsl(var(--danger)/0.05);
          color: hsl(var(--danger));
        }
        .planner-delete-shift-btn:hover {
          background-color: hsl(var(--danger)) !important;
          color: white !important;
          border-color: transparent !important;
        }
      </style>
      <div style="margin-bottom: 16px;">
        <button class="btn btn-secondary" onclick="location.hash='#/planner'" style="padding: 6px 12px;">
          <i class="fa-solid fa-arrow-left"></i> Back to Directory
        </button>
      </div>

      <div class="card" style="padding: 20px; box-shadow: var(--shadow-sm); border: 1px solid hsl(var(--border)/0.8); margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="font-weight: 800; color: hsl(var(--primary)); margin: 0; font-size: 1.5rem;">${planner.name}</h2>
            <p style="font-size: 0.85rem; color: hsl(var(--text-muted)); margin-top: 4px;">
              <strong>Scheme:</strong> ${planner.scheme || 'N/A'} | 
              <strong>Managers:</strong> ${managerNames.join(', ') || 'None'} |
              <strong>Relevant People:</strong> ${relevantPeopleNames.join(', ') || 'None'}
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" id="btn-add-site-board" style="font-weight: 700;"><i class="fa-solid fa-plus"></i> Add Site</button>
            <button class="btn btn-secondary" id="btn-edit-planner" style="font-weight: 700;"><i class="fa-solid fa-pen-to-square"></i> Edit Board</button>
            <button class="btn btn-secondary" id="planner-print-btn" style="font-weight: 700;"><i class="fa-solid fa-print"></i> Print</button>
          </div>
        </div>

        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap;">
          <button class="btn btn-secondary" id="planner-week-prev" style="padding: 6px 12px; font-weight: 700;"><i class="fa-solid fa-chevron-left"></i> Previous Week</button>
          <h3 style="font-weight: 800; min-width: 180px; text-align: center; font-size: 1.05rem; color: hsl(var(--primary)); margin: 0;">${rangeLabel}</h3>
          <button class="btn btn-secondary" id="planner-week-next" style="padding: 6px 12px; font-weight: 700;">Next Week <i class="fa-solid fa-chevron-right"></i></button>
        </div>

        ${rosterBarHTML}
        ${tableHTML}
      </div>
    `;

    setupBoardEvents(container, user, planner, operatives, plannerSites, sites, shifts, weekDates, managersList, relevantPeopleList, users);
  } catch (err) {
    console.error("Planner board load error:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading Planner Board: ${err.message}</p></div>`;
  }
}

function setupBoardEvents(container, user, planner, operatives, plannerSites, allSites, shifts, weekDates, managersList, relevantPeopleList, allUsers) {
  // Navigation
  document.getElementById('planner-week-prev').addEventListener('click', () => {
    weekStart.setDate(weekStart.getDate() - 7);
    renderPlannerBoard(container, getCurrentUser(), planner.id);
  });

  document.getElementById('planner-week-next').addEventListener('click', () => {
    weekStart.setDate(weekStart.getDate() + 7);
    renderPlannerBoard(container, getCurrentUser(), planner.id);
  });

  document.getElementById('planner-print-btn').addEventListener('click', () => {
    window.print();
  });

  // Add Site to Board trigger
  const addSiteBoardBtn = document.getElementById('btn-add-site-board');
  if (addSiteBoardBtn) {
    addSiteBoardBtn.addEventListener('click', () => {
      showModal({
        title: 'Add New Site to Board',
        bodyHTML: `
          <form id="new-site-form">
            <div class="form-group">
              <label class="form-label" for="new-site-enum">E Number (Required Reference)</label>
              <input class="form-input" type="text" id="new-site-enum" required placeholder="e.g. E12345">
            </div>
            <div class="form-group">
              <label class="form-label" for="new-site-address">Site Address</label>
              <input class="form-input" type="text" id="new-site-address" required placeholder="e.g. 10 Downing Street, London">
            </div>
            <div class="form-group">
              <label class="form-label" for="new-site-scheme">Scheme</label>
              <input class="form-input" type="text" id="new-site-scheme" required placeholder="e.g. Contract Scheme Name" value="${planner.scheme || ''}">
            </div>
            <div class="form-group">
              <label class="form-label" for="new-site-desc">Job Description</label>
              <textarea class="form-input" id="new-site-desc" rows="3" required placeholder="Outline the main work to be done..."></textarea>
            </div>
            <div class="form-group">
              <label class="form-label" for="new-site-notes">Operational Notes (Optional)</label>
              <textarea class="form-input" id="new-site-notes" rows="2" placeholder="Gate codes, PPE, hazards..."></textarea>
            </div>
            
            <div class="form-group">
              <label class="form-label">Specific Site Managers (Optional Override)</label>
              <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${managersList.map(m => `
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="site-managers" value="${m.id}" ${ (planner.managerIds || []).includes(m.id) ? 'checked' : '' }>
                    <span>${m.name} (${m.role})</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Specific Relevant People (Optional Override)</label>
              <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${relevantPeopleList.map(p => `
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="site-relevant" value="${p.id}" ${ (planner.relevantPeopleIds || []).includes(p.id) ? 'checked' : '' }>
                    <span>${p.name} (${p.trade || p.role})</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </form>
        `,
        confirmText: 'Save & Link to Board',
        onConfirm: async (body) => {
          const eNumber = body.querySelector('#new-site-enum').value.trim();
          const address = body.querySelector('#new-site-address').value.trim();
          const scheme = body.querySelector('#new-site-scheme').value.trim();
          const description = body.querySelector('#new-site-desc').value.trim();
          const notes = body.querySelector('#new-site-notes').value.trim();

          const selectedManagers = Array.from(body.querySelectorAll('input[name="site-managers"]:checked')).map(el => el.value);
          const selectedRelevant = Array.from(body.querySelectorAll('input[name="site-relevant"]:checked')).map(el => el.value);

          if (!eNumber || !address || !scheme) {
            showToast("E Number, Address, and Scheme are required.", "error");
            return;
          }

          try {
            const newSite = await createSite({
              eNumber, address, scheme, description, notes, status: 'active',
              managerIds: selectedManagers,
              relevantPeopleIds: selectedRelevant,
              files: [], photos: []
            });
            const newSiteId = newSite.id;

            const updatedSiteIds = [...(planner.siteIds || []), newSiteId];
            await updatePlanner(planner.id, { siteIds: updatedSiteIds });
            planner.siteIds = updatedSiteIds;

            showToast("Site Address saved and linked to board!", "success");
            hideModal();
            renderPlannerBoard(container, user, planner.id);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  }

  // Edit Board trigger
  document.getElementById('btn-edit-planner').addEventListener('click', () => {
    const activeAllSites = allSites.filter(s => s.status === 'active');
    
    showModal({
      title: 'Edit Planner Board Settings',
      bodyHTML: `
        <form id="edit-planner-form">
          <div class="form-group">
            <label class="form-label" for="edit-planner-name">Planner Board Name</label>
            <input class="form-input" type="text" id="edit-planner-name" value="${planner.name || ''}" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-planner-scheme">Scheme / Contract</label>
            <input class="form-input" type="text" id="edit-planner-scheme" value="${planner.scheme || ''}" required>
          </div>

          <div class="form-group">
            <label class="form-label">Default Board Managers</label>
            <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
              ${managersList.map(m => {
                const checked = planner.managerIds && planner.managerIds.includes(m.id) ? 'checked' : '';
                return `
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="edit-planner-managers" value="${m.id}" ${checked}>
                    <span>${m.name} (${m.role})</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Default Relevant People</label>
            <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
              ${relevantPeopleList.map(p => {
                const checked = planner.relevantPeopleIds && planner.relevantPeopleIds.includes(p.id) ? 'checked' : '';
                return `
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="edit-planner-relevant" value="${p.id}" ${checked}>
                    <span>${p.name} (${p.trade || p.role})</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Sites Included on this Board</label>
            <div style="max-height: 150px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
              ${activeAllSites.map(s => {
                const checked = planner.siteIds && planner.siteIds.includes(s.id) ? 'checked' : '';
                return `
                  <label style="display: flex; align-items: start; gap: 8px; font-size: 0.8rem; margin-bottom: 6px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="edit-planner-sites" value="${s.id}" style="margin-top: 2px;" ${checked}>
                    <div>
                      <strong>${s.eNumber || 'No E-Number'}</strong> - ${s.address} <span style="font-size:0.7rem; color:hsl(var(--text-muted));">(${s.scheme || s.client || 'General'})</span>
                    </div>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        </form>
      `,
      confirmText: 'Save Settings',
      onConfirm: async (body) => {
        const name = body.querySelector('#edit-planner-name').value.trim();
        const scheme = body.querySelector('#edit-planner-scheme').value.trim();
        const managerIds = Array.from(body.querySelectorAll('input[name="edit-planner-managers"]:checked')).map(el => el.value);
        const relevantPeopleIds = Array.from(body.querySelectorAll('input[name="edit-planner-relevant"]:checked')).map(el => el.value);
        const siteIds = Array.from(body.querySelectorAll('input[name="edit-planner-sites"]:checked')).map(el => el.value);

        if (!name || !scheme) {
          showToast("Name and Scheme are required.", "error");
          return;
        }

        try {
          await updatePlanner(planner.id, { name, scheme, managerIds, relevantPeopleIds, siteIds });
          showToast("Planner board updated!", "success");
          hideModal();
          renderPlannerBoard(container, getCurrentUser(), planner.id);
        } catch (err) {
          showToast(err.message, "error");
        }
      }
    });
  });

  // Roster Search Input
  const searchInput = document.getElementById('roster-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.engineer-draggable-card').forEach(card => {
        const term = card.getAttribute('data-search-term') || '';
        if (term.includes(val)) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }

  // Draggables
  document.querySelectorAll('.engineer-draggable-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        id: card.getAttribute('data-eng-id'),
        type: 'engineer'
      }));
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  // Dropzones
  const zones = document.querySelectorAll('.planner-cell-dropzone');
  zones.forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.borderColor = 'hsl(var(--primary))';
      zone.style.backgroundColor = 'hsl(var(--primary)/0.05)';
    });

    zone.addEventListener('dragleave', () => {
      zone.style.borderColor = 'transparent';
      zone.style.backgroundColor = 'transparent';
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.style.borderColor = 'transparent';
      zone.style.backgroundColor = 'transparent';

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      try {
        const dragData = JSON.parse(raw);
        const targetSiteId = zone.getAttribute('data-site-id');
        const targetSiteAddress = zone.getAttribute('data-site-address');
        const targetDate = zone.getAttribute('data-date');

        if (dragData.type === 'engineer') {
          openScheduleModal(container, dragData.id, targetSiteId, targetSiteAddress, targetDate, operatives, weekDates, plannerSites, planner, allUsers);
        }
      } catch (err) {
        console.error(err);
      }
    });

    zone.addEventListener('click', (e) => {
      if (e.target.classList.contains('planner-cell-dropzone') || e.target.closest('.planner-cell-dropzone')) {
        if (e.target.closest('.planner-shift-badge')) return;

        const siteId = zone.getAttribute('data-site-id');
        const siteAddress = zone.getAttribute('data-site-address');
        const dateStr = zone.getAttribute('data-date');
        openScheduleModal(container, 'select', siteId, siteAddress, dateStr, operatives, weekDates, plannerSites, planner, allUsers);
      }
    });
  });

  const siteZones = document.querySelectorAll('.planner-site-dropzone');
  siteZones.forEach(sz => {
    sz.addEventListener('dragover', (e) => {
      e.preventDefault();
      sz.style.borderColor = 'hsl(var(--primary))';
      sz.style.backgroundColor = 'hsl(var(--primary)/0.08)';
    });

    sz.addEventListener('dragleave', () => {
      sz.style.borderColor = 'transparent';
      sz.style.backgroundColor = 'hsl(var(--bg-primary)/0.4)';
    });

    sz.addEventListener('drop', async (e) => {
      e.preventDefault();
      sz.style.borderColor = 'transparent';
      sz.style.backgroundColor = 'hsl(var(--bg-primary)/0.4)';

      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;

      try {
        const dragData = JSON.parse(raw);
        const targetSiteId = sz.getAttribute('data-site-id');
        const targetSiteAddress = sz.getAttribute('data-site-address');

        if (dragData.type === 'engineer') {
          openScheduleModal(container, dragData.id, targetSiteId, targetSiteAddress, 'select', operatives, weekDates, plannerSites, planner, allUsers);
        }
      } catch (err) {
        console.error(err);
      }
    });
  });

  document.querySelectorAll('.site-assign-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const siteId = btn.getAttribute('data-site-id');
      const siteAddress = btn.getAttribute('data-site-address');
      openScheduleModal(container, 'select', siteId, siteAddress, 'select', operatives, weekDates, plannerSites, planner, allUsers);
    });
  });

  // Cancel shift
  document.querySelectorAll('.planner-cancel-shift-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const shiftId = btn.getAttribute('data-shift-id');
      const badge = btn.closest('.planner-shift-badge');
      const userId = badge?.getAttribute('data-shift-user-id');
      const address = badge?.getAttribute('data-shift-address');
      const date = badge?.getAttribute('data-shift-date');

      showModal({
        title: 'Cancel Shift',
        bodyHTML: `
          <div style="padding: 8px 0;">
            <p style="font-size: 0.9rem; color: hsl(var(--text-main)); margin-bottom: 12px;">
              <i class="fa-solid fa-ban" style="color: hsl(45 93% 40%); margin-right: 6px;"></i>
              Are you sure you want to <strong>cancel</strong> this shift?
            </p>
            <p style="font-size: 0.8rem; color: hsl(var(--text-muted));">The shift will remain visible but marked as cancelled. The engineer will be notified.</p>
          </div>
        `,
        confirmText: 'Cancel Shift',
        onConfirm: async () => {
          try {
            await updateShift(shiftId, { status: 'cancelled' });

            // Notification handled by Cloud Function

            showToast("Shift cancelled!", "success");
            hideModal();
            renderPlannerBoard(container, getCurrentUser(), planner.id);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  });

  // Delete shift
  document.querySelectorAll('.planner-delete-shift-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const shiftId = btn.getAttribute('data-shift-id');
      const badge = btn.closest('.planner-shift-badge');
      const userId = badge?.getAttribute('data-shift-user-id');
      const address = badge?.getAttribute('data-shift-address');
      const date = badge?.getAttribute('data-shift-date');

      showModal({
        title: 'Delete Shift',
        bodyHTML: `
          <div style="padding: 8px 0;">
            <p style="font-size: 0.9rem; color: hsl(var(--text-main)); margin-bottom: 12px;">
              <i class="fa-solid fa-triangle-exclamation" style="color: hsl(var(--danger)); margin-right: 6px;"></i>
              Are you sure you want to <strong>permanently delete</strong> this shift?
            </p>
            <p style="font-size: 0.8rem; color: hsl(var(--text-muted));">This action cannot be undone. The engineer will be notified.</p>
          </div>
        `,
        confirmText: 'Delete Shift',
        onConfirm: async () => {
          try {
            await deleteShift(shiftId);

            // Notification handled by Cloud Function

            showToast("Shift deleted successfully!", "success");
            hideModal();
            renderPlannerBoard(container, getCurrentUser(), planner.id);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  });
}

// -----------------------------------------------------------------------------
// SCHEDULING MODAL & FLOW
// -----------------------------------------------------------------------------
export async function openScheduleModal(container, dragDataId, targetSiteId, targetSiteAddress, targetDate, operatives, weekDates, sites, parentPlanner, allUsers, onSuccess) {
  const isEngineerSelect = !dragDataId || dragDataId === 'select';
  const isDateSelect = !targetDate || targetDate === 'select';
  const isSiteSelect = !targetSiteId || targetSiteId === 'select';

  const engineerOptionsHTML = operatives.map(o => `
    <option value="${o.id}">${o.name} (${o.trade || 'Builder'})</option>
  `).join('');

  const dateOptionsHTML = weekDates.map(wd => `
    <option value="${wd.dateStr}">${wd.dayName} (${wd.label})</option>
  `).join('');

  const siteOptionsHTML = sites.map(s => `
    <option value="${s.id}" data-address="${s.address || s.name || ''}">${s.address || s.name || ''} (${s.scheme || s.client || 'N/A'})</option>
  `).join('');

  let headerHTML = `
    <div style="font-size: 0.85rem; background-color: hsl(var(--bg-primary)/0.4); padding: 12px; border-radius: 6px; margin-bottom: 16px; border: 1px solid hsl(var(--border)/0.5);">
      ${!isSiteSelect ? `<strong>Site:</strong> ${targetSiteAddress}<br>` : ''}
      ${!isDateSelect ? `<strong>Date:</strong> ${formatDate(targetDate)}<br>` : ''}
      ${!isEngineerSelect ? `<strong>Engineer:</strong> ${operatives.find(o => o.id === dragDataId)?.name || ''}` : ''}
    </div>
  `;

  let modalRequiredPhotos = [];

  let formFieldsHTML = `
    ${isEngineerSelect ? `
      <div class="form-group">
        <label class="form-label" for="sched-engineer">Who is the engineer?</label>
        <select class="form-input" id="sched-engineer" required style="font-size: 0.9rem; padding: 10px;">
          <option value="" disabled selected>-- Choose Engineer --</option>
          ${engineerOptionsHTML}
        </select>
      </div>
    ` : `<input type="hidden" id="sched-engineer" value="${dragDataId}">`}

    ${isSiteSelect ? `
      <div class="form-group">
        <label class="form-label" for="sched-site-select">Which site?</label>
        <select class="form-input" id="sched-site-select" required style="font-size: 0.9rem; padding: 10px;">
          <option value="" disabled selected>-- Choose Site Address --</option>
          ${siteOptionsHTML}
        </select>
      </div>
    ` : `<input type="hidden" id="sched-site-select" value="${targetSiteId}">`}

    ${isDateSelect ? `
      <div class="form-group">
        <label class="form-label" for="sched-date">Which day?</label>
        <select class="form-input" id="sched-date" required style="font-size: 0.9rem; padding: 10px;">
          ${dateOptionsHTML}
        </select>
      </div>
    ` : `<input type="hidden" id="sched-date" value="${targetDate}">`}

    <div class="form-group">
      <label class="form-label" for="sched-task">What needs to be done? (Task Description)</label>
      <div style="display: flex; gap: 8px;">
        <input class="form-input" type="text" id="sched-task" placeholder="e.g. Structural welding on the bridge joints" required style="flex: 1;">
        <button type="button" id="sched-save-task-btn" class="btn btn-secondary" style="font-size: 0.8rem; padding: 8px 12px; font-weight: 700; white-space: nowrap;" title="Save to engineer's task directory">
          <i class="fa-regular fa-bookmark"></i> Save Task
        </button>
      </div>
      <div id="sched-task-directory-container" style="margin-top: 8px; display: none;">
        <span style="font-size: 0.72rem; color: hsl(var(--text-muted)); font-weight: 600; display: block; margin-bottom: 4px;">Task Directory (Quick Select):</span>
        <div id="sched-task-directory-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
      </div>
    </div>

    <!-- Shift Time Period Selection -->
    <div class="form-group">
      <label class="form-label" style="font-weight: 700; margin-bottom: 6px;">Shift Start Time</label>
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 8px;">
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.88rem; font-weight: 600; cursor: pointer; color: hsl(var(--text-main));">
          <input type="radio" name="shift-time-period" value="All Day" checked style="width: 16px; height: 16px; accent-color: hsl(var(--primary));"> All Day
        </label>
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.88rem; font-weight: 600; cursor: pointer; color: hsl(var(--text-main));">
          <input type="radio" name="shift-time-period" value="AM" style="width: 16px; height: 16px; accent-color: hsl(var(--primary));"> AM Shift
        </label>
        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.88rem; font-weight: 600; cursor: pointer; color: hsl(var(--text-main));">
          <input type="radio" name="shift-time-period" value="PM" style="width: 16px; height: 16px; accent-color: hsl(var(--primary));"> PM Shift
        </label>
      </div>
      <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; color: hsl(var(--text-muted)); font-weight: 600; cursor: pointer; margin-top: 4px;">
        <input type="checkbox" id="shift-specify-exact" style="width: 16px; height: 16px; accent-color: hsl(var(--primary));"> Specify exact start time
      </label>
      <div id="shift-exact-time-container" style="display: none; margin-top: 10px;">
        <input class="form-input" type="time" id="sched-time" value="08:00" style="font-size: 0.9rem; padding: 8px; width: 140px;">
      </div>
    </div>

    <!-- Required Completion Photos Checklist -->
    <div class="form-group" style="border-top: 1px solid hsl(var(--border)/0.5); padding-top: 12px; margin-top: 12px;">
      <label class="form-label" style="font-weight: 700; margin-bottom: 2px;">Required Completion Photos Checklist</label>
      <span style="font-size: 0.72rem; color: hsl(var(--text-muted)); display: block; margin-bottom: 10px;">List the specific photos the engineer must upload to finish this shift.</span>
      <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
        <input type="text" id="sched-photo-req-input" placeholder="e.g. Photo of completed sign board" class="form-input" style="font-size: 0.85rem; padding: 8px 12px; flex: 1; min-width: 200px;">
        <div style="display: flex; gap: 6px;">
          <button type="button" id="sched-add-photo-req-btn" class="btn btn-secondary" style="font-size: 0.8rem; padding: 8px 12px; font-weight: 700; white-space: nowrap;">+ Add Photo</button>
          <button type="button" id="sched-save-photo-req-btn" class="btn btn-secondary" style="font-size: 0.8rem; padding: 8px 12px; font-weight: 700; white-space: nowrap;" title="Save to engineer's photo checklist directory">
            <i class="fa-regular fa-bookmark"></i> Save
          </button>
        </div>
      </div>
      <div id="sched-photo-directory-container" style="margin-top: 8px; display: none;">
        <span style="font-size: 0.72rem; color: hsl(var(--text-muted)); font-weight: 600; display: block; margin-bottom: 4px;">Photo Directory (Quick Select):</span>
        <div id="sched-photo-directory-list" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
      </div>
      <div id="sched-photo-req-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto; margin-top: 8px;"></div>
    </div>

    <div class="form-group">
      <label class="form-label" for="sched-notes">Any special instructions? (Optional)</label>
      <textarea class="form-input" id="sched-notes" rows="2" placeholder="e.g. Access via side gate. High-vis vest mandatory."></textarea>
    </div>
  `;

  showModal({
    title: isEngineerSelect ? 'Create New Shift' : `Schedule ${operatives.find(o => o.id === dragDataId)?.name || 'Worker'}`,
    bodyHTML: `
      <form id="planner-schedule-form">
        ${headerHTML}
        ${formFieldsHTML}
      </form>
    `,
    confirmText: 'Create Shift',
    onConfirm: async (body) => {
      const selectedEngineerId = body.querySelector('#sched-engineer').value;
      const selectedDate = body.querySelector('#sched-date').value;
      const selectedSiteId = body.querySelector('#sched-site-select').value;
      const siteSelectEl = body.querySelector('#sched-site-select');
      const selectedSiteAddress = siteSelectEl.value === 'select' ? targetSiteAddress : (siteSelectEl.options?.[siteSelectEl.selectedIndex]?.getAttribute('data-address') || targetSiteAddress);
      
      const task = body.querySelector('#sched-task').value.trim();
      const notes = body.querySelector('#sched-notes').value.trim();

      const specifyExact = body.querySelector('#shift-specify-exact').checked;
      let startTime = 'All Day';
      if (specifyExact) {
        startTime = body.querySelector('#sched-time').value || '08:00';
      } else {
        const checkedRadio = body.querySelector('input[name="shift-time-period"]:checked');
        startTime = checkedRadio ? checkedRadio.value : 'All Day';
      }

      if (!selectedEngineerId) {
        showToast("Please select an engineer", "error");
        return;
      }
      if (!selectedSiteId) {
        showToast("Please select a site", "error");
        return;
      }

      const engineer = operatives.find(o => o.id === selectedEngineerId);
      if (!engineer) return;

      const targetSite = sites.find(s => s.id === selectedSiteId);

      // Determine Managers and Relevant People based on site overrides or planner defaults
      let managerIds = [];
      let relevantPeopleIds = [];

      if (targetSite) {
        if (targetSite.managerIds && targetSite.managerIds.length > 0) {
          managerIds = targetSite.managerIds;
        } else if (parentPlanner) {
          managerIds = parentPlanner.managerIds || [];
        }

        if (targetSite.relevantPeopleIds && targetSite.relevantPeopleIds.length > 0) {
          relevantPeopleIds = targetSite.relevantPeopleIds;
        } else if (parentPlanner) {
          relevantPeopleIds = parentPlanner.relevantPeopleIds || [];
        }
      }

      // If managers are not found, look up defaults from any planner board containing this site
      if (targetSite && managerIds.length === 0 && relevantPeopleIds.length === 0) {
        const allPlanners = await getPlanners();
        const sitePlanners = allPlanners.filter(p => (p.siteIds || []).includes(targetSite.id));
        if (sitePlanners.length > 0) {
          managerIds = sitePlanners[0].managerIds || [];
          relevantPeopleIds = sitePlanners[0].relevantPeopleIds || [];
        }
      }

      // Resolve user names
      const managerNames = managerIds.map(id => allUsers.find(u => u.id === id)?.name || 'Unknown');
      const relevantPeopleNames = relevantPeopleIds.map(id => allUsers.find(u => u.id === id)?.name || 'Unknown');
      const eNumber = targetSite ? (targetSite.eNumber || '') : '';

      try {
        await createShift({
          siteId: selectedSiteId,
          siteAddress: selectedSiteAddress,
          eNumber,
          userId: engineer.id,
          userName: engineer.name,
          date: selectedDate,
          startTime,
          task,
          notes,
          status: 'pending',
          managerIds,
          managerNames,
          relevantPeopleIds,
          relevantPeopleNames,
          requiredPhotos: modalRequiredPhotos
        });

        // Notification handled by Cloud Function

        showToast(`Scheduled ${engineer.name} successfully!`, "success");
        hideModal();
        if (onSuccess) {
          onSuccess();
        } else {
          if (parentPlanner) {
            renderPlannerBoard(container, getCurrentUser(), parentPlanner.id);
          } else {
            init(container);
          }
        }
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });

  setTimeout(() => {
    const modalForm = document.getElementById('planner-schedule-form');
    if (!modalForm) return;

    // Elements lookup
    const engineerSelect = modalForm.querySelector('#sched-engineer');
    const specTimeCheckbox = modalForm.querySelector('#shift-specify-exact');
    const exactTimeContainer = modalForm.querySelector('#shift-exact-time-container');
    const addPhotoBtn = modalForm.querySelector('#sched-add-photo-req-btn');
    const photoInput = modalForm.querySelector('#sched-photo-req-input');
    const photoListContainer = modalForm.querySelector('#sched-photo-req-list');

    // 1. Task Directory Functionality
    const saveTaskBtn = modalForm.querySelector('#sched-save-task-btn');
    const taskInput = modalForm.querySelector('#sched-task');
    const taskDirContainer = modalForm.querySelector('#sched-task-directory-container');
    const taskDirList = modalForm.querySelector('#sched-task-directory-list');

    const updateTaskDirectoryUI = async (engineerId) => {
      if (!taskDirContainer || !taskDirList) return;
      if (!engineerId) {
        taskDirContainer.style.display = 'none';
        return;
      }
      const engineer = allUsers.find(u => u.id === engineerId);
      if (!engineer) {
        taskDirContainer.style.display = 'none';
        return;
      }
      const savedTasks = engineer.savedTasks || [];
      if (savedTasks.length === 0) {
        taskDirContainer.style.display = 'none';
        return;
      }
      taskDirContainer.style.display = 'block';
      taskDirList.innerHTML = savedTasks.map(t => `
        <span class="task-directory-tag" data-task="${t.replace(/"/g, '&quot;')}" style="font-size: 0.72rem; padding: 4px 10px; border-radius: 20px; background-color: hsl(var(--primary)/0.08); color: hsl(var(--primary)); cursor: pointer; font-weight: 600; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.backgroundColor='hsl(var(--primary)/0.15)'" onmouseout="this.style.backgroundColor='hsl(var(--primary)/0.08)'">
          <span>${t}</span>
          <button type="button" class="delete-task-tag-btn" data-task="${t.replace(/"/g, '&quot;')}" style="background: none; border: none; padding: 0; color: hsl(var(--text-muted)); cursor: pointer; display: inline-flex; align-items: center; font-size: 0.75rem;" title="Delete task">&times;</button>
        </span>
      `).join('');

      taskDirList.querySelectorAll('.task-directory-tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
          if (e.target.classList.contains('delete-task-tag-btn') || e.target.parentElement.classList.contains('delete-task-tag-btn')) return;
          const taskVal = tag.getAttribute('data-task');
          if (taskInput) {
            taskInput.value = taskVal;
          }
        });
      });

      taskDirList.querySelectorAll('.delete-task-tag-btn').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const taskToRemove = btn.getAttribute('data-task');
          const updatedTasks = (engineer.savedTasks || []).filter(t => t !== taskToRemove);
          try {
            await updateUser(engineerId, { savedTasks: updatedTasks });
            engineer.savedTasks = updatedTasks;
            showToast("Task removed from directory.", "success");
            updateTaskDirectoryUI(engineerId);
          } catch (err) {
            showToast(err.message, "error");
          }
        });
      });
    };

    if (saveTaskBtn && taskInput) {
      saveTaskBtn.addEventListener('click', async () => {
        const engineerId = engineerSelect ? engineerSelect.value : dragDataId;
        const taskVal = taskInput.value.trim();
        if (!engineerId) {
          showToast("Please select an engineer first.", "error");
          return;
        }
        if (!taskVal) {
          showToast("Please enter a task description first.", "error");
          return;
        }
        const engineer = allUsers.find(u => u.id === engineerId);
        if (!engineer) return;
        const savedTasks = engineer.savedTasks || [];
        if (savedTasks.includes(taskVal)) {
          showToast("Task is already in directory.", "info");
          return;
        }
        const updatedTasks = [...savedTasks, taskVal];
        try {
          await updateUser(engineerId, { savedTasks: updatedTasks });
          engineer.savedTasks = updatedTasks;
          showToast("Task saved to engineer's directory!", "success");
          updateTaskDirectoryUI(engineerId);
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    }

    // 2. Photo Directory Functionality
    const savePhotoBtn = modalForm.querySelector('#sched-save-photo-req-btn');
    const photoDirContainer = modalForm.querySelector('#sched-photo-directory-container');
    const photoDirList = modalForm.querySelector('#sched-photo-directory-list');

    const updatePhotoDirectoryUI = async (engineerId) => {
      if (!photoDirContainer || !photoDirList) return;
      if (!engineerId) {
        photoDirContainer.style.display = 'none';
        return;
      }
      const engineer = allUsers.find(u => u.id === engineerId);
      if (!engineer) {
        photoDirContainer.style.display = 'none';
        return;
      }
      const savedPhotos = engineer.savedPhotos || [];
      if (savedPhotos.length === 0) {
        photoDirContainer.style.display = 'none';
        return;
      }
      photoDirContainer.style.display = 'block';
      photoDirList.innerHTML = savedPhotos.map(p => `
        <span class="photo-directory-tag" data-photo="${p.replace(/"/g, '&quot;')}" style="font-size: 0.72rem; padding: 4px 10px; border-radius: 20px; background-color: hsl(var(--accent)/0.08); color: hsl(var(--accent)); cursor: pointer; font-weight: 600; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;" onmouseover="this.style.backgroundColor='hsl(var(--accent)/0.15)'" onmouseout="this.style.backgroundColor='hsl(var(--accent)/0.08)'">
          <span>${p}</span>
          <button type="button" class="delete-photo-tag-btn" data-photo="${p.replace(/"/g, '&quot;')}" style="background: none; border: none; padding: 0; color: hsl(var(--text-muted)); cursor: pointer; display: inline-flex; align-items: center; font-size: 0.75rem;" title="Delete photo requirement">&times;</button>
        </span>
      `).join('');

      photoDirList.querySelectorAll('.photo-directory-tag').forEach(tag => {
        tag.addEventListener('click', (ev) => {
          if (ev.target.classList.contains('delete-photo-tag-btn') || ev.target.parentElement.classList.contains('delete-photo-tag-btn')) return;
          const photoVal = tag.getAttribute('data-photo');
          if (photoVal && !modalRequiredPhotos.includes(photoVal)) {
            modalRequiredPhotos.push(photoVal);
            renderPhotoList();
          }
        });
      });

      photoDirList.querySelectorAll('.delete-photo-tag-btn').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const photoToRemove = btn.getAttribute('data-photo');
          const updatedPhotos = (engineer.savedPhotos || []).filter(t => t !== photoToRemove);
          try {
            await updateUser(engineerId, { savedPhotos: updatedPhotos });
            engineer.savedPhotos = updatedPhotos;
            showToast("Photo requirement removed from directory.", "success");
            updatePhotoDirectoryUI(engineerId);
          } catch (err) {
            showToast(err.message, "error");
          }
        });
      });
    };

    if (savePhotoBtn && photoInput) {
      savePhotoBtn.addEventListener('click', async () => {
        const engineerId = engineerSelect ? engineerSelect.value : dragDataId;
        const photoVal = photoInput.value.trim();
        if (!engineerId) {
          showToast("Please select an engineer first.", "error");
          return;
        }
        if (!photoVal) {
          showToast("Please enter a photo requirement first.", "error");
          return;
        }
        const engineer = allUsers.find(u => u.id === engineerId);
        if (!engineer) return;
        const savedPhotos = engineer.savedPhotos || [];
        if (savedPhotos.includes(photoVal)) {
          showToast("Photo requirement is already in directory.", "info");
          return;
        }
        const updatedPhotos = [...savedPhotos, photoVal];
        try {
          await updateUser(engineerId, { savedPhotos: updatedPhotos });
          engineer.savedPhotos = updatedPhotos;
          showToast("Photo requirement saved to directory!", "success");
          updatePhotoDirectoryUI(engineerId);
        } catch (err) {
          showToast(err.message, "error");
        }
      });
    }

    // 3. Dropdowns and Initialization Sync
    if (engineerSelect) {
      engineerSelect.addEventListener('change', () => {
        const engId = engineerSelect.value;
        updateTaskDirectoryUI(engId);
        updatePhotoDirectoryUI(engId);
      });
    }

    const initialEngineerId = isEngineerSelect ? '' : dragDataId;
    if (initialEngineerId) {
      updateTaskDirectoryUI(initialEngineerId);
      updatePhotoDirectoryUI(initialEngineerId);
    }

    // 4. Exact start time checkbox
    if (specTimeCheckbox && exactTimeContainer) {
      specTimeCheckbox.addEventListener('change', (e) => {
        exactTimeContainer.style.display = e.target.checked ? 'block' : 'none';
      });
    }

    // 5. Photo Checklist Actions
    const renderPhotoList = () => {
      if (!photoListContainer) return;
      photoListContainer.innerHTML = modalRequiredPhotos.map((req, idx) => `
        <div style="display: flex; align-items: center; justify-content: space-between; background-color: hsl(var(--bg-primary)); padding: 6px 12px; border-radius: 4px; border: 1px solid hsl(var(--border)/0.8); font-size: 0.8rem; margin-bottom: 4px;">
          <span style="font-weight: 600; color: hsl(var(--text-main));">${req}</span>
          <button type="button" class="btn-delete-photo-req" data-index="${idx}" style="background: none; border: none; color: hsl(var(--danger)); cursor: pointer; padding: 2px;"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      `).join('');

      photoListContainer.querySelectorAll('.btn-delete-photo-req').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const index = parseInt(btn.getAttribute('data-index'), 10);
          modalRequiredPhotos.splice(index, 1);
          renderPhotoList();
        });
      });
    };

    if (addPhotoBtn && photoInput && photoListContainer) {
      addPhotoBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const value = photoInput.value.trim();
        if (value) {
          modalRequiredPhotos.push(value);
          photoInput.value = '';
          renderPhotoList();
        }
      });

      photoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          addPhotoBtn.click();
        }
      });
    }
  }, 50);
}

export function destroy() {}
