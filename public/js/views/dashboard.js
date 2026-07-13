import { getCurrentUser } from '../auth.js';
import { getShifts, getSites, getUsers } from '../db.js';
import { formatDate, getLoadingSpinner, getLocalDateString } from '../utils.js';

let _clickOutsideHandler = null;

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();

  try {
    const [shifts, sites, users] = await Promise.all([
      getShifts(),
      getSites(),
      getUsers()
    ]);

    renderAdminDashboard(container, user, shifts, sites, users);
  } catch (err) {
    console.error("Dashboard error:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading dashboard: ${err.message}</p></div>`;
  }
}

function renderAdminDashboard(container, user, shifts, sites, users) {
  const todayStr = getLocalDateString();
  
  // Calculations
  const totalSites = sites.filter(s => s.status === 'active').length;
  const activeEngineers = users.filter(u => u.role === 'operative' && u.status === 'active').length;
  
  const todayShifts = shifts.filter(s => s.date === todayStr);
  const completedToday = todayShifts.filter(s => s.status === 'completed').length;
  
  // Calculate completion percentage overall
  const finishedShifts = shifts.filter(s => s.status === 'completed').length;
  const totalConcluded = shifts.filter(s => s.status === 'completed' || s.status === 'incomplete').length;
  const completionRate = totalConcluded > 0 ? Math.round((finishedShifts / totalConcluded) * 100) : 100;

  // Incomplete shifts list
  const incompleteShifts = shifts.filter(s => s.status === 'incomplete');
  
  // Today's shift status breakdown
  const pendingCount = todayShifts.filter(s => s.status === 'pending').length;
  const confirmedCount = todayShifts.filter(s => s.status === 'confirmed').length;
  const onsiteCount = todayShifts.filter(s => s.status === 'on site').length;
  const completedCount = todayShifts.filter(s => s.status === 'completed').length;
  const incompleteCount = todayShifts.filter(s => s.status === 'incomplete').length;
  const cancelledCount = todayShifts.filter(s => s.status === 'cancelled').length;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const isBannerDismissed = sessionStorage.getItem('pwa_install_banner_dismissed') === 'true';

  container.innerHTML = `
    ${(!isStandalone && !isBannerDismissed) ? `
      <!-- PWA Install Promotion Banner -->
      <div class="card" id="dashboard-install-banner" style="background: linear-gradient(135deg, hsl(var(--primary)/0.08) 0%, hsl(var(--accent)/0.08) 100%); border: 1px solid hsl(var(--primary)/0.2); padding: 18px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; border-left: 5px solid hsl(var(--primary));">
        <div style="display: flex; align-items: center; gap: 14px; min-width: 250px; flex: 1;">
          <div style="width: 46px; height: 46px; border-radius: 50%; background: hsl(var(--primary)); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1.3rem;">
            <i class="fa-solid fa-cloud-arrow-down"></i>
          </div>
          <div>
            <h4 style="font-weight: 800; font-size: 1rem; color: hsl(var(--primary)); margin: 0;">Install Workforce Dashboard App</h4>
            <p style="font-size: 0.82rem; color: hsl(var(--text-muted)); margin-top: 3px; line-height: 1.4;">Access the workforce system directly from your Home Screen or Dock. Launch instantly, work with offline support, and enjoy an immersive full-screen experience.</p>
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; margin-left: auto;">
          <button class="btn btn-primary" id="btn-install-dashboard-app" style="font-size: 0.8rem; padding: 10px 18px; font-weight: 700; white-space: nowrap; border-radius: var(--radius-sm);">
            <i class="fa-solid fa-download" style="margin-right: 4px;"></i> Install Now
          </button>
          <button class="btn btn-secondary" id="btn-dismiss-install-banner" style="font-size: 0.8rem; padding: 10px 14px; white-space: nowrap; border-radius: var(--radius-sm);">Maybe Later</button>
        </div>
      </div>
    ` : ''}

    <!-- Top Welcome Card -->
    <div class="card" style="background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%); color: white; border: none; padding: 24px; margin-bottom: 24px;">
      <h3 style="font-size: 1.6rem; font-weight: 700; margin-bottom: 6px;">Welcome Back, ${user.name}!</h3>
      <p style="opacity: 0.9; font-size: 0.95rem;">Workforce Planning Console. Manage labour allocations, site work, and verify completion evidence.</p>
    </div>

    <!-- Search Section -->
    <div class="card" style="padding: 16px; margin-bottom: 24px;">
      <div class="form-group" style="margin-bottom: 0; position: relative;">
        <label class="form-label" for="global-search" style="font-weight: 600; font-size: 0.85rem;"><i class="fa-solid fa-magnifying-glass"></i> Search Site Address, Engineer, Date (DD/MM/YYYY), or Task</label>
        <input class="form-input" type="text" id="global-search" placeholder="Type address, name, trade, task or date to search...">
        <div id="search-results-mount" style="position: absolute; top: 100%; left: 0; right: 0; background-color: hsl(var(--bg-card)); border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); z-index: 100; box-shadow: var(--shadow-lg); display: none; max-height: 250px; overflow-y: auto;"></div>
      </div>
    </div>

    <!-- KPIs Row -->
    <div class="kpi-grid" style="margin-bottom: 24px;">
      <div class="kpi-card" onclick="location.hash='#/sites'" style="cursor: pointer;">
        <span class="kpi-value">${totalSites}</span>
        <span class="kpi-label">Active Sites</span>
      </div>
      <div class="kpi-card" onclick="location.hash='#/engineers'" style="cursor: pointer;">
        <span class="kpi-value">${activeEngineers}</span>
        <span class="kpi-label">Active Engineers</span>
      </div>
      <div class="kpi-card" onclick="location.hash='#/planner'" style="cursor: pointer;">
        <span class="kpi-value">${todayShifts.length}</span>
        <span class="kpi-label">Shifts Scheduled Today</span>
      </div>
      <div class="kpi-card" onclick="location.hash='#/completions'" style="cursor: pointer;">
        <span class="kpi-value">${completionRate}%</span>
        <span class="kpi-label">Overall Completion Rate</span>
      </div>
    </div>

    <div class="dashboard-grid">
      <!-- Today's Schedule Overview -->
      <div class="card" style="grid-column: span 2;">
        <div class="card-title">
          <span>Today's Shift Allocations (${todayShifts.length})</span>
          <span style="font-size: 0.8rem; color: hsl(var(--text-muted)); font-weight: 400;">Date: ${formatDate(todayStr)}</span>
        </div>
        
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; font-size: 0.75rem;">
          <span class="status-badge status-pending">Pending: ${pendingCount}</span>
          <span class="status-badge status-confirmed">Confirmed: ${confirmedCount}</span>
          <span class="status-badge status-on-site">On Site: ${onsiteCount}</span>
          <span class="status-badge status-completed">Completed: ${completedCount}</span>
          <span class="status-badge status-incomplete">Incomplete: ${incompleteCount}</span>
          <span class="status-badge status-cancelled">Cancelled: ${cancelledCount}</span>
        </div>

        ${todayShifts.length > 0 ? `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Engineer</th>
                  <th>Site Address</th>
                  <th>Task / Shift Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${todayShifts.map(s => `
                  <tr>
                    <td>
                      <div style="font-weight: 600;">${s.userName}</div>
                    </td>
                    <td style="font-size: 0.85rem; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${s.siteAddress}">
                      ${s.siteAddress}
                    </td>
                    <td>
                      <div style="font-size: 0.85rem; font-weight: 500;">${s.task}</div>
                      <div style="font-size: 0.75rem; color: hsl(var(--text-muted));"><i class="fa-regular fa-clock"></i> Start: ${s.startTime || 'Not set'}</div>
                    </td>
                    <td>
                      <span class="status-badge status-${s.status.replace(' ', '-')}">${s.status}</span>
                    </td>
                    <td>
                      <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="location.hash='#/shift-detail?id=${s.id}'">
                        Manage
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="text-align: center; padding: 40px 0; color: hsl(var(--text-muted));">
            <i class="fa-regular fa-calendar-times fa-2x" style="margin-bottom: 12px; opacity: 0.5;"></i>
            <p style="font-size: 0.95rem;">No shifts scheduled for today.</p>
            <button class="btn btn-primary" onclick="location.hash='#/planner'" style="margin-top: 12px; padding: 6px 12px; font-size: 0.85rem;">
              Open Planner to Schedule
            </button>
          </div>
        `}
      </div>

      <!-- Outstanding Incomplete Items -->
      <div class="card" style="grid-column: span 1;">
        <div class="card-title" style="color: hsl(var(--danger));">Outstanding Incomplete Jobs</div>
        ${incompleteShifts.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 12px; max-height: 380px; overflow-y: auto;">
            ${incompleteShifts.map(s => `
              <div style="padding: 12px; border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); background-color: hsl(var(--bg-primary)/0.2); cursor: pointer;" onclick="location.hash='#/shift-detail?id=${s.id}'">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
                  <span style="font-weight: 700; font-size: 0.85rem; color: hsl(var(--text-main));">${s.userName}</span>
                  <span style="font-size: 0.75rem; color: hsl(var(--text-muted));">${s.date}</span>
                </div>
                <p style="font-size: 0.8rem; color: hsl(var(--text-muted)); font-weight: 500;"><i class="fa-solid fa-location-dot"></i> ${s.siteAddress}</p>
                <div style="margin-top: 6px; padding: 6px; background-color: hsl(var(--danger)/0.05); border-left: 3px solid hsl(var(--danger)); border-radius: 2px;">
                  <span style="font-size: 0.7rem; font-weight: 700; color: hsl(var(--danger)); display: block; text-transform: uppercase;">Reason:</span>
                  <span style="font-size: 0.75rem; color: hsl(var(--text-main));">${s.incompleteReason || 'No reason specified.'}</span>
                </div>
                ${s.incompletePhotos && s.incompletePhotos.length > 0 ? `
                  <div style="margin-top: 8px; display: flex; gap: 4px;">
                    ${s.incompletePhotos.map(p => `<img src="${p}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover; border: 1px solid hsl(var(--border));">`).join('')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align: center; padding: 40px 0; color: hsl(var(--text-muted));">
            <i class="fa-regular fa-check-circle fa-2x" style="margin-bottom: 12px; color: hsl(var(--success)); opacity: 0.6;"></i>
            <p style="font-size: 0.9rem;">No outstanding incomplete jobs. All clean!</p>
          </div>
        `}
      </div>
    </div>
  `;

  // Search execution
  const searchInput = document.getElementById('global-search');
  const resultsDiv = document.getElementById('search-results-mount');

  // PWA Install Promotion Events
  const installBanner = document.getElementById('dashboard-install-banner');
  const installBtn = document.getElementById('btn-install-dashboard-app');
  const dismissBtn = document.getElementById('btn-dismiss-install-banner');

  if (installBtn) {
    installBtn.addEventListener('click', () => {
      if (window.triggerInstallPrompt) {
        window.triggerInstallPrompt();
      }
    });
  }

  if (dismissBtn && installBanner) {
    dismissBtn.addEventListener('click', () => {
      installBanner.style.display = 'none';
      sessionStorage.setItem('pwa_install_banner_dismissed', 'true');
    });
  }

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (!val) {
      resultsDiv.style.display = 'none';
      resultsDiv.innerHTML = '';
      return;
    }

    let searchVal = val;
    // Handle UK date format DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
    const ukDateRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/;
    const match = val.match(ukDateRegex);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      searchVal = `${year}-${month}-${day}`;
    } else {
      // Handle UK short date format DD/MM/YY, DD-MM-YY, DD.MM.YY
      const ukShortDateRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/;
      const matchShort = val.match(ukShortDateRegex);
      if (matchShort) {
        const day = matchShort[1].padStart(2, '0');
        const month = matchShort[2].padStart(2, '0');
        const year = '20' + matchShort[3];
        searchVal = `${year}-${month}-${day}`;
      }
    }

    const matches = [];

    // Search sites
    sites.forEach(site => {
      if (site.address.toLowerCase().includes(val) || site.client.toLowerCase().includes(val)) {
        matches.push({
          type: 'site',
          title: site.address,
          subtitle: `Client: ${site.client}`,
          hash: `#/site-detail?id=${site.id}`
        });
      }
    });

    // Search engineers
    users.filter(u => u.role === 'operative').forEach(eng => {
      if (eng.name.toLowerCase().includes(val) || (eng.trade && eng.trade.toLowerCase().includes(val))) {
        matches.push({
          type: 'engineer',
          title: eng.name,
          subtitle: `Trade: ${eng.trade || 'General operative'}`,
          hash: `#/engineers`
        });
      }
    });

    // Search shifts/tasks
    shifts.forEach(shift => {
      if (
        shift.task.toLowerCase().includes(val) || 
        shift.userName.toLowerCase().includes(val) ||
        shift.siteAddress.toLowerCase().includes(val) ||
        shift.date.includes(searchVal)
      ) {
        matches.push({
          type: 'shift',
          title: `${shift.userName} @ ${shift.siteAddress}`,
          subtitle: `${formatDate(shift.date)} | Task: ${shift.task} (${shift.status})`,
          hash: `#/shift-detail?id=${shift.id}`
        });
      }
    });

    if (matches.length > 0) {
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = matches.slice(0, 10).map(m => `
        <div style="padding: 10px 14px; border-bottom: 1px solid hsl(var(--border)/0.5); cursor: pointer;" onclick="location.hash='${m.hash}'; document.getElementById('search-results-mount').style.display='none';">
          <div style="font-weight: 600; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
            <span>${m.title}</span>
            <span class="badge badge-info" style="font-size: 0.65rem; text-transform: uppercase;">${m.type}</span>
          </div>
          <div style="font-size: 0.75rem; color: hsl(var(--text-muted)); margin-top: 2px;">${m.subtitle}</div>
        </div>
      `).join('');
    } else {
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = `<div style="padding: 12px; text-align: center; font-size: 0.85rem; color: hsl(var(--text-muted));">No matches found.</div>`;
    }
  });

  // Close search results clicking outside
  _clickOutsideHandler = (e) => {
    const resultsDiv2 = document.getElementById('search-results-mount');
    if (!resultsDiv2) return;
    if (e.target !== searchInput && !resultsDiv2.contains(e.target)) {
      resultsDiv2.style.display = 'none';
    }
  };
  document.addEventListener('click', _clickOutsideHandler);
}

export function destroy() {
  if (_clickOutsideHandler) {
    document.removeEventListener('click', _clickOutsideHandler);
    _clickOutsideHandler = null;
  }
}
