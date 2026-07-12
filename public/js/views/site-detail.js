import { getCurrentUser, isManager } from '../auth.js';
import { getSites, updateSite, getShifts, getUsers, deleteSite } from '../db.js';
import { formatDate, getLoadingSpinner, getLocalDateString, viewFile, downloadFile } from '../utils.js';
import { showToast } from '../components/toast.js';
import { uploadFile } from '../storage.js';
import { showModal, hideModal } from '../components/modal.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const siteId = urlParams.get('id');

  if (!siteId) {
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error: Site ID is missing.</p></div>`;
    return;
  }

  container.innerHTML = getLoadingSpinner();
  await renderSiteDetails(container, user, siteId);
}

async function renderSiteDetails(container, user, siteId) {
  try {
    const [sites, shifts, users] = await Promise.all([
      getSites(),
      getShifts(),
      getUsers()
    ]);

    const site = sites.find(s => s.id === siteId);
    if (!site) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px;">
          <i class="fa-solid fa-triangle-exclamation fa-3x" style="color:hsl(var(--danger)); margin-bottom:16px;"></i>
          <h3>Site Record Not Found</h3>
          <button class="btn btn-primary" onclick="location.hash='#/sites'" style="margin-top:16px;">Back to Sites Directory</button>
        </div>
      `;
      return;
    }

    // Filter shifts for this site
    const siteShifts = shifts.filter(s => s.siteId === site.id);
    
    // Sub-segment shifts
    const todayStr = getLocalDateString();
    
    // Weekly planned work (upcoming or today)
    const plannedShifts = siteShifts.filter(s => s.date >= todayStr && s.status !== 'cancelled');
    
    // Completed work history
    const completedShifts = siteShifts.filter(s => s.status === 'completed');
    
    // Outstanding / Incomplete shifts
    const outstandingIncomplete = siteShifts.filter(s => s.status === 'incomplete');

    // Get list of unique assigned engineers
    const activeEngineers = [...new Set(siteShifts.filter(s => s.status !== 'cancelled').map(s => s.userName))];

    container.innerHTML = `
      <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <button class="btn btn-secondary" onclick="location.hash='#/sites'">
          <i class="fa-solid fa-arrow-left"></i> Back to Directory
        </button>
        <div style="display: flex; gap: 8px;">
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}" target="_blank" class="btn btn-secondary">
            <i class="fa-solid fa-map-location-dot"></i> View on Map
          </a>
          ${isManager() ? `
            <button class="btn btn-secondary" id="btn-edit-site-details"><i class="fa-solid fa-pen-to-square"></i> Edit Details</button>
            <button class="btn btn-secondary" id="btn-toggle-site-status" style="padding: 8px 16px;">
              Mark as ${site.status === 'active' ? 'Inactive' : 'Active'}
            </button>
            <button class="btn btn-danger" id="btn-delete-site" style="padding: 8px 16px;">
              <i class="fa-solid fa-trash-can"></i> Delete Site
            </button>
          ` : ''}
        </div>
      </div>

      <div class="dashboard-grid" style="align-items: start;">
        <!-- Left Column: Site Info & Central Documentation Record -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          
          <!-- General Site Card -->
          <div class="card" style="margin-bottom: 0;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
              <span class="badge badge-info" style="font-size: 0.8rem;">Central Site Record</span>
              <span class="badge ${site.status === 'active' ? 'badge-success' : 'badge-danger'}">${site.status}</span>
            </div>
            
            <!-- Big prominent E-Number -->
            <h2 style="font-weight: 800; font-size: 1.7rem; color: hsl(var(--primary)); margin-bottom: 4px; letter-spacing: -0.025em;">
              ${site.eNumber || 'No E-Number'}
            </h2>
            <h4 style="font-weight: 700; font-size: 1.2rem; color: hsl(var(--text-main)); margin-bottom: 6px;">${site.address}</h4>
            <p style="font-weight: 600; font-size: 0.95rem; color: hsl(var(--text-muted)); margin-bottom: 12px;">
              Scheme: ${site.scheme || site.client || 'General'}
            </p>
            
            <!-- Site Specific Overrides List -->
            ${(site.managerIds && site.managerIds.length > 0) || (site.relevantPeopleIds && site.relevantPeopleIds.length > 0) ? `
              <div style="margin-top: 12px; padding: 10px; background-color: hsl(var(--bg-primary)/0.2); border-radius: var(--radius-sm); border: 1px solid hsl(var(--border)/0.5); margin-bottom: 16px;">
                <span style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: hsl(var(--text-muted)); display: block; margin-bottom: 6px;">Site-Specific Overrides</span>
                ${site.managerIds && site.managerIds.length > 0 ? `
                  <div style="font-size: 0.85rem; margin-bottom: 4px; color: hsl(var(--text-main));">
                    <strong>Managers:</strong> ${site.managerIds.map(id => users.find(u => u.id === id)?.name || 'Unknown').join(', ')}
                  </div>
                ` : ''}
                ${site.relevantPeopleIds && site.relevantPeopleIds.length > 0 ? `
                  <div style="font-size: 0.85rem; color: hsl(var(--text-main));">
                    <strong>Relevant People:</strong> ${site.relevantPeopleIds.map(id => users.find(u => u.id === id)?.name || 'Unknown').join(', ')}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <p style="font-size: 0.9rem; margin-bottom: 16px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 12px; line-height: 1.5; color: hsl(var(--text-main));">
              <strong>Job Description:</strong><br>${site.description || 'No description entered.'}
            </p>
            <div>
              <strong style="font-size: 0.85rem; text-transform: uppercase; color: hsl(var(--text-muted)); display: block; margin-bottom: 4px;">Operational Notes:</strong>
              <p style="font-size: 0.85rem; font-style: italic; background-color: hsl(var(--bg-primary)/0.5); padding: 8px; border-radius: var(--radius-sm); border-left: 3px solid hsl(var(--warning)); color: hsl(var(--text-main));">
                ${site.notes || 'No operational instructions specified.'}
              </p>
            </div>
          </div>

          <!-- Document Upload area -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">
              <span>Drawings, Specs & RAMS</span>
              ${isManager() ? `
                <button class="btn btn-secondary" id="btn-upload-doc" style="font-size:0.75rem; padding: 4px 8px;">
                  <i class="fa-solid fa-file-upload"></i> Upload File
                </button>
              ` : ''}
              <input type="file" id="doc-file-input" style="display: none;" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,image/*">
            </div>

            <div id="site-docs-list" style="display: flex; flex-direction: column; gap: 8px;">
              ${site.files && site.files.length > 0 ? site.files.map((f, idx) => `
                <div style="padding: 10px; border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; background-color: hsl(var(--bg-primary)/0.2);">
                  <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                    <i class="fa-solid ${f.type.includes('pdf') ? 'fa-file-pdf text-red-500' : f.type.includes('image') ? 'fa-file-image text-blue-500' : 'fa-file-lines'} fa-lg"></i>
                    <div style="min-width: 0;">
                      <a href="#" class="btn-site-file-view" data-url="${f.url}" data-name="${f.name}" style="font-size: 0.85rem; font-weight: 600; text-decoration: underline; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${f.name}</a>
                      <span style="font-size: 0.7rem; color: hsl(var(--text-muted));">Uploaded by ${f.uploadedBy || 'Admin'} on ${f.date}</span>
                    </div>
                  </div>
                  ${isManager() ? `
                    <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.7rem;" data-action="delete-file" data-idx="${idx}">
                      <i class="fa-regular fa-trash-can"></i>
                    </button>
                  ` : ''}
                </div>
              `).join('') : `<p style="color: hsl(var(--text-muted)); font-size: 0.85rem; font-style: italic; text-align: center;">No documents uploaded yet.</p>`}
            </div>
          </div>

          <!-- Site Photo Gallery -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">
              <span>Site Image Gallery</span>
              <button class="btn btn-secondary" id="btn-upload-photo" style="font-size:0.75rem; padding: 4px 8px;">
                <i class="fa-solid fa-camera"></i> Upload Photo
              </button>
              <input type="file" id="photo-file-input" style="display: none;" accept="image/*">
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 8px;">
              ${site.photos && site.photos.length > 0 ? site.photos.map((p, idx) => `
                <div style="position: relative; aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid hsl(var(--border));">
                  <img src="${p.url}" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="window.open('${p.url}')">
                  ${isManager() ? `
                    <button style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; cursor: pointer;" data-action="delete-photo" data-idx="${idx}">&times;</button>
                  ` : ''}
                </div>
              `).join('') : `<div style="grid-column: span 4; text-align: center; color: hsl(var(--text-muted)); font-size: 0.85rem; font-style: italic; padding: 10px 0;">No photos uploaded.</div>`}
            </div>
          </div>

        </div>

        <!-- Right Column: Labour Allocations, Weekly Plan, Completed Logs, Incomplete Issues -->
        <div style="display: flex; flex-direction: column; gap: 24px; grid-column: span 2;">
          
          <!-- Assigned Team Badge list -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">Allocated Engineers</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${activeEngineers.length > 0 ? activeEngineers.map(name => `
                <span class="badge badge-info" style="font-size: 0.8rem; font-weight: 500;"><i class="fa-solid fa-helmet-safety"></i> ${name}</span>
              `).join('') : `<p style="color: hsl(var(--text-muted)); font-size: 0.85rem; font-style: italic;">No engineers assigned to active shifts.</p>`}
            </div>
          </div>

          <!-- Weekly Schedule Planned Work -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">Planned Work & Shifts This Week</div>
            ${plannedShifts.length > 0 ? `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${plannedShifts.map(s => `
                  <div style="padding: 12px; border: 1px solid hsl(var(--border)); border-left: 4px solid hsl(var(--primary)); border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; cursor: pointer; background-color: hsl(var(--bg-primary)/0.2);" onclick="location.hash='#/shift-detail?id=${s.id}'">
                    <div>
                      <div style="font-weight: 700; font-size: 0.9rem; color: hsl(var(--primary));">${s.userName}</div>
                      <div style="font-size: 0.85rem; font-weight: 500; margin-top: 2px;">Task: ${s.task}</div>
                      <div style="font-size: 0.75rem; color: hsl(var(--text-muted)); margin-top: 4px;"><i class="fa-regular fa-calendar"></i> ${formatDate(s.date)} | <i class="fa-regular fa-clock"></i> Start: ${s.startTime || 'Not set'}</div>
                    </div>
                    <span class="status-badge status-${s.status.replace(' ', '-')}">${s.status}</span>
                  </div>
                `).join('')}
              </div>
            ` : `<p style="color: hsl(var(--text-muted)); font-size: 0.85rem; font-style: italic; text-align: center; padding: 15px 0;">No planned shifts scheduled.</p>`}
          </div>

          <!-- Outstanding / Incomplete Items -->
          <div class="card" style="margin-bottom: 0; border-left: 4px solid hsl(var(--danger));">
            <div class="card-title" style="color: hsl(var(--danger));">Outstanding / Incomplete Tasks</div>
            ${outstandingIncomplete.length > 0 ? `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${outstandingIncomplete.map(s => `
                  <div style="padding: 12px; border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 8px; background-color: hsl(var(--danger)/0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                      <div>
                        <span style="font-weight: 700; font-size: 0.9rem; color: hsl(var(--text-main));">${s.userName}</span>
                        <div style="font-size: 0.75rem; color: hsl(var(--text-muted));">${formatDate(s.date)}</div>
                      </div>
                      <span class="status-badge status-incomplete">INCOMPLETE</span>
                    </div>
                    <div style="font-size: 0.85rem;"><strong>Task:</strong> ${s.task}</div>
                    <div style="padding: 8px; background-color: hsl(var(--danger)/0.05); border-left: 3px solid hsl(var(--danger)); border-radius: 2px;">
                      <span style="font-size: 0.75rem; font-weight: 700; color: hsl(var(--danger)); display: block; margin-bottom: 2px;">Reason / Barrier:</span>
                      <span style="font-size: 0.85rem; color: hsl(var(--text-main));">${s.incompleteReason || 'No reason provided.'}</span>
                    </div>
                    ${s.incompletePhotos && s.incompletePhotos.length > 0 ? `
                      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${s.incompletePhotos.map(url => `
                          <img src="${url}" style="width: 50px; height: 50px; border-radius: 4px; object-fit: cover; cursor: pointer; border: 1px solid hsl(var(--border));" onclick="window.open('${url}')">
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            ` : `<p style="color: hsl(var(--text-muted)); font-size: 0.85rem; font-style: italic; text-align: center; padding: 15px 0;">No outstanding incomplete items. All completed work has been logged.</p>`}
          </div>

          <!-- Historical Work Completed -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">Completed Work History</div>
            ${completedShifts.length > 0 ? `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${completedShifts.map(s => `
                  <div style="padding: 12px; border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 6px; background-color: hsl(var(--success)/0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                      <div>
                        <span style="font-weight: 700; font-size: 0.9rem; color: hsl(var(--text-main));">${s.userName}</span>
                        <div style="font-size: 0.75rem; color: hsl(var(--text-muted));">${formatDate(s.date)}</div>
                      </div>
                      <span class="status-badge status-completed">COMPLETED</span>
                    </div>
                    <div style="font-size: 0.85rem;"><strong>Task:</strong> ${s.task}</div>
                    ${s.completionNotes ? `
                      <p style="font-size: 0.8rem; color: hsl(var(--text-muted)); font-style: italic; background-color: hsl(var(--bg-primary)/0.4); padding: 6px; border-radius: var(--radius-sm);">
                        Notes: ${s.completionNotes}
                      </p>
                    ` : ''}
                    ${s.completionPhotos && s.completionPhotos.length > 0 ? `
                      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
                        ${s.completionPhotos.map((url, idx) => {
                          const label = (s.requiredPhotos && s.requiredPhotos[idx]) ? s.requiredPhotos[idx] : 'Completion Photo';
                          return `
                            <div style="display: inline-flex; flex-direction: column; align-items: center; gap: 3px; max-width: 75px; text-align: center;">
                              <img src="${url}" style="width: 50px; height: 50px; border-radius: 4px; object-fit: cover; cursor: pointer; border: 1px solid hsl(var(--border));" onclick="window.open('${url}')">
                              <span style="font-size: 0.58rem; color: hsl(var(--text-muted)); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;" title="${label}">${label}</span>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            ` : `<p style="color: hsl(var(--text-muted)); font-size: 0.85rem; font-style: italic; text-align: center; padding: 15px 0;">No completed history available.</p>`}
          </div>

        </div>
      </div>
    `;

    setupSiteDetailEvents(container, site, user, users);
  } catch (err) {
    console.error("Error loading site details:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading site record: ${err.message}</p></div>`;
  }
}

function setupSiteDetailEvents(container, site, user, allUsers) {
  // Toggle Active/Inactive status
  const statusBtn = document.getElementById('btn-toggle-site-status');
  if (statusBtn) {
    statusBtn.addEventListener('click', async () => {
      const nextStatus = site.status === 'active' ? 'inactive' : 'active';
      showModal({
        title: `Mark Site as ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`,
        bodyHTML: `<p>Are you sure you want to mark <strong>${site.address}</strong> as <strong>${nextStatus.toUpperCase()}</strong>?</p>`,
        confirmText: `Yes, Mark ${nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}`,
        onConfirm: async () => {
          try {
            await updateSite(site.id, { status: nextStatus });
            showToast(`Site status changed to ${nextStatus}.`, "success");
            hideModal();
            renderSiteDetails(container, user, site.id);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  }

  const deleteSiteBtn = document.getElementById('btn-delete-site');
  if (deleteSiteBtn) {
    deleteSiteBtn.addEventListener('click', async () => {
      showModal({
        title: 'Delete Site',
        bodyHTML: `<p>Are you sure you want to permanently delete <strong>${site.address}</strong>?<br><br><small style="color:hsl(var(--text-muted));">Historical shifts will not be deleted.</small></p>`,
        confirmText: 'Yes, Delete Site',
        onConfirm: async () => {
          try {
            await deleteSite(site.id);
            showToast("Site address deleted successfully.", "success");
            hideModal();
            location.hash = '#/sites';
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  }

  // Edit Site Details
  const editDetailsBtn = document.getElementById('btn-edit-site-details');
  if (editDetailsBtn) {
    const managers = allUsers.filter(u => u.role === 'admin' || u.role === 'manager' || u.role === 'owner');
    const relevantPeople = allUsers.filter(u => u.role === 'operative' || u.role === 'supervisor');

    editDetailsBtn.addEventListener('click', () => {
      showModal({
        title: 'Edit Site Details',
        bodyHTML: `
          <form id="edit-site-form">
            <div class="form-group">
              <label class="form-label" for="edit-site-enum">E Number (Reference)</label>
              <input class="form-input" type="text" id="edit-site-enum" value="${site.eNumber || ''}" required placeholder="e.g. E12345">
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-site-address">Site Address</label>
              <input class="form-input" type="text" id="edit-site-address" value="${site.address || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-site-scheme">Scheme</label>
              <input class="form-input" type="text" id="edit-site-scheme" value="${site.scheme || site.client || ''}" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-site-desc">Job Description</label>
              <textarea class="form-input" id="edit-site-desc" rows="3" required>${site.description || ''}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-site-notes">Operational Notes</label>
              <textarea class="form-input" id="edit-site-notes" rows="2">${site.notes || ''}</textarea>
            </div>
            
            <div class="form-group">
              <label class="form-label">Specific Site Managers (Optional Override)</label>
              <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${managers.map(m => {
                  const checked = site.managerIds && site.managerIds.includes(m.id) ? 'checked' : '';
                  return `
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                      <input type="checkbox" name="edit-site-managers" value="${m.id}" ${checked}>
                      <span>${m.name} (${m.role})</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Specific Relevant People (Optional Override)</label>
              <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${relevantPeople.map(p => {
                  const checked = site.relevantPeopleIds && site.relevantPeopleIds.includes(p.id) ? 'checked' : '';
                  return `
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                      <input type="checkbox" name="edit-site-relevant" value="${p.id}" ${checked}>
                      <span>${p.name} (${p.trade || p.role})</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          </form>
        `,
        confirmText: 'Save Changes',
        onConfirm: async (body) => {
          const eNumber = body.querySelector('#edit-site-enum').value.trim();
          const address = body.querySelector('#edit-site-address').value.trim();
          const scheme = body.querySelector('#edit-site-scheme').value.trim();
          const description = body.querySelector('#edit-site-desc').value.trim();
          const notes = body.querySelector('#edit-site-notes').value.trim();

          const selectedManagers = Array.from(body.querySelectorAll('input[name="edit-site-managers"]:checked')).map(el => el.value);
          const selectedRelevant = Array.from(body.querySelectorAll('input[name="edit-site-relevant"]:checked')).map(el => el.value);

          if (!eNumber || !address || !scheme) {
            showToast("E Number, Address, and Scheme are required.", "error");
            return;
          }

          try {
            await updateSite(site.id, {
              eNumber, address, scheme, client: scheme, description, notes,
              managerIds: selectedManagers,
              relevantPeopleIds: selectedRelevant
            });
            showToast("Site record updated successfully!", "success");
            hideModal();
            renderSiteDetails(container, user, site.id);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  }

  // Document/Photo Upload and Deletion
  const uploadDocBtn = document.getElementById('btn-upload-doc');
  const docInput = document.getElementById('doc-file-input');

  if (uploadDocBtn && docInput) {
    uploadDocBtn.addEventListener('click', () => docInput.click());

    docInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      uploadDocBtn.disabled = true;
      uploadDocBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading...`;

      try {
        const fileUrl = await uploadFile(`sites/${site.id}/docs`, file);
        
        const updatedFiles = site.files ? [...site.files] : [];
        updatedFiles.push({
          name: file.name,
          url: fileUrl,
          type: file.type,
          uploadedBy: user.name,
          date: getLocalDateString()
        });

        await updateSite(site.id, { files: updatedFiles });
        showToast(`Document "${file.name}" uploaded successfully!`, "success");
        renderSiteDetails(container, user, site.id);
      } catch (err) {
        showToast(err.message, "error");
        uploadDocBtn.disabled = false;
        uploadDocBtn.innerHTML = `<i class="fa-solid fa-file-upload"></i> Upload File`;
      }
    });
  }

  const uploadPhotoBtn = document.getElementById('btn-upload-photo');
  const photoInput = document.getElementById('photo-file-input');

  if (uploadPhotoBtn && photoInput) {
    uploadPhotoBtn.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      uploadPhotoBtn.disabled = true;
      uploadPhotoBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading...`;

      try {
        const fileUrl = await uploadFile(`sites/${site.id}/photos`, file);
        
        const updatedPhotos = site.photos ? [...site.photos] : [];
        updatedPhotos.push({
          url: fileUrl,
          uploadedBy: user.name,
          date: getLocalDateString()
        });

        await updateSite(site.id, { photos: updatedPhotos });
        showToast(`Photo uploaded to gallery.`, "success");
        renderSiteDetails(container, user, site.id);
      } catch (err) {
        showToast(err.message, "error");
        uploadPhotoBtn.disabled = false;
        uploadPhotoBtn.innerHTML = `<i class="fa-solid fa-camera"></i> Upload Photo`;
      }
    });
  }

  container.querySelectorAll('.btn-site-file-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = btn.getAttribute('data-url');
      const name = btn.getAttribute('data-name');
      viewFile(url, name);
    });
  });

  container.addEventListener('click', async (e) => {
    const deleteFileBtn = e.target.closest('button[data-action="delete-file"]');
    if (deleteFileBtn) {
      const idx = parseInt(deleteFileBtn.getAttribute('data-idx'));
      if (confirm("Are you sure you want to delete this document?")) {
        const updatedFiles = [...site.files];
        updatedFiles.splice(idx, 1);
        await updateSite(site.id, { files: updatedFiles });
        showToast("Document deleted.", "success");
        renderSiteDetails(container, user, site.id);
      }
    }

    const deletePhotoBtn = e.target.closest('button[data-action="delete-photo"]');
    if (deletePhotoBtn) {
      const idx = parseInt(deletePhotoBtn.getAttribute('data-idx'));
      if (confirm("Are you sure you want to delete this photo?")) {
        const updatedPhotos = [...site.photos];
        updatedPhotos.splice(idx, 1);
        await updateSite(site.id, { photos: updatedPhotos });
        showToast("Photo deleted.", "success");
        renderSiteDetails(container, user, site.id);
      }
    }
  });
}

export function destroy() {}
