import { getCurrentUser, isManager } from '../auth.js';
import { getShifts, updateShift, getSites, getUsers, createNotification } from '../db.js';
import { formatDate, getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const shiftId = urlParams.get('id');

  if (!shiftId) {
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error: Shift ID is missing.</p></div>`;
    return;
  }

  container.innerHTML = getLoadingSpinner();
  await renderShiftDetails(container, user, shiftId);
}

async function renderShiftDetails(container, user, shiftId) {
  try {
    const [shifts, sites, users] = await Promise.all([
      getShifts(),
      getSites(),
      getUsers()
    ]);

    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px;">
          <i class="fa-solid fa-triangle-exclamation fa-3x" style="color:hsl(var(--danger)); margin-bottom:16px;"></i>
          <h3>Shift Record Not Found</h3>
          <button class="btn btn-primary" onclick="history.back()" style="margin-top:16px;">Go Back</button>
        </div>
      `;
      return;
    }

    const engineer = users.find(u => u.id === shift.userId) || { name: shift.userName || 'Unknown' };
    const activeSites = sites.filter(s => s.status === 'active');

    // Color-coded status badge
    let statusBadgeHTML = `<span class="status-badge status-${shift.status.replace(' ', '-')}">${shift.status}</span>`;

    // Timestamps rendering
    const t = shift.timestamps || {};
    let timestampsHTML = `
      <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 12px; margin-top: 12px;">
        <strong style="color: hsl(var(--text-muted)); text-transform: uppercase; font-size: 0.75rem; display: block; margin-bottom: 4px;">Tracking Timestamps:</strong>
        <div><i class="fa-regular fa-calendar-plus" style="width: 18px;"></i> Assigned: <span>Scheduled in planner</span></div>
        ${t.confirmed ? `<div><i class="fa-regular fa-circle-check" style="width: 18px; color:hsl(var(--info));"></i> Confirmed: <span>${new Date(t.confirmed).toLocaleString()}</span></div>` : ''}
        ${t.onSite ? `<div><i class="fa-solid fa-location-arrow" style="width: 18px; color:hsl(var(--warning));"></i> Marked On Site: <span>${new Date(t.onSite).toLocaleString()}</span></div>` : ''}
        ${t.completed ? `<div><i class="fa-regular fa-circle-check" style="width: 18px; color:hsl(var(--success));"></i> Completed: <span>${new Date(t.completed).toLocaleString()}</span></div>` : ''}
        ${t.incomplete ? `<div><i class="fa-solid fa-circle-xmark" style="width: 18px; color:hsl(var(--danger));"></i> Incomplete: <span>${new Date(t.incomplete).toLocaleString()}</span></div>` : ''}
        ${t.cancelled ? `<div><i class="fa-solid fa-ban" style="width: 18px; color:hsl(var(--text-muted));"></i> Cancelled: <span>${new Date(t.cancelled).toLocaleString()}</span></div>` : ''}
      </div>
    `;

    // Operative evidence display
    let evidenceHTML = '';
    if (shift.status === 'completed') {
      evidenceHTML = `
        <div class="card" style="border-left: 5px solid hsl(var(--success));">
          <div class="card-title" style="color: hsl(var(--success));"><i class="fa-solid fa-circle-check"></i> Completion Evidence Submissions</div>
          <div style="font-size: 0.9rem; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
            <div><strong>Completion Notes:</strong> <span style="font-style: italic; color: hsl(var(--text-muted));">${shift.completionNotes || 'No notes left by operative.'}</span></div>
            <div style="font-size: 0.8rem; color: hsl(var(--text-muted)); margin-top: 4px;">
              Uploaded by: <strong>${engineer.name}</strong> on <strong>${t.completed ? new Date(t.completed).toLocaleString() : 'N/A'}</strong>
            </div>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong>Completion Photos:</strong>
              ${shift.completionPhotos && shift.completionPhotos.length > 0 ? `
                <button class="btn btn-secondary" id="btn-download-all-photos" style="padding: 4px 8px; font-size: 0.75rem;">
                  <i class="fa-solid fa-cloud-arrow-down"></i> Download All Photos
                </button>
              ` : ''}
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px;">
              ${shift.completionPhotos && shift.completionPhotos.length > 0 ? shift.completionPhotos.map(url => `
                <img src="${url}" style="width: 100px; height: 100px; border-radius: 6px; object-fit: cover; border: 1px solid hsl(var(--border)); cursor: pointer;" onclick="window.open('${url}')">
              `).join('') : '<p style="color: hsl(var(--text-muted)); font-size: 0.8rem; font-style: italic;">No photo evidence uploaded.</p>'}
            </div>
          </div>
        </div>
      `;
    } else if (shift.status === 'incomplete') {
      evidenceHTML = `
        <div class="card" style="border-left: 5px solid hsl(var(--danger));">
          <div class="card-title" style="color: hsl(var(--danger));"><i class="fa-solid fa-triangle-exclamation"></i> Incomplete Job Report</div>
          <div style="font-size: 0.9rem; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
            <div><strong>Barrier / Reason for Incomplete Work:</strong>
              <div style="padding: 10px; background-color: hsl(var(--danger)/0.05); border-left: 3px solid hsl(var(--danger)); border-radius: var(--radius-sm); margin-top: 4px; font-weight: 500;">
                ${shift.incompleteReason || 'No reason provided.'}
              </div>
            </div>
            <div style="font-size: 0.8rem; color: hsl(var(--text-muted)); margin-top: 4px;">
              Reported by: <strong>${engineer.name}</strong> on <strong>${t.incomplete ? new Date(t.incomplete).toLocaleString() : 'N/A'}</strong>
            </div>
          </div>
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <strong>Site Barrier Photos:</strong>
              ${shift.incompletePhotos && shift.incompletePhotos.length > 0 ? `
                <button class="btn btn-secondary" id="btn-download-all-photos" style="padding: 4px 8px; font-size: 0.75rem;">
                  <i class="fa-solid fa-cloud-arrow-down"></i> Download All Photos
                </button>
              ` : ''}
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px;">
              ${shift.incompletePhotos && shift.incompletePhotos.length > 0 ? shift.incompletePhotos.map(url => `
                <img src="${url}" style="width: 100px; height: 100px; border-radius: 6px; object-fit: cover; border: 1px solid hsl(var(--border)); cursor: pointer;" onclick="window.open('${url}')">
              `).join('') : '<p style="color: hsl(var(--text-muted)); font-size: 0.8rem; font-style: italic;">No photo evidence uploaded.</p>'}
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="margin-bottom: 20px;">
        <button class="btn btn-secondary" onclick="history.back()"><i class="fa-solid fa-arrow-left"></i> Back</button>
      </div>

      <div class="dashboard-grid">
        <!-- Edit Form / Shift details Card -->
        <div class="card" style="grid-column: span 2;">
          <div class="card-title">
            <span>Shift Details & Management</span>
            ${statusBadgeHTML}
          </div>

          <form id="edit-shift-form">
            <div class="form-group">
              <label class="form-label">Allocated Engineer</label>
              <input class="form-input" type="text" value="${engineer.name} (${engineer.trade || 'Operative'})" readonly style="background-color: hsl(var(--bg-primary)/0.5); cursor: not-allowed;">
            </div>

            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <div class="form-group" style="flex: 1; min-width: 200px;">
                <label class="form-label" for="edit-shift-site">Site Address</label>
                <select class="form-input" id="edit-shift-site" ${!isManager() ? 'disabled' : ''}>
                  ${activeSites.map(s => `<option value="${s.id}" data-addr="${s.address}" ${s.id === shift.siteId ? 'selected' : ''}>${s.address}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="flex: 1; min-width: 200px;">
                <label class="form-label" for="edit-shift-date">Shift Date</label>
                <input class="form-input" type="date" id="edit-shift-date" value="${shift.date}" ${!isManager() ? 'readonly' : ''}>
              </div>
            </div>

            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <div class="form-group" style="flex: 1; min-width: 200px;">
                <label class="form-label" for="edit-shift-time">Start Time</label>
                <input class="form-input" type="time" id="edit-shift-time" value="${shift.startTime || '08:00'}" ${!isManager() ? 'readonly' : ''}>
              </div>
              <div class="form-group" style="flex: 1; min-width: 200px;">
                <label class="form-label" for="edit-shift-task">Task Instructions</label>
                <input class="form-input" type="text" id="edit-shift-task" value="${shift.task}" required ${!isManager() ? 'readonly' : ''}>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-shift-notes">Shift Notes / Site Requirements</label>
              <textarea class="form-input" id="edit-shift-notes" rows="3" ${!isManager() ? 'readonly' : ''}>${shift.notes || ''}</textarea>
            </div>

            ${isManager() && shift.status !== 'cancelled' ? `
              <div style="display: flex; gap: 10px; margin-top: 20px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 16px;">
                <button type="submit" class="btn btn-primary" id="btn-save-shift">Save Modifications</button>
                <button type="button" class="btn btn-danger" id="btn-cancel-shift" style="background-color: hsl(var(--danger)); border-color: transparent;">Cancel Shift</button>
              </div>
            ` : ''}
          </form>
        </div>

        <!-- Right Side: Timestamps and Evidence -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- Tracking Info Card -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-title">Attendance Tracking</div>
            <div>
              <strong>Allocated Site:</strong>
              <p style="font-size: 0.85rem; color: hsl(var(--text-muted)); margin-bottom: 8px;">${shift.siteAddress}</p>
              <strong>Engineer Phone:</strong>
              <p style="font-size: 0.85rem; color: hsl(var(--text-muted)); margin-bottom: 8px;">${engineer.phone || 'No phone registered'}</p>
            </div>
            ${timestampsHTML}
          </div>

          <!-- Submitted evidence -->
          ${evidenceHTML}
        </div>
      </div>
    `;

    setupShiftDetailEvents(container, shift, user);
  } catch (err) {
    console.error("Error loading shift detail:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading shift record: ${err.message}</p></div>`;
  }
}

