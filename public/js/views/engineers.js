import { getCurrentUser, isManager } from '../auth.js';
import { getUsers, createUser, updateUser } from '../db.js';
import { getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';

const COLOR_PALETTE = [
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Fuchsia', hex: '#d946ef' },
  { name: 'Slate', hex: '#64748b' },
  { name: 'Brown', hex: '#9a3412' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Sage', hex: '#78909c' },
  { name: 'Mint', hex: '#2e8b57' },
  { name: 'Crimson', hex: '#dc2626' },
  { name: 'Plum', hex: '#86198f' },
  { name: 'Navy', hex: '#1e3a8a' }
];

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderEngineersList(container, user);
}

async function renderEngineersList(container, user) {
  try {
    const users = await getUsers();
    const operatives = users.filter(u => u.role === 'operative');
    const management = users.filter(u => u.role !== 'operative');

    let headerHTML = '';
    if (isManager()) {
      headerHTML = `
        <div style="display:flex; justify-content:flex-end; margin-bottom:20px;">
          <button class="btn btn-primary" id="btn-add-engineer"><i class="fa-solid fa-user-plus"></i> Add New Engineer</button>
        </div>
      `;
    }

    container.innerHTML = `
      ${headerHTML}

      <!-- Field Operatives List -->
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-title">Field Engineers & Operatives Directory</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Trade / Craft</th>
                <th>Contact Details</th>
                <th>Status</th>
                ${isManager() ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${operatives.map(o => `
                <tr>
                  <td>
                    <div style="font-weight: 700; color: hsl(var(--primary)); display: flex; align-items: center; gap: 8px;">
                      <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${o.color || '#3b82f6'}; display: inline-block; border: 1px solid rgba(0,0,0,0.15);" title="Colour Code"></span>
                      ${o.name}
                    </div>
                    <div style="font-size: 0.75rem; color: hsl(var(--text-muted)); font-family: monospace;">ID: ${o.id}</div>
                  </td>
                  <td>
                    <span class="badge badge-info" style="border-radius: 4px; font-weight: 600;"><i class="fa-solid fa-screwdriver-wrench"></i> ${o.trade || 'General Operative'}</span>
                  </td>
                  <td style="font-size: 0.85rem;">
                    <div><i class="fa-regular fa-envelope"></i> ${o.email}</div>
                    <div style="margin-top: 2px;"><i class="fa-solid fa-phone"></i> ${o.phone || 'No phone registered'}</div>
                  </td>
                  <td>
                    <span class="badge ${o.status === 'active' ? 'badge-success' : 'badge-danger'}">${o.status || 'active'}</span>
                  </td>
                  ${isManager() ? `
                    <td>
                      <div style="display: flex; gap: 6px;">
                        <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 4px 8px;" data-action="toggle-status" data-user-id="${o.id}">
                          ${o.status === 'suspended' ? 'Activate' : 'Suspend'}
                        </button>
                        <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 4px 8px;" data-action="edit-details" data-user-id="${o.id}">
                          Edit
                        </button>
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
              ${operatives.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 20px 0; color: hsl(var(--text-muted));">No operatives found.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Management / Admin List -->
      <div class="card">
        <div class="card-title">Management & Admin Staff</div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email Address</th>
                <th>Phone Number</th>
                ${isManager() ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${management.map(m => `
                <tr>
                  <td style="font-weight: 600;">${m.name}</td>
                  <td><span class="badge badge-info" style="background-color: hsl(var(--accent)/0.15); color: hsl(var(--accent));">${m.role}</span></td>
                  <td>${m.email}</td>
                  <td>${m.phone || 'N/A'}</td>
                  ${isManager() ? `
                    <td>
                      <div style="display: flex; gap: 6px;">
                        <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 4px 8px;" data-action="toggle-status" data-user-id="${m.id}">
                          ${m.status === 'suspended' ? 'Activate' : 'Suspend'}
                        </button>
                        <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 4px 8px;" data-action="edit-details" data-user-id="${m.id}">
                          Edit
                        </button>
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
              ${management.length === 0 ? `<tr><td colspan="${isManager() ? '5' : '4'}" style="text-align:center; padding: 20px 0; color: hsl(var(--text-muted));">No management staff found.</td></tr>` : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    setupEngineerEvents(container, users);
  } catch (err) {
    console.error("Error loading roster:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading engineers list: ${err.message}</p></div>`;
  }
}

function setupEngineerEvents(container, allUsers) {
  // Toggle active/suspend status
  container.querySelectorAll('button[data-action="toggle-status"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uId = btn.getAttribute('data-user-id');
      const targetUser = allUsers.find(u => u.id === uId);
      if (!targetUser) return;

      const nextStatus = targetUser.status === 'suspended' ? 'active' : 'suspended';
      if (confirm(`Change status for ${targetUser.name} to ${nextStatus.toUpperCase()}?`)) {
        try {
          await updateUser(uId, { status: nextStatus });
          showToast(`Status updated for ${targetUser.name}.`, "success");
          init(container);
        } catch (err) {
          showToast(err.message, "error");
        }
      }
    });
  });

  // Edit operative details (Trade and Phone)
  container.querySelectorAll('button[data-action="edit-details"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const uId = btn.getAttribute('data-user-id');
      const targetUser = allUsers.find(u => u.id === uId);
      if (!targetUser) return;

      showModal({
        title: `Edit Details: ${targetUser.name}`,
        bodyHTML: `
          <form id="edit-engineer-form">
            <div class="form-group">
              <label class="form-label" for="edit-eng-phone">Phone Number</label>
              <input class="form-input" type="tel" id="edit-eng-phone" required value="${targetUser.phone || ''}">
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-eng-trade">Trade / Craft</label>
              <input class="form-input" type="text" id="edit-eng-trade" required value="${targetUser.trade || ''}" placeholder="e.g. Electrician, Carpenter, Welder">
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-eng-role">System Role / Permissions</label>
              <select class="form-input" id="edit-eng-role">
                <option value="operative" ${targetUser.role === 'operative' ? 'selected' : ''}>Operative (Field Engineer)</option>
                <option value="manager" ${targetUser.role === 'manager' ? 'selected' : ''}>Manager (Office Admin)</option>
                <option value="admin" ${targetUser.role === 'admin' ? 'selected' : ''}>Administrator (Superuser)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 700; margin-bottom: 8px;">Colour Code</label>
              <input type="hidden" id="edit-eng-color" value="${targetUser.color || '#3b82f6'}">
              <div class="color-palette-picker" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; align-items: center;">
                ${COLOR_PALETTE.map(c => `
                  <button type="button" class="color-palette-btn" data-color="${c.hex}" title="${c.name}" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid ${(targetUser.color || '#3b82f6') === c.hex ? 'hsl(var(--primary))' : 'transparent'}; background-color: ${c.hex}; cursor: pointer; transition: all 0.2s ease; outline: none; box-shadow: 0 0 0 1px rgba(0,0,0,0.15);" onclick="
                    this.parentElement.querySelectorAll('.color-palette-btn, .custom-color-picker-label').forEach(btn => btn.style.borderColor = 'transparent');
                    this.style.borderColor = 'hsl(var(--primary))';
                    document.getElementById('edit-eng-color').value = '${c.hex}';
                  "></button>
                `).join('')}
                <label class="custom-color-picker-label" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid ${(!COLOR_PALETTE.some(c => c.hex === (targetUser.color || '#3b82f6'))) ? 'hsl(var(--primary))' : 'transparent'}; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); transition: all 0.2s; position: relative; box-shadow: 0 0 0 1px rgba(0,0,0,0.15);" title="Custom Color">
                  <input type="color" value="${targetUser.color || '#3b82f6'}" style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;" oninput="
                    this.parentElement.parentElement.querySelectorAll('.color-palette-btn, .custom-color-picker-label').forEach(btn => btn.style.borderColor = 'transparent');
                    this.parentElement.style.borderColor = 'hsl(var(--primary))';
                    document.getElementById('edit-eng-color').value = this.value;
                  ">
                  <i class="fa-solid fa-plus" style="color: white; text-shadow: 0px 0px 3px rgba(0,0,0,0.8); font-size: 0.8rem;"></i>
                </label>
              </div>
            </div>
          </form>
        `,
        confirmText: 'Save Changes',
        onConfirm: async (body) => {
          const phone = body.querySelector('#edit-eng-phone').value;
          const trade = body.querySelector('#edit-eng-trade').value;
          const role = body.querySelector('#edit-eng-role').value;
          const color = body.querySelector('#edit-eng-color').value;

          try {
            await updateUser(uId, { phone, trade, color, role });
            showToast("User details updated.", "success");
            hideModal();
            init(container);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  });

  // Add Engineer modal
  const addBtn = document.getElementById('btn-add-engineer');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      showModal({
        title: 'Add New Engineer / User',
        bodyHTML: `
          <form id="add-engineer-form">
            <div class="form-group">
              <label class="form-label" for="add-eng-name">Full Name</label>
              <input class="form-input" type="text" id="add-eng-name" required placeholder="e.g. Michael Scofield">
            </div>
            <div class="form-group">
              <label class="form-label" for="add-eng-email">Email Address</label>
              <input class="form-input" type="email" id="add-eng-email" required placeholder="name@company.com">
            </div>
            <div class="form-group">
              <label class="form-label" for="add-eng-phone">Phone Number</label>
              <input class="form-input" type="tel" id="add-eng-phone" required placeholder="e.g. 07123456789">
            </div>
            <div class="form-group">
              <label class="form-label" for="add-eng-trade">Trade / Craft</label>
              <input class="form-input" type="text" id="add-eng-trade" required placeholder="e.g. Plumber, Carpenter, Labourer">
            </div>
            <div class="form-group">
              <label class="form-label" for="add-eng-role">System Role</label>
              <select class="form-input" id="add-eng-role">
                <option value="operative">Operative (Field Engineer)</option>
                <option value="manager">Manager (Office Admin)</option>
                <option value="admin">Administrator (Superuser)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-weight: 700; margin-bottom: 8px;">Colour Code</label>
              <input type="hidden" id="add-eng-color" value="#3b82f6">
              <div class="color-palette-picker" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; align-items: center;">
                ${COLOR_PALETTE.map(c => `
                  <button type="button" class="color-palette-btn" data-color="${c.hex}" title="${c.name}" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid ${c.hex === '#3b82f6' ? 'hsl(var(--primary))' : 'transparent'}; background-color: ${c.hex}; cursor: pointer; transition: all 0.2s ease; outline: none; box-shadow: 0 0 0 1px rgba(0,0,0,0.15);" onclick="
                    this.parentElement.querySelectorAll('.color-palette-btn, .custom-color-picker-label').forEach(btn => btn.style.borderColor = 'transparent');
                    this.style.borderColor = 'hsl(var(--primary))';
                    document.getElementById('add-eng-color').value = '${c.hex}';
                  "></button>
                `).join('')}
                <label class="custom-color-picker-label" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); transition: all 0.2s; position: relative; box-shadow: 0 0 0 1px rgba(0,0,0,0.15);" title="Custom Color">
                  <input type="color" value="#3b82f6" style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;" oninput="
                    this.parentElement.parentElement.querySelectorAll('.color-palette-btn, .custom-color-picker-label').forEach(btn => btn.style.borderColor = 'transparent');
                    this.parentElement.style.borderColor = 'hsl(var(--primary))';
                    document.getElementById('add-eng-color').value = this.value;
                  ">
                  <i class="fa-solid fa-plus" style="color: white; text-shadow: 0px 0px 3px rgba(0,0,0,0.8); font-size: 0.8rem;"></i>
                </label>
              </div>
            </div>
          </form>
        `,
        confirmText: 'Register Engineer',
        onConfirm: async (body) => {
          const name = body.querySelector('#add-eng-name').value;
          const email = body.querySelector('#add-eng-email').value;
          const phone = body.querySelector('#add-eng-phone').value;
          const trade = body.querySelector('#add-eng-trade').value;
          const role = body.querySelector('#add-eng-role').value;
          const color = body.querySelector('#add-eng-color').value;

          if (!name.trim() || !email.trim()) {
            showToast("Name and Email are required.", "error");
            return;
          }

          try {
            // Generate a random ID for mock mode
            const mockId = 'user-' + Math.random().toString(36).substr(2, 9);
            await createUser(mockId, {
              name, email, phone, trade, role, color, status: 'active', pushToken: 'mock-token-' + mockId
            });
            showToast("Engineer registered successfully!", "success");
            hideModal();
            init(container);
          } catch (err) {
            showToast(err.message, "error");
          }
        }
      });
    });
  }
}

export function destroy() {}
