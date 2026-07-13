import { getCurrentUser, isManager } from '../auth.js';
import { getHolidayRequests, createHolidayRequest, updateHolidayStatus, updateUser, getUsers, deleteUser } from '../db.js';
import { formatDate, getLoadingSpinner, getLocalDateString } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';

const COLOR_PALETTE = [
  '#3b82f6','#10b981','#8b5cf6','#f97316','#ec4899',
  '#14b8a6','#ef4444','#6366f1','#f59e0b','#059669',
  '#0ea5e9','#7c3aed','#f43f5e','#84cc16','#06b6d4',
  '#d946ef','#64748b','#9a3412','#eab308','#1e3a8a'
];

function getNormalizedChecklist(user) {
  const rawList = user.onboardingChecklist || [];
  const defaultTitles = [
    'Signed Contract',
    'Completed Safety Briefing',
    'Submitted Insurance Docs',
    'Uploaded ID / Passport'
  ];
  
  let list = rawList.map(item => {
    if (typeof item === 'string') {
      return { title: item, checked: true, completedDate: '', expiryDate: '' };
    }
    return {
      title: item.title || '',
      checked: !!item.checked,
      completedDate: item.completedDate || '',
      expiryDate: item.expiryDate || ''
    };
  });

  defaultTitles.forEach(title => {
    if (!list.some(item => item.title === title)) {
      list.push({ title, checked: false, completedDate: '', expiryDate: '' });
    }
  });

  return list;
}

function getItemExpiryStatus(item) {
  if (!item.checked || !item.expiryDate) return { status: 'none', label: '', class: '' };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(item.expiryDate);
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { status: 'expired', label: `Expired (${formatDate(item.expiryDate)})`, class: 'badge-danger' };
  } else if (diffDays <= 30) {
    return { status: 'expiring', label: `Expires in ${diffDays}d (${formatDate(item.expiryDate)})`, class: 'badge-warning' };
  }
  return { status: 'valid', label: `Expires ${formatDate(item.expiryDate)}`, class: 'badge-success' };
}

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;
  container.innerHTML = getLoadingSpinner();
  await renderHrView(container, user);
}