function setupShiftDetailEvents(container, shift, currentUser) {
  const form = document.getElementById('edit-shift-form');
  if (!form) return;

  // Save Shift Modifications
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isManager()) return;

    const siteSelect = document.getElementById('edit-shift-site');
    const selectedOption = siteSelect.options[siteSelect.selectedIndex];
    const siteId = siteSelect.value;
    const siteAddress = selectedOption.getAttribute('data-addr');
    const date = document.getElementById('edit-shift-date').value;
    const startTime = document.getElementById('edit-shift-time').value;
    const task = document.getElementById('edit-shift-task').value;
    const notes = document.getElementById('edit-shift-notes').value;

    try {
      const oldAddress = shift.siteAddress;
      const oldDate = shift.date;
      const oldTask = shift.task;
      const oldTime = shift.startTime;

      await updateShift(shift.id, {
        siteId,
        siteAddress,
        date,
        startTime,
        task,
        notes
      });

      // Construct change message for user
      let changes = [];
      if (oldAddress !== siteAddress) changes.push(`location changed to ${siteAddress}`);
      if (oldDate !== date) changes.push(`date shifted to ${formatDate(date)}`);
      if (oldTime !== startTime) changes.push(`start time changed to ${startTime}`);
      if (oldTask !== task) changes.push(`task modified to "${task}"`);

      if (changes.length > 0) {
      // Notification handled by Cloud Function
      }

      showToast("Shift modifications saved successfully!", "success");
      location.reload();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // Cancel Shift
  const cancelBtn = document.getElementById('btn-cancel-shift');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (confirm("Are you sure you want to cancel this shift? It will remain visible to the operative as CANCELLED.")) {
        try {
          const now = new Date().toISOString();
          const timestamps = shift.timestamps || {};
          timestamps.cancelled = now;

          await updateShift(shift.id, {
            status: 'cancelled',
            timestamps
          });

          // Notification handled by Cloud Function

          showToast("Shift cancelled successfully.", "warning");
          location.reload();
        } catch (err) {
          showToast(err.message, "error");
        }
      }
    });
  }
// Bulk download all photos
  const downloadAllBtn = document.getElementById('btn-download-all-photos');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', async () => {
      const photoUrls = shift.status === 'completed' ? (shift.completionPhotos || []) : (shift.incompletePhotos || []);
      if (!photoUrls.length) return;
      for (const url of photoUrls) {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          const filename = url.split('/').pop().split('?')[0] || 'photo.jpg';
          a.download = filename;
          a.click();
          URL.revokeObjectURL(a.href);
        } catch (e) {
          console.error('Failed to download', url, e);
        }
      }
    });
  }
}


export function destroy() {}
