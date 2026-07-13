import { getCurrentUser } from '../auth.js';
import { getShifts } from '../db.js';
import { formatDate, getLoadingSpinner } from '../utils.js';
import { showModal, hideModal } from '../components/modal.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderCompletionsHub(container);
}

async function renderCompletionsHub(container) {
  try {
    const shifts = await getShifts();
    
    // Filter to only completed or incomplete shifts containing photo evidence
    const completedShifts = shifts.filter(s => s.status === 'completed' && s.completionPhotos && s.completionPhotos.length > 0);
    const incompleteShifts = shifts.filter(s => s.status === 'incomplete' && s.incompletePhotos && s.incompletePhotos.length > 0);

    const allEvidence = [
      ...completedShifts.map(s => ({
        id: s.id,
        siteAddress: s.siteAddress,
        userName: s.userName,
        date: s.date,
        task: s.task,
        status: 'completed',
        notes: s.completionNotes || 'No notes provided.',
        photos: s.completionPhotos
      })),
      ...incompleteShifts.map(s => ({
        id: s.id,
        siteAddress: s.siteAddress,
        userName: s.userName,
        date: s.date,
        task: s.task,
        status: 'incomplete',
        notes: `Reason: ${s.incompleteReason || 'No reason specified.'}`,
        photos: s.incompletePhotos
      }))
    ].sort((a, b) => b.date.localeCompare(a.date));

    container.innerHTML = `
      <div class="card" style="padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
          <input class="form-input" type="text" id="completions-search" placeholder="Filter by engineer, site address, task..." style="max-width: 350px; flex: 1;">
          
          <select class="form-input" id="completions-status-filter" style="max-width: 180px;">
            <option value="all">All Evidence Types</option>
            <option value="completed">Completed Only</option>
            <option value="incomplete">Incomplete Only</option>
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px;" id="completions-gallery-mount">
        ${renderGroupedGallery(allEvidence)}
      </div>
    `;

    setupCompletionsEvents(container, allEvidence);
  } catch (err) {
    console.error("Error loading completions hub:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading Completion Hub: ${err.message}</p></div>`;
  }
}

function renderGroupedGallery(evidence) {
  if (evidence.length === 0) {
    return `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 40px 0; color: hsl(var(--text-muted));">
        <i class="fa-regular fa-image fa-3x" style="margin-bottom: 16px; opacity: 0.4;"></i>
        <p>No completion or barrier photos matching criteria.</p>
      </div>
    `;
  }

  // Group evidence by siteAddress
  const grouped = {};
  evidence.forEach(item => {
    const key = item.siteAddress || 'General / Unspecified';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(item);
  });

  return Object.keys(grouped).map(siteAddress => {
    const evidenceList = grouped[siteAddress];
    
    // Compile all photos for this property
    const allPhotos = [];
    evidenceList.forEach(item => {
      item.photos.forEach(url => {
        allPhotos.push({ url, item });
      });
    });

    const completedCount = evidenceList.filter(e => e.status === 'completed').length;
    const incompleteCount = evidenceList.filter(e => e.status === 'incomplete').length;

    return `
      <div class="card" style="margin-bottom: 0; padding: 20px; display: flex; flex-direction: column; gap: 16px; border-top: 5px solid hsl(var(--primary)); box-shadow: var(--shadow-sm);">
        <!-- Property Header -->
        <div style="border-bottom: 1px solid hsl(var(--border)/0.5); padding-bottom: 12px; display: flex; justify-content: space-between; align-items: start; gap: 12px;">
          <div style="min-width: 0; flex: 1;">
            <h4 style="font-weight: 800; font-size: 1.1rem; color: hsl(var(--primary)); margin: 0; line-height: 1.35; word-break: break-word;">
              <i class="fa-solid fa-map-location-dot" style="margin-right: 6px; opacity: 0.8;"></i> ${siteAddress}
            </h4>
            <div style="display: flex; gap: 8px; font-size: 0.72rem; color: hsl(var(--text-muted)); font-weight: 600; margin-top: 4px; flex-wrap: wrap;">
              <span>${evidenceList.length} ${evidenceList.length === 1 ? 'Record' : 'Records'}</span>
              <span>&bull;</span>
              <span style="color: hsl(var(--success));">${completedCount} Completed</span>
              ${incompleteCount > 0 ? `
                <span>&bull;</span>
                <span style="color: hsl(var(--danger));">${incompleteCount} Barrier</span>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Compiled Photo Grid -->
        <div>
          <strong style="font-size: 0.72rem; text-transform: uppercase; color: hsl(var(--text-muted)); letter-spacing: 0.05em; display: block; margin-bottom: 8px;">Compiled Photo Gallery</strong>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; max-height: 170px; overflow-y: auto; padding-right: 4px;">
            ${allPhotos.map(photo => `
              <div class="completion-photo-thumb" data-shift-id="${photo.item.id}" style="aspect-ratio: 1; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid hsl(var(--border)); cursor: pointer; position: relative; background-color: #000; transition: transform 0.15s ease;">
                <img src="${photo.url}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
                <span class="status-badge status-${photo.item.status}" style="position: absolute; bottom: 2px; right: 2px; font-size: 0.5rem; padding: 1px 3px; border-radius: 2px;">
                  ${photo.item.status === 'completed' ? 'Comp' : 'Barr'}
                </span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Evidence History Log -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <strong style="font-size: 0.72rem; text-transform: uppercase; color: hsl(var(--text-muted)); letter-spacing: 0.05em;">History Log</strong>
          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding-right: 4px;">
            ${evidenceList.map(item => `
              <div class="completion-row-item" data-shift-id="${item.id}" style="padding: 8px 10px; background-color: hsl(var(--bg-primary)/0.3); border-radius: var(--radius-sm); border: 1px solid hsl(var(--border)/0.4); border-left: 4px solid ${item.status === 'completed' ? 'hsl(var(--success))' : 'hsl(var(--danger))'}; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: var(--transition);">
                <div style="min-width: 0; flex: 1; padding-right: 8px;">
                  <div style="font-weight: 700; font-size: 0.78rem; color: hsl(var(--text-main)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.task}</div>
                  <div style="font-size: 0.68rem; color: hsl(var(--text-muted)); margin-top: 2px; display: flex; gap: 6px; flex-wrap: wrap;">
                    <span>By ${item.userName}</span>
                    <span>&bull;</span>
                    <span>${formatDate(item.date)}</span>
                  </div>
                </div>
                <i class="fa-solid fa-chevron-right" style="font-size: 0.7rem; color: hsl(var(--text-muted));"></i>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showEvidenceDetailModal(item) {
  const isCompleted = item.status === 'completed';
  const modalHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px; text-align: left;">
      <div style="padding: 12px; background: hsl(var(--bg-primary)/0.6); border-radius: 8px; border: 1px solid hsl(var(--border)/0.5); font-size: 0.85rem; display: flex; flex-direction: column; gap: 6px;">
        <div><strong>Property:</strong> ${item.siteAddress}</div>
        <div><strong>Task:</strong> ${item.task}</div>
        <div><strong>Engineer:</strong> ${item.userName}</div>
        <div><strong>Date:</strong> ${formatDate(item.date)}</div>
        <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
          <strong>Status:</strong> 
          <span class="status-badge status-${item.status}" style="font-size: 0.7rem;">${item.status}</span>
        </div>
      </div>

      <div>
        <strong style="display: block; margin-bottom: 6px; font-size: 0.8rem; text-transform: uppercase; color: hsl(var(--text-muted)); letter-spacing: 0.05em;">
          ${isCompleted ? 'Completion Notes' : 'Barrier Description'}
        </strong>
        <div style="padding: 12px; background-color: hsl(var(--bg-primary)/0.3); border-radius: 6px; border-left: 4px solid ${isCompleted ? 'hsl(var(--success))' : 'hsl(var(--danger))'}; font-size: 0.85rem; font-style: italic; color: hsl(var(--text-main)); line-height: 1.4; word-break: break-word;">
          ${item.notes}
        </div>
      </div>

      <div>
        <strong style="display: block; margin-bottom: 8px; font-size: 0.8rem; text-transform: uppercase; color: hsl(var(--text-muted)); letter-spacing: 0.05em;">Evidence Photos</strong>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${item.photos.map(url => `
            <img src="${url}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid hsl(var(--border)); cursor: pointer; transition: transform 0.15s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onclick="window.open('${url}')">
          `).join('')}
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 10px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 16px;">
        <button class="btn btn-primary" id="btn-modal-view-record" style="flex: 1; justify-content: center; gap: 8px;">
          <i class="fa-solid fa-file-invoice"></i> View Shift Record
        </button>
        <button class="btn btn-secondary" id="btn-modal-close">Close</button>
      </div>
    </div>
  `;

  showModal({
    title: 'Evidence Details',
    bodyHTML: modalHTML,
    showFooter: false
  });

  document.getElementById('btn-modal-close').addEventListener('click', () => hideModal());
  document.getElementById('btn-modal-view-record').addEventListener('click', () => {
    hideModal();
    location.hash = `#/shift-detail?id=${item.id}`;
  });
}

function setupCompletionsEvents(container, allEvidence) {
  const searchInput = document.getElementById('completions-search');
  const statusFilter = document.getElementById('completions-status-filter');
  const galleryMount = document.getElementById('completions-gallery-mount');

  function filterEvidence() {
    const q = searchInput.value.toLowerCase().trim();
    const statusVal = statusFilter.value;

    const filtered = allEvidence.filter(item => {
      const matchSearch = item.userName.toLowerCase().includes(q) || 
                          item.siteAddress.toLowerCase().includes(q) || 
                          item.task.toLowerCase().includes(q) ||
                          item.notes.toLowerCase().includes(q);
      const matchStatus = statusVal === 'all' || item.status === statusVal;
      return matchSearch && matchStatus;
    });

    galleryMount.innerHTML = renderGroupedGallery(filtered);
  }

  searchInput.addEventListener('input', filterEvidence);
  statusFilter.addEventListener('change', filterEvidence);

  // Detail Modal click handler
  galleryMount.addEventListener('click', (e) => {
    const thumb = e.target.closest('.completion-photo-thumb');
    const row = e.target.closest('.completion-row-item');
    const target = thumb || row;
    
    if (target) {
      const shiftId = target.getAttribute('data-shift-id');
      const item = allEvidence.find(x => x.id === shiftId);
      if (item) {
        showEvidenceDetailModal(item);
      }
    }
  });
}

export function destroy() {}

