import { getCurrentUser } from '../auth.js';
import { getShifts, updateShift, getSites, updateSite } from '../db.js';
import { formatDate, getLoadingSpinner, viewFile, downloadFile } from '../utils.js';
import { showToast } from '../components/toast.js';
import { uploadFile } from '../storage.js';

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
  await renderJobCardDetail(container, user, shiftId);
}

async function renderJobCardDetail(container, user, shiftId) {
  try {
    const [shifts, sites] = await Promise.all([
      getShifts(),
      getSites()
    ]);

    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px;">
          <i class="fa-solid fa-triangle-exclamation fa-3x" style="color:hsl(var(--danger)); margin-bottom:16px;"></i>
          <h3>Job Card Not Found</h3>
          <button class="btn btn-primary" onclick="location.hash='#/mobile-jobs'" style="margin-top:16px;">Back to Shift List</button>
        </div>
      `;
      return;
    }

    const targetSiteId = shift.siteId || shift.projectId;
    const site = sites.find(s => s.id === targetSiteId) || { files: [], notes: '' };

    // Get color badge class
    let statusClass = 'status-pending';
    if (shift.status === 'confirmed') statusClass = 'status-confirmed';
    else if (shift.status === 'on site') statusClass = 'status-on-site';
    else if (shift.status === 'completed') statusClass = 'status-completed';
    else if (shift.status === 'incomplete') statusClass = 'status-incomplete';
    else if (shift.status === 'cancelled') statusClass = 'status-cancelled';

    // Build action panels dynamically based on status
    let actionPanelHTML = '';

    if (shift.status === 'pending') {
      actionPanelHTML = `
        <button class="btn btn-primary" id="btn-action-confirm" style="width: 100%; padding: 14px; font-weight: 700; font-size: 1rem; border-radius: var(--radius-md);">
          <i class="fa-solid fa-check"></i> Confirm Attendance
        </button>
      `;
    } else if (shift.status === 'confirmed') {
      actionPanelHTML = `
        <button class="btn btn-warning" id="btn-action-onsite" style="width: 100%; padding: 14px; font-weight: 700; font-size: 1rem; border-radius: var(--radius-md); background-color: hsl(var(--warning)); border-color: transparent; color: white;">
          <i class="fa-solid fa-location-crosshairs"></i> Mark On Site
        </button>
      `;
    } else if (shift.status === 'on site') {
      actionPanelHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px; border-top: 1px solid hsl(var(--border)); padding-top: 16px; margin-top: 8px;">
          <h4 style="font-weight: 700; font-size: 0.95rem;">Submit Work Report</h4>
          
          <!-- Segmented Choice Controls -->
          <div style="display: flex; background-color: hsl(var(--bg-primary)); padding: 4px; border-radius: var(--radius-sm); border: 1px solid hsl(var(--border));">
            <button type="button" class="btn" id="btn-tab-complete" style="flex: 1; padding: 8px; font-size: 0.85rem; font-weight: 600; border-radius: 4px; background-color: hsl(var(--success)); color: white; border: none;">
              <i class="fa-solid fa-circle-check"></i> Complete
            </button>
            <button type="button" class="btn" id="btn-tab-incomplete" style="flex: 1; padding: 8px; font-size: 0.85rem; font-weight: 600; border-radius: 4px; background-color: transparent; color: hsl(var(--text-muted)); border: none;">
              <i class="fa-solid fa-circle-xmark"></i> Incomplete
            </button>
          </div>

          <!-- A. COMPLETION REPORT FORM -->
          <form id="form-report-complete" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="completion-notes">Completion Notes</label>
              <textarea class="form-input" id="completion-notes" rows="3" required placeholder="What work did you complete? Details, measurements, issues..."></textarea>
            </div>
            
            ${shift.requiredPhotos && shift.requiredPhotos.length > 0 ? `
              <div style="margin-bottom: 8px;">
                <strong style="font-size: 0.8rem; text-transform: uppercase; color: hsl(var(--text-muted)); display: block; margin-bottom: 8px;">Required Photos (${shift.requiredPhotos.length}):</strong>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                  ${shift.requiredPhotos.map((req, idx) => `
                    <div class="form-group" style="margin-bottom: 0; background-color: hsl(var(--bg-primary)/0.4); padding: 10px; border-radius: 6px; border: 1px solid hsl(var(--border)/0.8);">
                      <label class="form-label" style="font-weight: 700; margin-bottom: 6px; font-size: 0.8rem; color: hsl(var(--text-main)); display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-camera" style="color: hsl(var(--primary));"></i> ${req}
                      </label>
                      <input class="form-input completion-required-photo-input" type="file" data-label="${req}" accept="image/*" required style="font-size: 0.8rem; padding: 6px; border: 1px solid hsl(var(--border)); border-radius: 4px; width: 100%;">
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : `
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="completion-photo">Upload Completion Photo (Required)</label>
                <input class="form-input" type="file" id="completion-photo" accept="image/*" required style="font-size: 0.8rem;">
              </div>
            `}

            <button type="submit" class="btn btn-success" id="btn-submit-complete" style="width: 100%; padding: 12px; font-weight: 700; margin-top: 8px;">
              Submit & Mark Complete
            </button>
          </form>

          <!-- B. INCOMPLETE REPORT FORM -->
          <form id="form-report-incomplete" style="display: none; flex-direction: column; gap: 12px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="incomplete-reason">Reason for Incomplete Work</label>
              <textarea class="form-input" id="incomplete-reason" rows="3" required placeholder="Locked out, weather, missing materials, safety concern..."></textarea>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="incomplete-photo">Upload Proof Photo (Required)</label>
              <input class="form-input" type="file" id="incomplete-photo" accept="image/*" required style="font-size: 0.8rem;">
            </div>
            <button type="submit" class="btn btn-danger" id="btn-submit-incomplete" style="width: 100%; padding: 12px; font-weight: 700; margin-top: 8px;">
              Submit Incomplete Report
            </button>
          </form>

        </div>
      `;
    } else if (shift.status === 'cancelled') {
      actionPanelHTML = `
        <div style="background-color: hsl(var(--danger)/0.15); color: hsl(var(--danger)); border: 1px solid hsl(var(--danger)/0.3); border-radius: var(--radius-md); padding: 16px; text-align: center; font-weight: 700;">
          <i class="fa-solid fa-ban"></i> This shift has been CANCELLED by administration.
        </div>
      `;
    } else if (shift.status === 'completed') {
      actionPanelHTML = `
        <div style="border-top: 1px solid hsl(var(--border)); padding-top: 16px; margin-top: 8px;">
          <h4 style="font-weight: 700; color: hsl(var(--success)); margin-bottom: 8px;"><i class="fa-solid fa-circle-check"></i> Job Completed</h4>
          <p style="font-size: 0.85rem; margin-bottom: 12px;"><strong>Your Notes:</strong><br><span style="font-style: italic; color: hsl(var(--text-muted));">${shift.completionNotes || 'No notes.'}</span></p>
            <div>
              <strong>Uploaded Photos:</strong>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                ${shift.completionPhotos && shift.completionPhotos.length > 0 ? shift.completionPhotos.map((url, idx) => {
                  const label = (shift.requiredPhotos && shift.requiredPhotos[idx]) ? shift.requiredPhotos[idx] : 'Completion Photo';
                  return `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 6px; border: 1px solid hsl(var(--border)/0.6); border-radius: 6px; background-color: hsl(var(--bg-primary)/0.2);">
                      <img src="${url}" style="width: 60px; height: 60px; border-radius: 4px; object-fit: cover; border: 1px solid hsl(var(--border)); cursor: pointer;" onclick="window.open('${url}')">
                      <div style="font-size: 0.8rem; font-weight: 700; color: hsl(var(--text-main));">${label}</div>
                    </div>
                  `;
                }).join('') : '<p style="color: hsl(var(--text-muted)); font-size: 0.75rem;">No photos.</p>'}
              </div>
            </div>
            <button class="btn btn-secondary" id="btn-reopen-job" style="width: 100%; padding: 10px; font-weight: 700; margin-top: 16px; border: 1px solid hsl(var(--warning)); color: hsl(var(--warning)); background: transparent; display: flex; align-items: center; justify-content: center; gap: 8px;">
               <i class="fa-solid fa-rotate-left"></i> Reopen Completed Job
            </button>
        </div>
      `;
    } else if (shift.status === 'incomplete') {
      actionPanelHTML = `
        <div style="border-top: 1px solid hsl(var(--border)); padding-top: 16px; margin-top: 8px;">
          <h4 style="font-weight: 700; color: hsl(var(--danger)); margin-bottom: 8px;"><i class="fa-solid fa-circle-xmark"></i> Job Marked Incomplete</h4>
          <p style="font-size: 0.85rem; margin-bottom: 12px;"><strong>Reported Reason:</strong><br><span style="font-style: italic; color: hsl(var(--text-muted));">${shift.incompleteReason || 'No reason.'}</span></p>
          <div>
            <strong>Proof Photos:</strong>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px;">
              ${shift.incompletePhotos && shift.incompletePhotos.length > 0 ? shift.incompletePhotos.map(url => `
                <img src="${url}" style="width: 80px; height: 80px; border-radius: 6px; object-fit: cover; border: 1px solid hsl(var(--border));" onclick="window.open('${url}')">
              `).join('') : '<p style="color: hsl(var(--text-muted)); font-size: 0.75rem;">No photos.</p>'}
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; overflow-x: hidden;">
        
        <!-- Back Navigation -->
        <div>
          <button class="btn btn-secondary" onclick="location.hash='#/mobile-jobs'" style="padding: 6px 12px;">
            <i class="fa-solid fa-arrow-left"></i> Back to Schedule
          </button>
        </div>

        <!-- Main Job Card Details -->
        <div class="card" style="margin-bottom: 0; padding: 20px; border-left: 5px solid ${shift.status === 'cancelled' ? '#71717a' : 'hsl(var(--primary))'};">
          
          <!-- E-Number -->
          <h2 style="font-weight: 800; font-size: 1.85rem; color: hsl(var(--primary)); margin-bottom: 8px; letter-spacing: -0.025em;">
            ${shift.eNumber || 'No E-Number'}
          </h2>

          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
            <span style="font-weight: 800; font-size: 1.15rem; color: hsl(var(--text-main));">${formatDate(shift.date)}</span>
            <span class="status-badge ${statusClass}">${shift.status}</span>
          </div>

          <div style="font-size: 0.9rem; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-regular fa-clock" style="color: hsl(var(--text-muted));"></i>
            <span>Scheduled Start: ${shift.startTime || '08:00'}</span>
          </div>

          <div style="font-size: 0.95rem; font-weight: 600; margin-bottom: 12px; display: flex; align-items: start; gap: 8px; border-bottom: 1px solid hsl(var(--border)/0.5); padding-bottom: 12px;">
            <i class="fa-solid fa-location-dot" style="color: hsl(var(--text-muted)); margin-top: 4px;"></i>
            <div style="min-width: 0; flex: 1;">
              <span style="word-break: break-word; display: block; margin-bottom: 8px;">${shift.siteAddress}</span>
              ${shift.managerNames && shift.managerNames.length > 0 ? `
                <div style="font-size: 0.8rem; font-weight: 500; color: hsl(var(--text-muted)); margin-bottom: 4px;">
                  <strong style="text-transform: uppercase;">Manager:</strong> ${shift.managerNames.join(', ')}
                </div>
              ` : ''}
              ${shift.relevantPeopleNames && shift.relevantPeopleNames.length > 0 ? `
                <div style="font-size: 0.8rem; font-weight: 500; color: hsl(var(--text-muted));">
                  <strong style="text-transform: uppercase;">Relevant Team:</strong> ${shift.relevantPeopleNames.join(', ')}
                </div>
              ` : ''}
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <strong style="font-size: 0.8rem; text-transform: uppercase; color: hsl(var(--text-muted)); display: block; margin-bottom: 4px;">Job / Task Instructions:</strong>
            <p style="font-size: 0.95rem; font-weight: 600; color: hsl(var(--text-main));">${shift.task}</p>
          </div>

          ${shift.notes ? `
            <div style="margin-bottom: 16px;">
              <strong style="font-size: 0.8rem; text-transform: uppercase; color: hsl(var(--text-muted)); display: block; margin-bottom: 4px;">Operational Notes:</strong>
              <p style="font-size: 0.85rem; font-style: italic; background-color: hsl(var(--bg-primary)/0.5); padding: 8px; border-radius: var(--radius-sm); border-left: 3px solid hsl(var(--warning));">
                ${shift.notes}
              </p>
            </div>
          ` : ''}

          <!-- Google Maps Link -->
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.siteAddress)}" target="_blank" class="btn btn-secondary" style="width: 100%; font-size: 0.85rem; padding: 8px; margin-top: 4px;">
            <i class="fa-solid fa-map-location-dot"></i> Get Directions (Maps)
          </a>

        </div>

        <!-- Files and Drawings Central Card -->
        <div class="card" style="margin-bottom: 0; padding: 16px; overflow: hidden;">
          <h4 style="font-weight: 700; font-size: 0.9rem; margin-bottom: 10px;"><i class="fa-solid fa-folder-open"></i> Site Drawings & RAMS</h4>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${site.files && site.files.length > 0 ? site.files.map((f, idx) => `
              <div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid hsl(var(--border)); border-radius: var(--radius-sm); background-color: hsl(var(--bg-primary)/0.2); width: 100%; box-sizing: border-box; overflow: hidden;">
                <i class="fa-solid ${(f.type && f.type.includes('pdf')) ? 'fa-file-pdf' : 'fa-file-lines'}" style="flex-shrink: 0; color: hsl(var(--primary));"></i>
                <span style="font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;">${f.name}</span>
                <button class="btn-file-view" data-url="${f.url}" data-name="${f.name}" style="flex-shrink: 0; border: none; background: transparent; cursor: pointer; color: hsl(var(--primary)); padding: 4px 6px; font-size: 0.8rem;" title="Open">
                  <i class="fa-solid fa-eye"></i>
                </button>
                <button class="btn-file-download" data-url="${f.url}" data-name="${f.name}" style="flex-shrink: 0; border: none; background: transparent; cursor: pointer; color: hsl(var(--text-muted)); padding: 4px 6px; font-size: 0.8rem;" title="Download">
                  <i class="fa-solid fa-cloud-arrow-down"></i>
                </button>
              </div>
            `).join('') : '<p style="color: hsl(var(--text-muted)); font-size: 0.8rem; font-style: italic; text-align: center;">No site documents loaded.</p>'}
          </div>
        </div>

        <!-- Action Interactive Card -->
        <div class="card" style="margin-bottom: 0; padding: 16px;">
          ${actionPanelHTML}
        </div>

      </div>
    `;

    setupJobCardEvents(container, shift, site, user);
  } catch (err) {
    console.error("Error loading job card:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading job card details: ${err.message}</p></div>`;
  }
}

function setupJobCardEvents(container, shift, site, currentUser) {
  // File View / Download buttons
  container.querySelectorAll('.btn-file-view').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      const name = btn.getAttribute('data-name');
      viewFile(url, name);
    });
  });

  container.querySelectorAll('.btn-file-download').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      const name = btn.getAttribute('data-name');
      downloadFile(url, name);
    });
  });

  // 1. Confirm Attendance
  const confirmBtn = document.getElementById('btn-action-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Confirming...`;

      try {
        const now = new Date().toISOString();
        const timestamps = shift.timestamps || {};
        timestamps.confirmed = now;

        await updateShift(shift.id, {
          status: 'confirmed',
          timestamps
        });

        showToast("Shift Confirmed! Ready to work.", "success");
        init(container);
      } catch (err) {
        showToast(err.message, "error");
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="fa-solid fa-check"></i> Confirm Attendance`;
      }
    });
  }

  // 2. Mark On Site
  const onsiteBtn = document.getElementById('btn-action-onsite');
  if (onsiteBtn) {
    onsiteBtn.addEventListener('click', async () => {
      onsiteBtn.disabled = true;
      onsiteBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Marking...`;

      try {
        const now = new Date().toISOString();
        const timestamps = shift.timestamps || {};
        timestamps.onSite = now;

        await updateShift(shift.id, {
          status: 'on site',
          timestamps
        });

        showToast("You are now registered ON SITE.", "success");
        init(container);
      } catch (err) {
        showToast(err.message, "error");
        onsiteBtn.disabled = false;
        onsiteBtn.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> Mark On Site`;
      }
    });
  }

  // 3. Tab switching for Complete/Incomplete
  const tabComplete = document.getElementById('btn-tab-complete');
  const tabIncomplete = document.getElementById('btn-tab-incomplete');
  const formComplete = document.getElementById('form-report-complete');
  const formIncomplete = document.getElementById('form-report-incomplete');

  if (tabComplete && tabIncomplete) {
    tabComplete.addEventListener('click', () => {
      tabComplete.style.backgroundColor = 'hsl(var(--success))';
      tabComplete.style.color = 'white';
      tabIncomplete.style.backgroundColor = 'transparent';
      tabIncomplete.style.color = 'hsl(var(--text-muted))';

      formComplete.style.display = 'flex';
      formIncomplete.style.display = 'none';
    });

    tabIncomplete.addEventListener('click', () => {
      tabIncomplete.style.backgroundColor = 'hsl(var(--danger))';
      tabIncomplete.style.color = 'white';
      tabComplete.style.backgroundColor = 'transparent';
      tabComplete.style.color = 'hsl(var(--text-muted))';

      formIncomplete.style.display = 'flex';
      formComplete.style.display = 'none';
    });
  }

  // 4. Submit Completion
  if (formComplete) {
    formComplete.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetSiteId = shift.siteId || shift.projectId;
      const notes = document.getElementById('completion-notes').value;

      if (!notes.trim()) {
        showToast("Completion notes are required.", "error");
        return;
      }

      const submitBtn = document.getElementById('btn-submit-complete');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading evidence...`;

      try {
        const photoUrls = [];
        const requiredInputs = document.querySelectorAll('.completion-required-photo-input');

        if (requiredInputs.length > 0) {
          for (let i = 0; i < requiredInputs.length; i++) {
            const file = requiredInputs[i].files[0];
            if (!file) {
              showToast("Please upload all required photos.", "error");
              submitBtn.disabled = false;
              submitBtn.innerHTML = `Submit & Mark Complete`;
              return;
            }
            const url = await uploadFile(`shifts/${shift.id}/completion_${i}`, file);
            photoUrls.push(url);
          }
        } else {
          const photoFile = document.getElementById('completion-photo').files[0];
          if (!photoFile) {
            showToast("Completion photo is required.", "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `Submit & Mark Complete`;
            return;
          }
          const url = await uploadFile(`shifts/${shift.id}/completion`, photoFile);
          photoUrls.push(url);
        }

        const now = new Date().toISOString();
        const timestamps = shift.timestamps || {};
        timestamps.completed = now;

        // Save against shift
        await updateShift(shift.id, {
          status: 'completed',
          completionNotes: notes,
          completionPhotos: photoUrls,
          timestamps
        });

        // Save photo and log history against central site address record
        const updatedPhotos = site.photos ? [...site.photos] : [];
        photoUrls.forEach(url => {
          updatedPhotos.push({
            url: url,
            uploadedBy: currentUser.name,
            date: now.split('T')[0]
          });
        });

        await updateSite(targetSiteId, {
          photos: updatedPhotos
        });

        showToast("Completion evidence submitted!", "success");
        init(container);
      } catch (err) {
        showToast(err.message, "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Submit & Mark Complete`;
      }
    });
  }

  // 5. Submit Incomplete
  if (formIncomplete) {
    formIncomplete.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = document.getElementById('incomplete-reason').value;
      const photoFile = document.getElementById('incomplete-photo').files[0];

      if (!reason.trim() || !photoFile) {
        showToast("Reason and barrier photo are required.", "error");
        return;
      }

      const submitBtn = document.getElementById('btn-submit-incomplete');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading proof...`;

      try {
        // Upload photo
        const photoUrl = await uploadFile(`shifts/${shift.id}/incomplete`, photoFile);

        const now = new Date().toISOString();
        const timestamps = shift.timestamps || {};
        timestamps.incomplete = now;

        // Save against shift
        await updateShift(shift.id, {
          status: 'incomplete',
          incompleteReason: reason,
          incompletePhotos: [photoUrl],
          timestamps
        });

        showToast("Incomplete job report logged.", "warning");
        init(container);
      } catch (err) {
        showToast(err.message, "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Submit Incomplete Report`;
      }
    });
  }

  // 6. Reopen Completed Job
  const reopenBtn = document.getElementById('btn-reopen-job');
  if (reopenBtn) {
    reopenBtn.addEventListener('click', async () => {
      if (confirm("Are you sure you want to reopen this job? This will reset its status to 'on site' so you can update notes or upload missing photos.")) {
        reopenBtn.disabled = true;
        reopenBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reopening...`;
        try {
          await updateShift(shift.id, { status: 'on site' });
          showToast("Job reopened. You can now edit/add details.", "success");
          init(container);
        } catch (err) {
          showToast(err.message, "error");
          reopenBtn.disabled = false;
          reopenBtn.innerHTML = `<i class="fa-solid fa-rotate-left"></i> Reopen Completed Job`;
        }
      }
    });
  }
}

export function destroy() {}
