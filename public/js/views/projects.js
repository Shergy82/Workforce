import { getCurrentUser, isManager } from '../auth.js';
import { getProjects, createProject, updateProject, getUsers, getTasks } from '../db.js';
import { formatDate, getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';
import { uploadFile } from '../storage.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderProjectsView(container, user);
}

async function renderProjectsView(container, user) {
  try {
    const [projects, users, tasks] = await Promise.all([
      getProjects(),
      getUsers(),
      getTasks()
    ]);

    // Operatives only see projects they are assigned to
    const visibleProjects = isManager() 
      ? projects 
      : projects.filter(p => p.assignedStaff && p.assignedStaff.includes(user.id));

    let headerHTML = '';
    if (isManager()) {
      headerHTML = `
        <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
          <button class="btn btn-primary" id="btn-new-project"><i class="fa-solid fa-plus"></i> New Project Site</button>
        </div>
      `;
    }

    container.innerHTML = `
      ${headerHTML}
      <div class="dashboard-grid">
        ${visibleProjects.length > 0 ? visibleProjects.map(proj => {
          const siteTasks = tasks.filter(t => t.projectId === proj.id);
          const doneTasks = siteTasks.filter(t => t.status === 'approved').length;
          const percent = siteTasks.length > 0 ? Math.round((doneTasks / siteTasks.length) * 100) : 0;

          return `
            <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
                  <h3 style="font-weight:700; font-size:1.1rem; color:hsl(var(--primary));">${proj.name}</h3>
                  <span class="badge ${proj.status === 'active' ? 'badge-success' : 'badge-warning'}">${proj.status}</span>
                </div>
                <p style="font-size:0.8rem; color:hsl(var(--text-muted)); font-weight:600; margin-bottom:6px;">Client: ${proj.client}</p>
                <p style="font-size:0.85rem; color:hsl(var(--text-muted)); margin-bottom:12px;">${proj.description}</p>
                
                <div style="font-size:0.8rem; display:flex; flex-direction:column; gap:6px; border-top:1px solid hsl(var(--border)/0.5); padding-top:10px;">
                  <p><i class="fa-solid fa-location-dot" style="margin-right:6px;"></i> ${proj.address}</p>
                  <p><i class="fa-regular fa-calendar" style="margin-right:6px;"></i> ${formatDate(proj.startDate)} - ${formatDate(proj.endDate)}</p>
                </div>

                <!-- Progress Bar -->
                <div style="margin-top:14px;">
                  <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:600; margin-bottom:4px;">
                    <span>Site Task Progress</span>
                    <span>${percent}%</span>
                  </div>
                  <div style="background-color:hsl(var(--border)); border-radius:4px; height:6px; overflow:hidden;">
                    <div style="background-color:hsl(var(--success)); height:100%; width:${percent}%;"></div>
                  </div>
                </div>
              </div>

              <div style="margin-top:20px; display:flex; gap:8px;">
                <button class="btn btn-secondary" style="flex:1; font-size:0.8rem; padding:8px;" data-action="view-details" data-proj-id="${proj.id}">
                  <i class="fa-solid fa-circle-info"></i> Project Details
                </button>
                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(proj.address)}" target="_blank" class="btn btn-secondary" style="font-size:0.8rem; padding:8px;">
                  <i class="fa-solid fa-location-arrow"></i> Map
                </a>
              </div>
            </div>
          `;
        }).join('') : `
          <div class="card" style="grid-column:span 3; text-align:center; padding:40px;">
            <i class="fa-solid fa-helmet-safety fa-3x" style="margin-bottom:16px; opacity:0.4;"></i>
            <p>No active project sites assigned.</p>
          </div>
        `}
      </div>
    `;

    setupProjectEvents(user, visibleProjects, users, tasks);

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error loading projects.</p>`;
  }
}

function setupProjectEvents(user, projects, users, tasks) {
  const newBtn = document.getElementById('btn-new-project');
  if (newBtn) {
    newBtn.addEventListener('click', () => showNewProjectModal(users));
  }

  document.querySelectorAll('button[data-action="view-details"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const projId = btn.getAttribute('data-proj-id');
      const proj = projects.find(p => p.id === projId);
      if (proj) {
        showProjectDetailsModal(proj, users, tasks);
      }
    });
  });
}

function showNewProjectModal(users) {
  const operatives = users.filter(u => u.role === 'operative');
  
  showModal({
    title: 'Initialize New Project Site',
    bodyHTML: `
      <form id="modal-project-form">
        <div class="form-group">
          <label class="form-label" for="proj-name">Project / Site Name</label>
          <input class="form-input" type="text" id="proj-name" required placeholder="e.g. Heathrow Terminal 2 Upgrades">
        </div>
        <div class="form-group">
          <label class="form-label" for="proj-client">Client Name</label>
          <input class="form-input" type="text" id="proj-client" required placeholder="e.g. BAA Infrastructure">
        </div>
        <div class="form-group">
          <label class="form-label" for="proj-desc">Description</label>
          <textarea class="form-input" id="proj-desc" rows="2" required placeholder="Project overview..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="proj-address">Site Address</label>
          <input class="form-input" type="text" id="proj-address" required placeholder="Full physical address">
        </div>
        <div style="display:flex; gap:10px;">
          <div class="form-group" style="flex:1;">
            <label class="form-label" for="proj-start">Start Date</label>
            <input class="form-input" type="date" id="proj-start" required value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label" for="proj-end">End Date</label>
            <input class="form-input" type="date" id="proj-end" required value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <div class="form-group" style="flex:2;">
            <label class="form-label" for="proj-geofence">Geofence Radius (meters)</label>
            <input class="form-input" type="number" id="proj-geofence" required value="200">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label" for="proj-status">Status</label>
            <select class="form-input" id="proj-status">
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Assign Staff Members</label>
          <div style="max-height:120px; overflow-y:auto; border:1px solid hsl(var(--border)); padding:8px; border-radius:var(--radius-sm);" id="assign-staff-list">
            ${operatives.map(o => `
              <label style="display:flex; align-items:center; gap:8px; padding:3px 0; cursor:pointer;">
                <input type="checkbox" class="proj-staff-chk" value="${o.id}"> ${o.name}
              </label>
            `).join('')}
          </div>
        </div>
      </form>
    `,
    confirmText: 'Create Project',
    onConfirm: async (body) => {
      const name = body.querySelector('#proj-name').value;
      const client = body.querySelector('#proj-client').value;
      const description = body.querySelector('#proj-desc').value;
      const address = body.querySelector('#proj-address').value;
      const startDate = body.querySelector('#proj-start').value;
      const endDate = body.querySelector('#proj-end').value;
      const radius = parseFloat(body.querySelector('#proj-geofence').value);
      const status = body.querySelector('#proj-status').value;
      
      const assignedStaff = Array.from(body.querySelectorAll('.proj-staff-chk:checked')).map(chk => chk.value);

      // We resolve lat/lng via quick lookup coordinates or mock coords
      // Since geocoding requires paid Maps APIs, we populate coordinates with a standard local coordinate center (e.g. Central London: 51.5074, -0.1278) which the user can easily self-coordinate if needed.
      const geofence = { lat: 51.5074, lng: -0.1278, radius };

      try {
        await createProject({
          name, client, description, address, startDate, endDate, status, assignedStaff, geofence
        });

        showToast("Project site configured successfully!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}

function showProjectDetailsModal(proj, users, tasks) {
  const staffNames = (proj.assignedStaff || []).map(sId => {
    const u = users.find(userObj => userObj.id === sId);
    return u ? u.name : 'Unknown';
  }).join(', ');

  const siteTasks = tasks.filter(t => t.projectId === proj.id);

  // Render recent activity logs (max 5)
  const activityLogsHTML = (proj.activityLog || []).slice(-5).map(log => `
    <div style="font-size:0.8rem; border-left:2px solid hsl(var(--primary)); padding-left:8px; margin-bottom:8px;">
      <span style="color:hsl(var(--text-muted));">${formatDate(log.date)}</span>
      <p style="font-weight:500;">${log.message}</p>
    </div>
  `).join('');

  showModal({
    title: proj.name,
    confirmText: 'Close',
    showFooter: true,
    onConfirm: () => hideModal(),
    bodyHTML: `
      <div style="font-size:0.9rem; display:flex; flex-direction:column; gap:12px;">
        <p><strong>Client:</strong> ${proj.client}</p>
        <p><strong>Site Address:</strong> ${proj.address}</p>
        <p><strong>Leave/Activity geofence boundary:</strong> Radius ${proj.geofence?.radius || 200}m</p>
        <p><strong>Assigned Workers:</strong> ${staffNames || 'None scheduled'}</p>
        
        <div style="border-top:1px solid hsl(var(--border)/0.5); padding-top:14px;">
          <h4 style="margin-bottom:8px; font-size:0.95rem;">Site-Specific Checklists & Tasks</h4>
          ${siteTasks.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${siteTasks.map(t => `
                <div style="font-size:0.85rem; padding:6px; border:1px solid hsl(var(--border)/0.5); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
                  <span>${t.title}</span>
                  <span class="badge ${t.status === 'approved' ? 'badge-success' : 'badge-warning'}">${t.status}</span>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color:hsl(var(--text-muted)); font-size:0.8rem;">No checklists or tasks active at this site.</p>'}
        </div>

        <div style="border-top:1px solid hsl(var(--border)/0.5); padding-top:14px; margin-top:6px;">
          <h4 style="margin-bottom:8px; font-size:0.95rem;">Site Activity Log</h4>
          ${activityLogsHTML || '<p style="color:hsl(var(--text-muted)); font-size:0.8rem;">No activity log details available.</p>'}
        </div>
      </div>
    `
  });
}
export function destroy() {}