async function renderHrView(container, user) {
  try {
    const [holidayRequests, users] = await Promise.all([getHolidayRequests(), getUsers()]);
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

// --------------------------------------------------------
// OPERATIVE HR SCREEN
// --------------------------------------------------------
function renderOperativeHr(container, user, requests) {
  const myRequests = requests.filter(r => r.userId === user.id);
  const checklist = getNormalizedChecklist(user);

  let cscsStatusHTML = '';
  if (user.cscsExpiry) {
    const days = Math.ceil((new Date(user.cscsExpiry) - new Date()) / (1000 * 60 * 60 * 24));
    if (days < 0) cscsStatusHTML = `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> EXPIRED (${formatDate(user.cscsExpiry)})</span>`;
    else if (days <= 60) cscsStatusHTML = `<span class="badge badge-warning"><i class="fa-solid fa-clock"></i> Expires in ${days} days (${formatDate(user.cscsExpiry)})</span>`;
    else cscsStatusHTML = `<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Valid - Expires ${formatDate(user.cscsExpiry)}</span>`;
  } else {
    cscsStatusHTML = `<span class="badge badge-warning">Not Registered</span>`;
  }

  const checkedCount = checklist.filter(i => i.checked).length;
  const onboardPct = checklist.length > 0 ? Math.round((checkedCount / checklist.length) * 100) : 0;

  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h3 style="font-weight:800; font-size:1.4rem; color:hsl(var(--primary));"><i class="fa-solid fa-user-tie"></i> My HR Profile</h3>
      <p style="color:hsl(var(--text-muted)); font-size:0.9rem;">View your employment details and manage leave requests.</p>
    </div>
    <div class="dashboard-grid">
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-id-card-clip"></i> Employee Profile</div>
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div style="display:flex; align-items:center; gap:14px; padding:14px; background:hsl(var(--bg-primary)); border-radius:var(--radius-md); border:1px solid hsl(var(--border));">
            <div style="width:52px; height:52px; border-radius:50%; background:hsl(var(--primary)/0.12); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <i class="fa-solid fa-circle-user" style="font-size:1.8rem; color:hsl(var(--primary));"></i>
            </div>
            <div>
              <div style="font-weight:800; font-size:1.1rem;">${user.name}</div>
              <div style="font-size:0.8rem; color:hsl(var(--text-muted));">${user.email}</div>
              <span class="badge badge-info" style="margin-top:4px; text-transform:capitalize;">${user.role || 'operative'}</span>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.875rem;">
            <div style="padding:10px; background:hsl(var(--bg-primary)); border-radius:var(--radius-sm); border:1px solid hsl(var(--border));">
              <div style="color:hsl(var(--text-muted)); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px;">Trade</div>
              <div style="font-weight:700;">${user.trade || 'Not specified'}</div>
            </div>
            <div style="padding:10px; background:hsl(var(--bg-primary)); border-radius:var(--radius-sm); border:1px solid hsl(var(--border));">
              <div style="color:hsl(var(--text-muted)); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px;">Phone</div>
              <div style="font-weight:700;">${user.phone || 'Not registered'}</div>
            </div>
            <div style="padding:10px; background:hsl(var(--bg-primary)); border-radius:var(--radius-sm); border:1px solid hsl(var(--border)); grid-column:1/-1;">
              <div style="color:hsl(var(--text-muted)); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px;">Emergency Contact</div>
              <div style="font-weight:700;">${user.emergencyContact || 'Not specified'}</div>
            </div>
            <div style="padding:10px; background:hsl(var(--bg-primary)); border-radius:var(--radius-sm); border:1px solid hsl(var(--border)); grid-column:1/-1;">
              <div style="color:hsl(var(--text-muted)); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px;">Qualifications</div>
              <div style="font-weight:700;">${user.qualifications || 'None listed'}</div>
            </div>
            <div style="padding:10px; background:hsl(var(--bg-primary)); border-radius:var(--radius-sm); border:1px solid hsl(var(--border)); grid-column:1/-1;">
              <div style="color:hsl(var(--text-muted)); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">CSCS / Licence Status</div>
              ${cscsStatusHTML}
            </div>
          </div>
          <button class="btn btn-primary" id="btn-edit-profile" style="width:100%; justify-content:center; gap:8px;">
            <i class="fa-solid fa-user-pen"></i> Edit My Profile
          </button>
        </div>
      </div>

      <div class="card" style="grid-column:1/-1;">
        <div class="card-title"><i class="fa-solid fa-clipboard-check"></i> Onboarding Checklist (${onboardPct}% Complete)</div>
        <div style="background:hsl(var(--border)); border-radius:4px; height:6px; margin-bottom:16px; overflow:hidden;">
          <div style="background:hsl(var(--primary)); height:100%; width:${onboardPct}%; transition:width 0.4s ease;"></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${checklist.map(item => renderChecklistItem(item)).join('')}
        </div>
      </div>

      <div class="card" style="grid-column:1/-1;">
        <div class="card-title">
          <span><i class="fa-solid fa-calendar-xmark"></i> Leave & Holiday Requests</span>
          <button class="btn btn-primary" id="btn-request-leave" style="font-size:0.85rem; padding:8px 14px;">
            <i class="fa-solid fa-plus"></i> Request Leave
          </button>
        </div>
        ${myRequests.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${myRequests.map(r => `
              <div style="padding:12px 16px; border:1px solid hsl(var(--border)); border-left:4px solid hsl(var(--${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'})); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div>
                  <div style="font-weight:700; font-size:0.9rem;">${formatDate(r.startDate)} to ${formatDate(r.endDate)}</div>
                  <div style="font-size:0.8rem; color:hsl(var(--text-muted)); margin-top:2px;">${r.reason}</div>
                </div>
                <span class="badge ${r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'}" style="text-transform:capitalize;">${r.status}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align:center; padding:30px 0; color:hsl(var(--text-muted));">
            <i class="fa-regular fa-calendar" style="font-size:2rem; opacity:0.4; display:block; margin-bottom:8px;"></i>
            No leave requests yet.
          </div>
        `}
      </div>
    </div>
  `;


  document.getElementById('btn-edit-profile').addEventListener('click', () => showEditProfileModal(user));
  document.getElementById('btn-request-leave').addEventListener('click', showRequestLeaveModal);
  document.querySelectorAll('.onboarding-check-input').forEach(chk => {
    chk.addEventListener('change', async () => {
      const title = chk.value;
      const checked = chk.checked;
      
      const normalized = getNormalizedChecklist(user);
      const item = normalized.find(i => i.title === title);
      if (item) {
        item.checked = checked;
        item.completedDate = checked ? getLocalDateString() : '';
      }
      
      await updateUser(user.id, { onboardingChecklist: normalized });
      user.onboardingChecklist = normalized;
      showToast("Checklist saved.", "success");
      init(container);
    });
  });
}

function renderChecklistItem(item) {
  const isChecked = item.checked;
  const expiry = getItemExpiryStatus(item);
  let badgeHTML = '';
  if (expiry.label) {
    badgeHTML = `<span class="badge ${expiry.class}" style="font-size:0.7rem; margin-left:auto;">${expiry.label}</span>`;
  }
  
  return `
    <label style="display:flex; align-items:center; gap:10px; font-size:0.9rem; cursor:pointer; padding:10px 12px; border:1px solid hsl(var(--border)/0.6); border-radius:var(--radius-sm); background:${isChecked ? 'hsl(var(--success)/0.06)' : 'hsl(var(--bg-card))'};">
      <input type="checkbox" class="onboarding-check-input" value="${item.title}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px; accent-color:hsl(var(--primary)); flex-shrink:0;">
      <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">
        <span style="${isChecked ? 'text-decoration:line-through; color:hsl(var(--text-muted));' : 'font-weight:500;'}">${item.title}</span>
        ${item.completedDate ? `<span style="font-size:0.7rem; color:hsl(var(--text-muted));">Completed: ${formatDate(item.completedDate)}</span>` : ''}
      </div>
      ${badgeHTML}
      ${isChecked && !badgeHTML ? '<i class="fa-solid fa-circle-check" style="color:hsl(var(--success)); margin-left:auto;"></i>' : ''}
    </label>
  `;
}

function showEditProfileModal(user) {
  showModal({
    title: 'Edit My Profile',
    bodyHTML: `
      <form id="modal-profile-form">
        <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" type="text" id="edit-profile-name" required value="${user.name}"></div>
        <div class="form-group"><label class="form-label">Phone Number</label><input class="form-input" type="tel" id="edit-profile-phone" value="${user.phone || ''}" placeholder="07123456789"></div>
        <div class="form-group"><label class="form-label">Emergency Contact</label><input class="form-input" type="text" id="edit-profile-emergency" value="${user.emergencyContact || ''}" placeholder="Jane Doe: 07123456789"></div>
        <div class="form-group"><label class="form-label">Qualifications / Tickets</label><input class="form-input" type="text" id="edit-profile-quals" value="${user.qualifications || ''}" placeholder="e.g. CSCS, First Aid"></div>
        <div class="form-group"><label class="form-label">CSCS Card Expiry Date</label><input class="form-input" type="date" id="edit-profile-cscs" value="${user.cscsExpiry || ''}"></div>
      </form>
    `,
    confirmText: 'Save Profile',
    onConfirm: async (body) => {
      const name = body.querySelector('#edit-profile-name').value;
      const phone = body.querySelector('#edit-profile-phone').value;
      const emergencyContact = body.querySelector('#edit-profile-emergency').value;
      const qualifications = body.querySelector('#edit-profile-quals').value;
      const cscsExpiry = body.querySelector('#edit-profile-cscs').value;
      try {
        await updateUser(user.id, { name, phone, emergencyContact, qualifications, cscsExpiry });
        showToast("Profile updated!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) { showToast(err.message, "error"); }
    }
  });
}

function showRequestLeaveModal() {
  const user = getCurrentUser();
  showModal({
    title: 'Request Leave',
    bodyHTML: `
      <form id="modal-leave-form">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1; min-width:140px;"><label class="form-label">Start Date</label><input class="form-input" type="date" id="leave-start" required value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="form-group" style="flex:1; min-width:140px;"><label class="form-label">End Date</label><input class="form-input" type="date" id="leave-end" required value="${new Date().toISOString().split('T')[0]}"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Leave Type</label>
          <select class="form-input" id="leave-type">
            <option>Annual Leave</option>
            <option>Sick Leave</option>
            <option>Compassionate Leave</option>
            <option>Unpaid Leave</option>
            <option>Other</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Comments (optional)</label><textarea class="form-input" id="leave-reason" rows="3" placeholder="Any additional details..."></textarea></div>
      </form>
    `,
    confirmText: 'Submit Request',
    onConfirm: async (body) => {
      const startDate = body.querySelector('#leave-start').value;
      const endDate = body.querySelector('#leave-end').value;
      const type = body.querySelector('#leave-type').value;
      const comments = body.querySelector('#leave-reason').value;
      const reason = comments ? `${type} - ${comments}` : type;
      try {
        await createHolidayRequest({ userId: user.id, userName: user.name, startDate, endDate, reason });
        showToast("Leave request submitted.", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) { showToast(err.message, "error"); }
    }
  });
}

// --------------------------------------------------------
// ADMIN HR SCREEN
// --------------------------------------------------------
function renderAdminHr(container, user, holidayRequests, users) {
  const pendingRequests = holidayRequests.filter(r => r.status === 'pending');
  const resolvedRequests = holidayRequests.filter(r => r.status !== 'pending');
  const activeUsers = users.filter(u => u.status !== 'suspended');
  const suspendedUsers = users.filter(u => u.status === 'suspended');
  const today = new Date();
  const cscsAlerts = users.filter(u => {
    if (!u.cscsExpiry) return false;
    return Math.ceil((new Date(u.cscsExpiry) - today) / (1000 * 60 * 60 * 24)) <= 60;
  }).sort((a, b) => new Date(a.cscsExpiry) - new Date(b.cscsExpiry));

  // Compile onboarding alerts (expired or expiring soon)
  const onboardingAlerts = [];
  users.forEach(u => {
    const list = getNormalizedChecklist(u);
    list.forEach(item => {
      const expiryStatus = getItemExpiryStatus(item);
      if (expiryStatus.status === 'expired' || expiryStatus.status === 'expiring') {
        onboardingAlerts.push({
          user: u,
          item: item,
          expiry: expiryStatus
        });
      }
    });
  });

  container.innerHTML = `
    <div style="margin-bottom:20px;">
      <h3 style="font-weight:800; font-size:1.4rem; color:hsl(var(--primary));"><i class="fa-solid fa-users-gear"></i> HR & User Management</h3>
      <p style="color:hsl(var(--text-muted)); font-size:0.9rem;">Manage your team, approve leave, and monitor qualifications.</p>
    </div>

    <div class="kpi-grid" style="margin-bottom:24px;">
      <div class="kpi-card">
        <div class="kpi-label"><i class="fa-solid fa-users"></i> Total Staff</div>
        <div class="kpi-value">${users.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" style="color:hsl(var(--success));"><i class="fa-solid fa-circle-check"></i> Active</div>
        <div class="kpi-value" style="color:hsl(var(--success));">${activeUsers.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" style="color:hsl(var(--warning));"><i class="fa-solid fa-circle-pause"></i> Suspended</div>
        <div class="kpi-value" style="color:hsl(var(--warning));">${suspendedUsers.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label" style="color:${pendingRequests.length > 0 ? 'hsl(var(--danger))' : 'inherit'};"><i class="fa-solid fa-envelope-open-text"></i> Leave Pending</div>
        <div class="kpi-value" style="color:${pendingRequests.length > 0 ? 'hsl(var(--danger))' : 'inherit'};">${pendingRequests.length}</div>
      </div>
    </div>

    ${cscsAlerts.length > 0 || onboardingAlerts.length > 0 ? `
      <div class="card" style="border-left:4px solid hsl(var(--warning)); margin-bottom:24px;">
        <div class="card-title"><span><i class="fa-solid fa-triangle-exclamation" style="color:hsl(var(--warning));"></i> CSCS & Onboarding Expiry Alerts (${cscsAlerts.length + onboardingAlerts.length})</span></div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${cscsAlerts.map(u => {
            const days = Math.ceil((new Date(u.cscsExpiry) - today) / (1000 * 60 * 60 * 24));
            const isExp = days < 0;
            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-radius:var(--radius-sm); background:hsl(var(--${isExp ? 'danger' : 'warning'})/0.07); border:1px solid hsl(var(--${isExp ? 'danger' : 'warning'})/0.3); flex-wrap:wrap; gap:8px;">
              <div><span style="font-weight:700;">${u.name}</span><span style="font-size:0.78rem; color:hsl(var(--text-muted)); margin-left:8px;">CSCS Licence</span></div>
              <span class="badge ${isExp ? 'badge-danger' : 'badge-warning'}">${isExp ? `Expired ${Math.abs(days)}d ago` : `Expires in ${days}d`} - ${formatDate(u.cscsExpiry)}</span>
            </div>`;
          }).join('')}
          ${onboardingAlerts.map(alert => {
            const isExp = alert.expiry.status === 'expired';
            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-radius:var(--radius-sm); background:hsl(var(--${isExp ? 'danger' : 'warning'})/0.07); border:1px solid hsl(var(--${isExp ? 'danger' : 'warning'})/0.3); flex-wrap:wrap; gap:8px;">
              <div><span style="font-weight:700;">${alert.user.name}</span><span style="font-size:0.78rem; color:hsl(var(--text-muted)); margin-left:8px;">Onboarding: ${alert.item.title}</span></div>
              <span class="badge ${alert.expiry.class}">${alert.expiry.label}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">
        <span><i class="fa-solid fa-id-badge"></i> Full Team Roster (${users.length})</span>
        <input type="text" id="hr-roster-search" placeholder="Search staff..." class="form-input" style="font-size:0.85rem; padding:8px 12px; width:200px; max-width:100%;">
      </div>
      <div id="hr-roster-list">
        ${renderRosterCards(users)}
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">
        <span><i class="fa-solid fa-inbox"></i> Leave Inbox ${pendingRequests.length > 0 ? `<span class="badge badge-danger" style="margin-left:8px;">${pendingRequests.length}</span>` : ''}</span>
      </div>
      ${pendingRequests.length > 0 ? `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${pendingRequests.map(r => `
            <div style="padding:14px 16px; border:1px solid hsl(var(--border)); border-left:4px solid hsl(var(--warning)); border-radius:var(--radius-sm); display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;">
              <div>
                <div style="font-weight:700;">${r.userName}</div>
                <div style="font-size:0.85rem; color:hsl(var(--text-muted)); margin-top:2px;">${formatDate(r.startDate)} to ${formatDate(r.endDate)} - ${r.reason}</div>
              </div>
              <div style="display:flex; gap:8px; flex-shrink:0;">
                <button class="btn btn-success" style="font-size:0.8rem; padding:6px 12px;" data-action="approve-leave" data-req-id="${r.id}"><i class="fa-solid fa-check"></i> Approve</button>
                <button class="btn btn-danger" style="font-size:0.8rem; padding:6px 12px;" data-action="reject-leave" data-req-id="${r.id}"><i class="fa-solid fa-xmark"></i> Reject</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<div style="text-align:center; padding:24px 0; color:hsl(var(--text-muted));"><i class="fa-solid fa-inbox" style="font-size:1.8rem; opacity:0.35; display:block; margin-bottom:8px;"></i>Inbox is clear.</div>`}
    </div>

    ${resolvedRequests.length > 0 ? `
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-clock-rotate-left"></i> Leave History (${resolvedRequests.length})</div>
        <div style="display:flex; flex-direction:column; gap:8px; max-height:300px; overflow-y:auto;">
          ${resolvedRequests.sort((a,b) => (b.startDate||'').localeCompare(a.startDate||'')).map(r => `
            <div style="padding:10px 14px; border:1px solid hsl(var(--border)); border-left:4px solid hsl(var(--${r.status === 'approved' ? 'success' : 'danger'})); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <span style="font-weight:700; font-size:0.9rem;">${r.userName}</span>
                <span style="font-size:0.78rem; color:hsl(var(--text-muted)); margin-left:8px;">${formatDate(r.startDate)} to ${formatDate(r.endDate)}</span>
                <div style="font-size:0.78rem; color:hsl(var(--text-muted)); margin-top:2px;">${r.reason}</div>
              </div>
              <span class="badge ${r.status === 'approved' ? 'badge-success' : 'badge-danger'}" style="text-transform:capitalize;">${r.status}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  setupAdminHrEvents(container, users, user);
}

function renderRosterCards(users) {
  if (users.length === 0) return `<p style="color:hsl(var(--text-muted)); text-align:center; padding:20px 0;">No users found.</p>`;
  return `<div style="display:flex; flex-direction:column; gap:8px;">
    ${users.map(u => {
      const normalized = getNormalizedChecklist(u);
      const checkedCount = normalized.filter(i => i.checked).length;
      const onboardPct = normalized.length > 0 ? Math.round((checkedCount / normalized.length) * 100) : 0;
      const isSuspended = u.status === 'suspended';
      const hasCscs = u.cscsExpiry;
      const cscsExpired = hasCscs && new Date(u.cscsExpiry) < new Date();
      return `
        <div class="hr-roster-row" data-name="${u.name.toLowerCase()}" data-role="${u.role}" style="display:flex; align-items:center; gap:12px; padding:14px 16px; border:1px solid hsl(var(--border)); border-radius:var(--radius-md); background:hsl(var(--bg-card)); flex-wrap:wrap; opacity:${isSuspended ? '0.65' : '1'};">
          <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:160px;">
            <div style="width:40px; height:40px; border-radius:50%; background-color:${u.color || '#3b82f6'}22; border:2px solid ${u.color || '#3b82f6'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <i class="fa-solid fa-user" style="color:${u.color || '#3b82f6'}; font-size:0.9rem;"></i>
            </div>
            <div style="min-width:0;">
              <div style="font-weight:700; font-size:0.95rem;">${u.name}</div>
              <div style="font-size:0.75rem; color:hsl(var(--text-muted)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${u.email}</div>
            </div>
          </div>
          <div style="min-width:90px;">
            <span class="badge badge-info" style="text-transform:capitalize; display:block; width:fit-content; margin-bottom:3px;">${u.role}</span>
            <div style="font-size:0.75rem; color:hsl(var(--text-muted));">${u.trade || 'No trade'}</div>
          </div>
          <div style="min-width:80px;">
            ${hasCscs ? `<span class="badge ${cscsExpired ? 'badge-danger' : 'badge-success'}" style="font-size:0.7rem;">${cscsExpired ? 'CSCS Expired' : 'CSCS Valid'}</span>` : `<span class="badge badge-warning" style="font-size:0.7rem;">No CSCS</span>`}
          </div>
          <div style="min-width:90px;">
            <div style="font-size:0.68rem; color:hsl(var(--text-muted)); margin-bottom:3px;">Onboarding ${onboardPct}%</div>
            <div style="background:hsl(var(--border)); border-radius:4px; height:5px; width:70px; overflow:hidden;"><div style="background:hsl(var(--primary)); height:100%; width:${onboardPct}%;"></div></div>
          </div>
          <span class="badge ${isSuspended ? 'badge-danger' : 'badge-success'}">${isSuspended ? 'Suspended' : 'Active'}</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-secondary" style="font-size:0.75rem; padding:6px 10px;" data-action="hr-edit" data-user-id="${u.id}"><i class="fa-solid fa-pen"></i> Edit</button>
            <button class="btn btn-secondary" style="font-size:0.75rem; padding:6px 10px;" data-action="hr-toggle" data-user-id="${u.id}"><i class="fa-solid ${isSuspended ? 'fa-circle-play' : 'fa-circle-pause'}"></i> ${isSuspended ? 'Activate' : 'Suspend'}</button>
            <button class="btn btn-danger" style="font-size:0.75rem; padding:6px 10px;" data-action="hr-delete" data-user-id="${u.id}" data-user-name="${u.name}"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </div>
      `;
    }).join('')}
  </div>`;
}

function showHrEditModal(targetUser, container) {
  const normalized = getNormalizedChecklist(targetUser);
  showModal({
    title: `Edit User: ${targetUser.name}`,
    bodyHTML: `
      <form id="hr-edit-form">
        <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" type="text" id="hr-edit-name" required value="${targetUser.name}"></div>
        <div class="form-group"><label class="form-label">Phone Number</label><input class="form-input" type="tel" id="hr-edit-phone" value="${targetUser.phone || ''}" placeholder="07123456789"></div>
        <div class="form-group"><label class="form-label">Emergency Contact</label><input class="form-input" type="text" id="hr-edit-emergency" value="${targetUser.emergencyContact || ''}" placeholder="Name: 07123456789"></div>
        <div class="form-group"><label class="form-label">Trade / Craft</label><input class="form-input" type="text" id="hr-edit-trade" value="${targetUser.trade || ''}" placeholder="e.g. Electrician"></div>
        <div class="form-group"><label class="form-label">Qualifications</label><input class="form-input" type="text" id="hr-edit-quals" value="${targetUser.qualifications || ''}" placeholder="e.g. CSCS, First Aid"></div>
        <div class="form-group"><label class="form-label">CSCS Card Expiry</label><input class="form-input" type="date" id="hr-edit-cscs" value="${targetUser.cscsExpiry || ''}"></div>
        <div class="form-group">
          <label class="form-label">System Role</label>
          <select class="form-input" id="hr-edit-role">
            <option value="operative" ${targetUser.role === 'operative' ? 'selected' : ''}>Operative (Field Engineer)</option>
            <option value="manager" ${targetUser.role === 'manager' ? 'selected' : ''}>Manager (Office Admin)</option>
            <option value="admin" ${targetUser.role === 'admin' ? 'selected' : ''}>Administrator (Superuser)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" style="margin-bottom:8px;">Colour Code</label>
          <input type="hidden" id="hr-edit-color" value="${targetUser.color || '#3b82f6'}">
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            ${COLOR_PALETTE.map(c => `<button type="button" class="hr-color-btn" style="width:30px; height:30px; border-radius:50%; border:3px solid ${(targetUser.color||'#3b82f6')===c?'hsl(var(--primary))':'transparent'}; background:${c}; cursor:pointer; outline:none; box-shadow:0 0 0 1px rgba(0,0,0,0.15);" onclick="this.closest('.form-group').querySelectorAll('.hr-color-btn').forEach(b=>b.style.borderColor='transparent'); this.style.borderColor='hsl(var(--primary))'; document.getElementById('hr-edit-color').value='${c}';"></button>`).join('')}
          </div>
        </div>
        
        <div style="margin-top:20px; border-top:1px solid hsl(var(--border)); padding-top:16px;">
          <h4 style="font-weight:700; margin-bottom:12px; font-size:0.95rem; color:hsl(var(--primary));">Manage Onboarding Checklist</h4>
          <div id="hr-edit-checklist-container" style="display:flex; flex-direction:column; gap:10px; margin-bottom:12px;">
            ${normalized.map((item, idx) => `
              <div class="checklist-edit-row" data-idx="${idx}" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px; border:1px solid hsl(var(--border)/0.5); border-radius:6px; background:hsl(var(--bg-primary)/0.2);">
                <input type="checkbox" class="checklist-edit-checked" ${item.checked ? 'checked' : ''} style="width:16px; height:16px;">
                <input type="text" class="form-input checklist-edit-title" value="${item.title}" placeholder="Item Title" style="flex:2; min-width:140px; font-size:0.8rem; padding:4px 8px;">
                <div style="display:flex; gap:4px; flex:3; min-width:240px;">
                  <div style="flex:1;">
                    <label style="font-size:0.65rem; color:hsl(var(--text-muted)); display:block;">Completed</label>
                    <input type="date" class="form-input checklist-edit-compdate" value="${item.completedDate || ''}" style="font-size:0.75rem; padding:2px 4px; width:100%;">
                  </div>
                  <div style="flex:1;">
                    <label style="font-size:0.65rem; color:hsl(var(--text-muted)); display:block;">Expires</label>
                    <input type="date" class="form-input checklist-edit-expdate" value="${item.expiryDate || ''}" style="font-size:0.75rem; padding:2px 4px; width:100%;">
                  </div>
                </div>
                <button type="button" class="btn-delete-checklist-row" style="background:none; border:none; color:hsl(var(--danger)); cursor:pointer; padding:6px;" title="Delete Item">
                  <i class="fa-solid fa-trash-can" style="font-size: 0.85rem;"></i>
                </button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn btn-secondary" id="btn-add-checklist-item" style="font-size:0.8rem; padding:6px 12px; width:100%; justify-content:center;">
            <i class="fa-solid fa-plus"></i> Add Checklist Item
          </button>
        </div>
      </form>
    `,
    confirmText: 'Save Changes',
    onConfirm: async (body) => {
      const checklistRows = body.querySelectorAll('.checklist-edit-row');
      const updatedChecklist = Array.from(checklistRows).map(row => {
        const title = row.querySelector('.checklist-edit-title').value.trim();
        const checked = row.querySelector('.checklist-edit-checked').checked;
        const completedDate = row.querySelector('.checklist-edit-compdate').value;
        const expiryDate = row.querySelector('.checklist-edit-expdate').value;
        return { title, checked, completedDate, expiryDate };
      }).filter(item => item.title !== '');

      const updates = {
        name: body.querySelector('#hr-edit-name').value,
        phone: body.querySelector('#hr-edit-phone').value,
        emergencyContact: body.querySelector('#hr-edit-emergency').value,
        trade: body.querySelector('#hr-edit-trade').value,
        qualifications: body.querySelector('#hr-edit-quals').value,
        cscsExpiry: body.querySelector('#hr-edit-cscs').value,
        role: body.querySelector('#hr-edit-role').value,
        color: body.querySelector('#hr-edit-color').value,
        onboardingChecklist: updatedChecklist
      };
      try {
        await updateUser(targetUser.id, updates);
        showToast("User updated.", "success");
        hideModal();
        init(container);
      } catch (err) { showToast(err.message, "error"); }
    }
  });

  const addChecklistItemBtn = document.getElementById('btn-add-checklist-item');
  const checklistContainer = document.getElementById('hr-edit-checklist-container');
  if (addChecklistItemBtn && checklistContainer) {
    addChecklistItemBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'checklist-edit-row';
      row.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px; border:1px solid hsl(var(--border)/0.5); border-radius:6px; background:hsl(var(--bg-primary)/0.2);';
      row.innerHTML = `
        <input type="checkbox" class="checklist-edit-checked" style="width:16px; height:16px;">
        <input type="text" class="form-input checklist-edit-title" placeholder="New Item Title" style="flex:2; min-width:140px; font-size:0.8rem; padding:4px 8px;">
        <div style="display:flex; gap:4px; flex:3; min-width:240px;">
          <div style="flex:1;">
            <label style="font-size:0.65rem; color:hsl(var(--text-muted)); display:block;">Completed</label>
            <input type="date" class="form-input checklist-edit-compdate" style="font-size:0.75rem; padding:2px 4px; width:100%;">
          </div>
          <div style="flex:1;">
            <label style="font-size:0.65rem; color:hsl(var(--text-muted)); display:block;">Expires</label>
            <input type="date" class="form-input checklist-edit-expdate" style="font-size:0.75rem; padding:2px 4px; width:100%;">
          </div>
        </div>
        <button type="button" class="btn-delete-checklist-row" style="background:none; border:none; color:hsl(var(--danger)); cursor:pointer; padding:6px;" title="Delete Item">
          <i class="fa-solid fa-trash-can" style="font-size: 0.85rem;"></i>
        </button>
      `;
      checklistContainer.appendChild(row);
      row.querySelector('.btn-delete-checklist-row').addEventListener('click', () => {
        row.remove();
      });
    });

    checklistContainer.querySelectorAll('.btn-delete-checklist-row').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.checklist-edit-row').remove();
      });
    });
  }
}

function setupAdminHrEvents(container, users, currentUser) {
  const searchInput = document.getElementById('hr-roster-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.hr-roster-row').forEach(row => {
        row.style.display = (row.dataset.name.includes(q) || row.dataset.role.includes(q)) ? '' : 'none';
      });
    });
  }

  container.querySelectorAll('button[data-action="hr-edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = users.find(u => u.id === btn.dataset.userId);
      if (u) showHrEditModal(u, container);
    });
  });

  container.querySelectorAll('button[data-action="hr-toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const u = users.find(u => u.id === btn.dataset.userId);
      if (!u) return;
      const next = u.status === 'suspended' ? 'active' : 'suspended';
      await updateUser(u.id, { status: next });
      showToast(`${u.name} is now ${next}.`, next === 'active' ? 'success' : 'warning');
      init(container);
    });
  });

  container.querySelectorAll('button[data-action="hr-delete"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const uId = btn.dataset.userId;
      const uName = btn.dataset.userName;
      if (uId === currentUser.id) { showToast("You cannot delete your own account.", "error"); return; }
      showModal({
        title: `Delete ${uName}?`,
        bodyHTML: `
          <div style="text-align:center; padding:8px 0;">
            <i class="fa-solid fa-circle-exclamation" style="font-size:2.5rem; color:hsl(var(--danger)); margin-bottom:12px; display:block;"></i>
            <p style="font-weight:700; margin-bottom:8px;">This cannot be undone.</p>
            <p style="color:hsl(var(--text-muted)); font-size:0.9rem; line-height:1.6;">
              <strong>${uName}</strong> will be permanently removed from the system. Their shifts and history remain, but they will lose access.
            </p>
          </div>
        `,
        confirmText: 'Yes, Delete User',
        cancelText: 'Cancel',
        onConfirm: async () => {
          try {
            await deleteUser(uId);
            showToast(`${uName} deleted.`, "success");
            hideModal();
            init(container);
          } catch (err) { showToast(err.message, "error"); }
        }
      });
    });
  });

  container.querySelectorAll('button[data-action="approve-leave"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await updateHolidayStatus(btn.dataset.reqId, 'approved', currentUser.id);
      showToast("Leave approved.", "success");
      init(container);
    });
  });

  container.querySelectorAll('button[data-action="reject-leave"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await updateHolidayStatus(btn.dataset.reqId, 'rejected', currentUser.id);
      showToast("Leave rejected.", "warning");
      init(container);
    });
  });
}

export function destroy() {}
