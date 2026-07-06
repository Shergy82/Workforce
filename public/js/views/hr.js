import { getCurrentUser, isManager } from '../auth.js';
import { getHolidayRequests, createHolidayRequest, updateHolidayStatus, updateUser, getUsers } from '../db.js';
import { formatDate, getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderHrView(container, user);
}

async function renderHrView(container, user) {
  try {
    const [holidayRequests, users] = await Promise.all([
      getHolidayRequests(),
      getUsers()
    ]);

    if (isManager()) {
      renderAdminHr(container, user, holidayRequests, users);
    } else {
      renderOperativeHr(container, user, holidayRequests);
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error loading HR system.</p>`;
  }
}

// ----------------------------------------------------
// OPERATIVE HR SCREEN
// ----------------------------------------------------
function renderOperativeHr(container, user, requests) {
  const myRequests = requests.filter(r => r.userId === user.id);
  const checklist = user.onboardingChecklist || [];
  
  // Calculate CSCS days warning
  let cscsStatusHTML = '';
  if (user.cscsExpiry) {
    const expiryDate = new Date(user.cscsExpiry);
    const diffDays = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      cscsStatusHTML = `<span class="badge badge-danger">Expired (${formatDate(user.cscsExpiry)})</span>`;
    } else if (diffDays <= 30) {
      cscsStatusHTML = `<span class="badge badge-warning">Expiring soon in ${diffDays} days (${formatDate(user.cscsExpiry)})</span>`;
    } else {
      cscsStatusHTML = `<span class="badge badge-success">Active (Expires: ${formatDate(user.cscsExpiry)})</span>`;
    }
  } else {
    cscsStatusHTML = `<span class="badge badge-warning">Not Registered</span>`;
  }

  container.innerHTML = `
    <div class="dashboard-grid">
      
      <!-- Employee Profile & CSCS Status -->
      <div class="card">
        <div class="card-title">My Employee Profile</div>
        <div style="display:flex; flex-direction:column; gap:12px; font-size:0.925rem;">
          <p>Full Name: <strong>${user.name}</strong></p>
          <p>Email: <strong>${user.email}</strong></p>
          <p>Emergency Contact: <strong>${user.emergencyContact || 'Not Specified'}</strong></p>
          <p>Qualifications: <strong>${user.qualifications || 'No qualifications listed'}</strong></p>
          
          <div style="border-top:1px solid hsl(var(--border)); padding-top:10px; margin-top:6px;">
            <p style="margin-bottom:6px;">CSCS / License Status:</p>
            ${cscsStatusHTML}
          </div>

          <button class="btn btn-secondary" id="btn-edit-profile" style="font-size:0.85rem; padding:8px 14px; margin-top:10px; align-self:flex-start;">
            <i class="fa-solid fa-user-pen"></i> Edit Profile Info
          </button>
        </div>
      </div>

      <!-- Onboarding Checklist -->
      <div class="card">
        <div class="card-title">Onboarding Checklist</div>
        <p style="font-size:0.8rem; color:hsl(var(--text-muted)); margin-bottom:12px;">Complete all items to finish your registration profile.</p>
        <div style="display:flex; flex-direction:column; gap:8px;" id="onboarding-tasks-checklist">
          ${renderChecklistItem('Signed Contract', checklist.includes('Signed Contract'))}
          ${renderChecklistItem('Completed Safety Briefing', checklist.includes('Completed Safety Briefing'))}
          ${renderChecklistItem('Submitted Insurance Docs', checklist.includes('Submitted Insurance Docs'))}
          ${renderChecklistItem('Uploaded ID / Passport', checklist.includes('Uploaded ID / Passport'))}
        </div>
      </div>

      <!-- Holidays / Leave Requests -->
      <div class="card" style="grid-column: span 1;">
        <div class="card-title">
          <span>Leave & Holiday Requests</span>
          <button class="btn btn-primary" id="btn-request-leave" style="font-size:0.8rem; padding:6px 12px;">Request Leave</button>
        </div>
        ${myRequests.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:10px; max-height:220px; overflow-y:auto;">
            ${myRequests.map(r => `
              <div style="padding:10px; border:1px solid hsl(var(--border)); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <p style="font-size:0.85rem; font-weight:600;">${formatDate(r.startDate)} - ${formatDate(r.endDate)}</p>
                  <span style="font-size:0.75rem; color:hsl(var(--text-muted));">${r.reason}</span>
                </div>
                <span class="badge ${r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'}">
                  ${r.status}
                </span>
              </div>
            `).join('')}
          </div>
        ` : `
          <p style="color:hsl(var(--text-muted)); font-size:0.9rem; text-align:center; padding:20px 0;">No leave requests logged.</p>
        `}
      </div>

    </div>
  `;

  // Hooks
  document.getElementById('btn-edit-profile').addEventListener('click', () => showEditProfileModal(user));
  document.getElementById('btn-request-leave').addEventListener('click', showRequestLeaveModal);

  // Checklist checkbox changes
  document.querySelectorAll('.onboarding-check-input').forEach(chk => {
    chk.addEventListener('change', async () => {
      const activeList = Array.from(document.querySelectorAll('.onboarding-check-input'))
        .filter(input => input.checked)
        .map(input => input.value);
      
      await updateUser(user.id, { onboardingChecklist: activeList });
      user.onboardingChecklist = activeList; // Sync local object
      showToast("Onboarding progress saved.", "success");
    });
  });
}

function renderChecklistItem(title, isChecked) {
  return `
    <label style="display:flex; align-items:center; gap:10px; font-size:0.9rem; cursor:pointer; padding:6px; border:1px solid hsl(var(--border)/0.5); border-radius:var(--radius-sm);">
      <input type="checkbox" class="onboarding-check-input" value="${title}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px;">
      <span style="${isChecked ? 'text-decoration:line-through; color:hsl(var(--text-muted));' : ''}">${title}</span>
    </label>
  `;
}

function showEditProfileModal(user) {
  showModal({
    title: 'Edit Profile Information',
    bodyHTML: `
      <form id="modal-profile-form">
        <div class="form-group">
          <label class="form-label" for="edit-profile-name">Full Name</label>
          <input class="form-input" type="text" id="edit-profile-name" required value="${user.name}">
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-profile-emergency">Emergency Contact (Name & Number)</label>
          <input class="form-input" type="text" id="edit-profile-emergency" required value="${user.emergencyContact || ''}" placeholder="Jane Doe: 0712345678">
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-profile-quals">Qualifications / Tickets</label>
          <input class="form-input" type="text" id="edit-profile-quals" value="${user.qualifications || ''}" placeholder="e.g. CSCS Green Card, First Aid">
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-profile-cscs">CSCS Card Expiry Date</label>
          <input class="form-input" type="date" id="edit-profile-cscs" value="${user.cscsExpiry || ''}">
        </div>
      </form>
    `,
    confirmText: 'Save Profile',
    onConfirm: async (body) => {
      const name = body.querySelector('#edit-profile-name').value;
      const emergencyContact = body.querySelector('#edit-profile-emergency').value;
      const qualifications = body.querySelector('#edit-profile-quals').value;
      const cscsExpiry = body.querySelector('#edit-profile-cscs').value;

      try {
        await updateUser(user.id, { name, emergencyContact, qualifications, cscsExpiry });
        showToast("Profile details updated!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}

function showRequestLeaveModal() {
  const user = getCurrentUser();
  showModal({
    title: 'Request Leave / Vacation',
    bodyHTML: `
      <form id="modal-leave-form">
        <div style="display:flex; gap:10px;">
          <div class="form-group" style="flex:1;">
            <label class="form-label" for="leave-start">Start Date</label>
            <input class="form-input" type="date" id="leave-start" required value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label" for="leave-end">End Date</label>
            <input class="form-input" type="date" id="leave-end" required value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="leave-reason">Reason / Comments</label>
          <textarea class="form-input" id="leave-reason" rows="3" required placeholder="Sickness, paid vacation, family event..."></textarea>
        </div>
      </form>
    `,
    confirmText: 'Submit Leave Request',
    onConfirm: async (body) => {
      const startDate = body.querySelector('#leave-start').value;
      const endDate = body.querySelector('#leave-end').value;
      const reason = body.querySelector('#leave-reason').value;

      try {
        await createHolidayRequest({
          userId: user.id,
          userName: user.name,
          startDate,
          endDate,
          reason
        });

        showToast("Leave request submitted for review.", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}

// ----------------------------------------------------
// ADMIN HR / APPROVALS SCREEN
// ----------------------------------------------------
function renderAdminHr(container, user, holidayRequests, users) {
  const pendingRequests = holidayRequests.filter(r => r.status === 'pending');
  const allRequests = holidayRequests.filter(r => r.status !== 'pending');

  container.innerHTML = `
    <!-- Leave Approvals Inbox -->
    <div class="card">
      <div class="card-title">Leave Request Inbox (${pendingRequests.length} Pending)</div>
      ${pendingRequests.length > 0 ? `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Dates</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${pendingRequests.map(r => `
                <tr>
                  <td style="font-weight:600;">${r.userName}</td>
                  <td>${formatDate(r.startDate)} - ${formatDate(r.endDate)}</td>
                  <td>${r.reason}</td>
                  <td>
                    <div style="display:flex; gap:6px;">
                      <button class="btn btn-success" style="font-size:0.75rem; padding:4px 8px;" data-action="approve-leave" data-req-id="${r.id}">Approve</button>
                      <button class="btn btn-danger" style="font-size:0.75rem; padding:4px 8px;" data-action="reject-leave" data-req-id="${r.id}">Reject</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <p style="color:hsl(var(--text-muted)); font-size:0.9rem; text-align:center; padding:20px 0;">Inbox is clear.</p>
      `}
    </div>

    <!-- Active Roster CSCS Audits -->
    <div class="card" style="margin-top:24px;">
      <div class="card-title">Employee Qualifications & CSCS Auditing</div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Qualifications</th>
              <th>CSCS Expiry</th>
              <th>Onboarding Status</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => {
              const checklist = u.onboardingChecklist || [];
              const percent = Math.round((checklist.length / 4) * 100);
              
              let badgeHTML = '';
              if (u.cscsExpiry) {
                const isExp = new Date(u.cscsExpiry) < new Date();
                badgeHTML = isExp 
                  ? `<span class="badge badge-danger">Expired</span>` 
                  : `<span class="badge badge-success">Valid</span>`;
              } else {
                badgeHTML = `<span class="badge badge-warning">None</span>`;
              }

              return `
                <tr>
                  <td style="font-weight:600;">${u.name}</td>
                  <td>${u.qualifications || '--'}</td>
                  <td>${u.cscsExpiry ? formatDate(u.cscsExpiry) : '--'} ${badgeHTML}</td>
                  <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <div style="background-color:hsl(var(--border)); border-radius:4px; height:8px; width:80px; overflow:hidden;">
                        <div style="background-color:hsl(var(--primary)); height:100%; width:${percent}%;"></div>
                      </div>
                      <span style="font-size:0.75rem; font-weight:600;">${percent}%</span>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Hooks
  document.querySelectorAll('button[data-action="approve-leave"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reqId = btn.getAttribute('data-req-id');
      await updateHolidayStatus(reqId, 'approved', user.id);
      showToast("Leave request approved.", "success");
      init(document.getElementById('view-mount'));
    });
  });

  document.querySelectorAll('button[data-action="reject-leave"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reqId = btn.getAttribute('data-req-id');
      await updateHolidayStatus(reqId, 'rejected', user.id);
      showToast("Leave request rejected.", "warning");
      init(document.getElementById('view-mount'));
    });
  });
}
export function destroy() {}
