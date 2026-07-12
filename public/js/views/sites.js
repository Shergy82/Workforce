import { getCurrentUser, isManager } from '../auth.js';
import { getSites, createSite, getUsers } from '../db.js';
import { getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderSitesList(container, user);
}

async function renderSitesList(container, user) {
  try {
    const [sites, users] = await Promise.all([
      getSites(),
      getUsers()
    ]);

    let headerHTML = '';
    if (isManager()) {
      headerHTML = `
        <div style="display:flex; justify-content:flex-end; margin-bottom:20px;">
          <button class="btn btn-primary" id="btn-new-site"><i class="fa-solid fa-plus"></i> Add New Site Address</button>
        </div>
      `;
    }

    const schemes = [...new Set(sites.map(s => s.scheme || s.client || 'General').filter(Boolean))];

    container.innerHTML = `
      ${headerHTML}
      <div class="card" style="padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <input class="form-input" type="text" id="site-search" placeholder="Search by E-Number, address, or scheme..." style="max-width: 400px; flex: 1;">
          <select class="form-input" id="site-status-filter" style="max-width: 200px;">
            <option value="all">All Statuses</option>
            <option value="active" selected>Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select class="form-input" id="site-scheme-filter" style="max-width: 200px;">
            <option value="all">All Schemes</option>
            ${schemes.map(sch => `<option value="${sch}">${sch}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="dashboard-grid" id="sites-grid-mount">
        ${renderSitesGrid(sites.filter(s => s.status === 'active'))}
      </div>
    `;

    setupSiteListEvents(container, sites, users);
  } catch (err) {
    console.error("Error loading sites:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading sites list: ${err.message}</p></div>`;
  }
}

function renderSitesGrid(sites) {
  if (sites.length === 0) {
    return `
      <div class="card" style="grid-column: span 3; text-align: center; padding: 40px 0; color: hsl(var(--text-muted));">
        <i class="fa-solid fa-map-location-dot fa-3x" style="margin-bottom:16px; opacity:0.4;"></i>
        <p>No site addresses match the selected criteria.</p>
      </div>
    `;
  }

  return sites.map(site => `
    <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-left: 5px solid ${site.status === 'active' ? 'hsl(var(--success))' : 'hsl(var(--text-muted))'};">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
          <span style="font-weight: 700; font-size: 0.8rem; color: hsl(var(--text-muted)); text-transform: uppercase; background-color: hsl(var(--primary)/0.08); padding: 4px 8px; border-radius: 4px;">
            Scheme: ${site.scheme || site.client || 'General'}
          </span>
          <span class="badge ${site.status === 'active' ? 'badge-success' : 'badge-danger'}">${site.status}</span>
        </div>
        
        <!-- Prominent E-Number -->
        <h3 style="font-weight: 800; font-size: 1.45rem; color: hsl(var(--primary)); margin-bottom: 4px; letter-spacing: -0.02em;">
          ${site.eNumber || 'No E-Number'}
        </h3>
        
        <!-- Address -->
        <h5 style="font-weight: 600; font-size: 0.95rem; color: hsl(var(--text-main)); margin-bottom: 8px;">
          ${site.address}
        </h5>
        
        <p style="font-size: 0.82rem; color: hsl(var(--text-muted)); margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">
          ${site.description || 'No description provided.'}
        </p>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 16px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 12px;">
        <button class="btn btn-primary" style="flex: 1; font-size: 0.8rem; padding: 8px;" onclick="location.hash='#/site-detail?id=${site.id}'">
          <i class="fa-solid fa-folder-open"></i> Central Record
        </button>
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}" target="_blank" class="btn btn-secondary" style="font-size: 0.8rem; padding: 8px 12px;">
          <i class="fa-solid fa-location-arrow"></i> Map
        </a>
      </div>
    </div>
  `).join('');
}

function setupSiteListEvents(container, allSites, allUsers) {
  const search = document.getElementById('site-search');
  const statusFilter = document.getElementById('site-status-filter');
  const schemeFilter = document.getElementById('site-scheme-filter');
  const gridMount = document.getElementById('sites-grid-mount');

  const managers = allUsers.filter(u => u.role === 'admin' || u.role === 'manager' || u.role === 'owner');
  const relevantPeople = allUsers.filter(u => u.role === 'operative' || u.role === 'supervisor');

  function filterSites() {
    const q = search.value.toLowerCase().trim();
    const statusVal = statusFilter.value;
    const schemeVal = schemeFilter ? schemeFilter.value : 'all';

    const filtered = allSites.filter(s => {
      const matchSearch = s.address.toLowerCase().includes(q) || 
                          (s.scheme || s.client || '').toLowerCase().includes(q) ||
                          (s.eNumber || '').toLowerCase().includes(q);
      const matchStatus = statusVal === 'all' || s.status === statusVal;
      const matchScheme = schemeVal === 'all' || (s.scheme || s.client || 'General') === schemeVal;
      return matchSearch && matchStatus && matchScheme;
    });

    gridMount.innerHTML = renderSitesGrid(filtered);
  }

  if (search) search.addEventListener('input', filterSites);
  if (statusFilter) statusFilter.addEventListener('change', filterSites);
  if (schemeFilter) schemeFilter.addEventListener('change', filterSites);

  const newBtn = document.getElementById('btn-new-site');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      showModal({
        title: 'Add New Site Address',
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
              <input class="form-input" type="text" id="new-site-scheme" required placeholder="e.g. Contract Scheme Name">
            </div>
            <div class="form-group">
              <label class="form-label" for="new-site-desc">Job Description</label>
              <textarea class="form-input" id="new-site-desc" rows="3" required placeholder="Outline the main work to be done..."></textarea>
            </div>
            <div class="form-group">
              <label class="form-label" for="new-site-notes">Operational Notes</label>
              <textarea class="form-input" id="new-site-notes" rows="2" placeholder="Gate codes, PPE, hazards..."></textarea>
            </div>
            
            <div class="form-group">
              <label class="form-label">Specific Site Managers (Optional Override)</label>
              <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${managers.map(m => `
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="site-managers" value="${m.id}">
                    <span>${m.name} (${m.role})</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Specific Relevant People (Optional Override)</label>
              <div style="max-height: 100px; overflow-y: auto; border: 1px solid hsl(var(--border)); padding: 8px; border-radius: 6px; background-color: hsl(var(--bg-primary)/0.1);">
                ${relevantPeople.map(p => `
                  <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; margin-bottom: 4px; cursor: pointer; color: hsl(var(--text-main));">
                    <input type="checkbox" name="site-relevant" value="${p.id}">
                    <span>${p.name} (${p.trade || p.role})</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </form>
        `,
        confirmText: 'Save Site',
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
            await createSite({
              eNumber, address, scheme, description, notes, status: 'active',
              managerIds: selectedManagers,
              relevantPeopleIds: selectedRelevant,
              files: [], photos: []
            });
            showToast("Site Address saved successfully!", "success");
            hideModal();
            // Reload list
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
