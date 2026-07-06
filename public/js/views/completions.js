import { getCurrentUser } from '../auth.js';
import { getShifts } from '../db.js';
import { formatDate, getLoadingSpinner } from '../utils.js';

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

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;" id="completions-gallery-mount">
        ${renderGalleryCards(allEvidence)}
      </div>
    `;

    setupCompletionsEvents(container, allEvidence);
  } catch (err) {
    console.error("Error loading completions hub:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading Completion Hub: ${err.message}</p></div>`;
  }
}

function renderGalleryCards(evidence) {
  if (evidence.length === 0) {
    return `
      <div class="card" style="grid-column: span 4; text-align: center; padding: 40px 0; color: hsl(var(--text-muted));">
        <i class="fa-regular fa-image fa-3x" style="margin-bottom: 16px; opacity: 0.4;"></i>
        <p>No completion or barrier photos matching criteria.</p>
      </div>
    `;
  }

  return evidence.map(item => {
    const isCompleted = item.status === 'completed';
    return `
      <div class="card" style="margin-bottom: 0; padding: 16px; display: flex; flex-direction: column; gap: 12px; border-top: 4px solid ${isCompleted ? 'hsl(var(--success))' : 'hsl(var(--danger))'};">
        <!-- Photo carousel or first photo display -->
        <div style="aspect-ratio: 4/3; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid hsl(var(--border)); background-color: #000; position: relative;">
          <img src="${item.photos[0]}" style="width: 100%; height: 100%; object-fit: contain; cursor: pointer;" onclick="window.open('${item.photos[0]}')">
          <span class="status-badge status-${item.status}" style="position: absolute; bottom: 8px; right: 8px; font-size: 0.6rem;">
            ${item.status}
          </span>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
            <span style="font-weight: 700; font-size: 0.85rem; color: hsl(var(--text-main));">${item.userName}</span>
            <span style="font-size: 0.75rem; color: hsl(var(--text-muted));">${formatDate(item.date)}</span>
          </div>
          
          <div style="font-size: 0.8rem; font-weight: 600; color: hsl(var(--primary)); max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px;">
            <i class="fa-solid fa-location-dot"></i> ${item.siteAddress}
          </div>

          <div style="font-size: 0.75rem; color: hsl(var(--text-muted)); font-weight: 500; margin-bottom: 8px;">
            Task: ${item.task}
          </div>

          <div style="padding: 8px; background-color: hsl(var(--bg-primary)/0.6); border-radius: 4px; font-size: 0.8rem; min-height: 50px; overflow-y: auto;">
            <strong>${isCompleted ? 'Notes:' : 'Barrier:'}</strong><br>
            <span style="color: hsl(var(--text-main)); font-style: italic;">${item.notes}</span>
          </div>
        </div>

        <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 6px 12px; align-self: flex-end; margin-top: auto;" onclick="location.hash='#/shift-detail?id=${item.id}'">
          View Shift Record
        </button>
      </div>
    `;
  }).join('');
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

    galleryMount.innerHTML = renderGalleryCards(filtered);
  }

  searchInput.addEventListener('input', filterEvidence);
  statusFilter.addEventListener('change', filterEvidence);
}

export function destroy() {}
