import { getCurrentUser, isManager } from '../auth.js';
import { getShifts, createShift, deleteShift, getProjects, getUsers, createNotification } from '../db.js';
import { formatDate, formatTime, getLoadingSpinner, generateUUID } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderScheduler(container, user);
}

async function renderScheduler(container, user) {
  try {
    const [shifts, projects, users] = await Promise.all([
      getShifts(),
      getProjects(),
      getUsers()
    ]);

    if (isManager()) {
      renderAdminScheduler(container, user, shifts, projects, users);
    } else {
      renderOperativeScheduler(container, user, shifts);
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error loading scheduler: ${err.message}</p>`;
  }
}

// ----------------------------------------------------
// OPERATIVE SCHEDULE VIEW
// ----------------------------------------------------
function renderOperativeScheduler(container, user, shifts) {
  const myShifts = shifts
    .filter(s => s.userId === user.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  container.innerHTML = `
    <div class="card">
      <div class="card-title">My Assigned Shifts</div>
      ${myShifts.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${myShifts.map(s => `
            <div style="border: 1px solid hsl(var(--border)); border-left: 5px solid hsl(var(--primary)); border-radius: var(--radius-sm); padding: 14px; display: flex; flex-direction: column; gap: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; font-size: 1.05rem;">${formatDate(s.date)}</span>
                <span class="badge badge-info">${s.startTime} - ${s.endTime}</span>
              </div>
              <p style="font-weight: 600; color: hsl(var(--primary));">${s.projectTitle}</p>
              <p style="font-size: 0.85rem; color: hsl(var(--text-muted));"><i class="fa-solid fa-location-dot"></i> ${s.siteAddress}</p>
              <p style="font-size: 0.85rem; color: hsl(var(--text-muted));"><i class="fa-solid fa-briefcase"></i> ${s.taskName}</p>
              
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.siteAddress)}" target="_blank" class="btn btn-secondary" style="margin-top: 6px; font-size: 0.8rem; align-self: flex-start; padding: 6px 12px;">
                <i class="fa-solid fa-map-location-dot"></i> Navigate
              </a>
            </div>
          `).join('')}
        </div>
      ` : `
        <p style="color: hsl(var(--text-muted)); font-size: 0.9rem; text-align: center; padding: 30px 0;">No shifts scheduled.</p>
      `}
    </div>
  `;
}

// ----------------------------------------------------
// ADMIN CALENDAR BUILDER
// ----------------------------------------------------
function renderAdminScheduler(container, user, shifts, projects, users) {
  // Calculate month values
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  // Adjust so Monday is first day of week
  const adjustedFirstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  // Render grid elements
  let cellsHTML = '';
  // Empty blocks leading up to first day
  for (let i = 0; i < adjustedFirstDayIndex; i++) {
    cellsHTML += `<div class="calendar-cell" style="background-color:hsl(var(--bg-primary)/0.25);"></div>`;
  }

  // Days list
  for (let day = 1; day <= totalDays; day++) {
    const formattedDay = day.toString().padStart(2, '0');
    const formattedMonth = (currentMonth + 1).toString().padStart(2, '0');
    const dateStr = `${currentYear}-${formattedMonth}-${formattedDay}`;

    // Get shifts for this date
    const dayShifts = shifts.filter(s => s.date === dateStr);

    cellsHTML += `
      <div class="calendar-cell" data-date="${dateStr}">
        <div class="calendar-day-num">${day}</div>
        <div style="display:flex; flex-direction:column; gap:3px; overflow-y:auto; flex:1;">
          ${dayShifts.map(s => {
            const worker = users.find(u => u.id === s.userId) || { name: 'Unknown' };
            return `
              <div class="calendar-shift" draggable="true" data-shift-id="${s.id}" title="${worker.name}: ${s.projectTitle}">
                <strong>${worker.name.split(' ')[0]}</strong>: ${s.startTime}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="card" style="padding: 16px;">
      <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-secondary" id="cal-prev" style="padding: 6px 12px;"><i class="fa-solid fa-chevron-left"></i></button>
          <h3 style="font-weight: 700; width: 140px; text-align: center;">${monthNames[currentMonth]} ${currentYear}</h3>
          <button class="btn btn-secondary" id="cal-next" style="padding: 6px 12px;"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-primary" id="add-shift-btn"><i class="fa-solid fa-plus"></i> Add Shift</button>
          <button class="btn btn-secondary" id="import-shifts-btn"><i class="fa-solid fa-file-import"></i> CSV Import</button>
          <button class="btn btn-secondary" id="export-pdf-btn"><i class="fa-solid fa-file-pdf"></i> Export PDF</button>
        </div>
      </div>

      <div class="calendar-view">
        <div class="calendar-grid-header">
          <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
        </div>
        <div class="calendar-grid">
          ${cellsHTML}
        </div>
      </div>
    </div>

    <!-- Hidden file input for CSV imports -->
    <input type="file" id="csv-file-input" accept=".csv" style="display: none;">
  `;

  // Register Admin events
  setupAdminEvents(user, shifts, projects, users);
}

function setupAdminEvents(user, shifts, projects, users) {
  // Calendar Navigate
  document.getElementById('cal-prev').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    init(document.getElementById('view-mount'));
  });

  document.getElementById('cal-next').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    init(document.getElementById('view-mount'));
  });

  // Export PDF / Print
  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    window.print();
  });

  // CSV Import Trigger
  const csvInput = document.getElementById('csv-file-input');
  document.getElementById('import-shifts-btn').addEventListener('click', () => {
    csvInput.click();
  });

  csvInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csvText = event.target.result;
      await parseAndImportCSV(csvText, projects, users);
    };
    reader.readAsText(file);
  });

  // Add Shift Modal
  document.getElementById('add-shift-btn').addEventListener('click', () => {
    showAddShiftModal(projects, users);
  });

  // Edit Shift Modal (Clicking on shift)
  document.querySelectorAll('.calendar-shift').forEach(shiftElem => {
    shiftElem.addEventListener('click', (e) => {
      e.stopPropagation();
      const shiftId = shiftElem.getAttribute('data-shift-id');
      const shift = shifts.find(s => s.id === shiftId);
      showEditShiftModal(shift, users);
    });

    // Drag start
    shiftElem.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', shiftElem.getAttribute('data-shift-id'));
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  // Calendar cells drop target
  document.querySelectorAll('.calendar-cell').forEach(cell => {
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    cell.addEventListener('drop', async (e) => {
      e.preventDefault();
      const shiftId = e.dataTransfer.getData('text/plain');
      const targetDate = cell.getAttribute('data-date');

      if (!shiftId || !targetDate) return;

      const originalShift = shifts.find(s => s.id === shiftId);
      if (originalShift) {
        const payload = {
          userId: originalShift.userId,
          projectId: originalShift.projectId,
          projectTitle: originalShift.projectTitle,
          date: targetDate,
          startTime: originalShift.startTime,
          endTime: originalShift.endTime,
          siteAddress: originalShift.siteAddress,
          taskName: originalShift.taskName,
          repeatOption: 'none'
        };

        try {
          await createShift(payload);
          await createNotification(
            originalShift.userId,
            "New Shift Copy Scheduled",
            `A duplicate shift at ${originalShift.projectTitle} was scheduled for you on ${formatDate(targetDate)}.`,
            "shift"
          );
          showToast("Shift copied successfully!", "success");
          init(document.getElementById('view-mount'));
        } catch (err) {
          showToast(err.message, "error");
        }
      }
    });
  });
}

function showAddShiftModal(projects, users) {
  const operatives = users.filter(u => u.role === 'operative');
  
  showModal({
    title: 'Schedule New Shift',
    bodyHTML: `
      <form id="modal-shift-form">
        <div class="form-group">
          <label class="form-label" for="shift-user">Select Employee</label>
          <select class="form-input" id="shift-user" required>
            ${operatives.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="shift-project">Select Project Site</label>
          <select class="form-input" id="shift-project" required>
            ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="shift-date">Shift Date</label>
          <input class="form-input" type="date" id="shift-date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div style="display: flex; gap: 10px;">
          <div class="form-group" style="flex: 1;">
            <label class="form-label" for="shift-start">Start Time</label>
            <input class="form-input" type="time" id="shift-start" required value="08:00">
          </div>
          <div class="form-group" style="flex: 1;">
            <label class="form-label" for="shift-end">End Time</label>
            <input class="form-input" type="time" id="shift-end" required value="16:30">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="shift-task">Assigned Job / Task Instruction</label>
          <input class="form-input" type="text" id="shift-task" required placeholder="e.g. Drywall boarding, welding, painting">
        </div>
        <div class="form-group">
          <label class="form-label" for="shift-repeat">Repeat Option</label>
          <select class="form-input" id="shift-repeat">
            <option value="none">Does not repeat</option>
            <option value="daily">Daily (Mon-Fri)</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
      </form>
    `,
    confirmText: 'Save Shift',
    onConfirm: async (body) => {
      const userId = body.querySelector('#shift-user').value;
      const projectId = body.querySelector('#shift-project').value;
      const date = body.querySelector('#shift-date').value;
      const startTime = body.querySelector('#shift-start').value;
      const endTime = body.querySelector('#shift-end').value;
      const taskName = body.querySelector('#shift-task').value;
      const repeatOption = body.querySelector('#shift-repeat').value;

      const project = projects.find(p => p.id === projectId);
      const worker = users.find(u => u.id === userId);

      const payload = {
        userId,
        projectId,
        projectTitle: project.name,
        date,
        startTime,
        endTime,
        siteAddress: project.address,
        taskName,
        repeatOption
      };

      try {
        await createShift(payload);
        
        // Notification handled by Cloud Function

        showToast("Shift scheduled!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}

function showEditShiftModal(shift, users) {
  const worker = users.find(u => u.id === shift.userId) || { name: 'Unknown' };

  showModal({
    title: 'Edit Scheduled Shift',
    bodyHTML: `
      <p style="margin-bottom: 12px;">Modify shift assignment details for <strong>${worker.name}</strong>.</p>
      <p style="font-size:0.85rem; color:hsl(var(--text-muted));">Project: ${shift.projectTitle}</p>
      <p style="font-size:0.85rem; color:hsl(var(--text-muted)); margin-bottom:12px;">Date: ${formatDate(shift.date)}</p>
    `,
    confirmText: 'Delete Shift',
    cancelText: 'Back',
    onConfirm: async () => {
      if (confirm("Are you sure you want to remove this shift?")) {
        await deleteShift(shift.id);
        
        // Notify user of cancel
        await createNotification(shift.userId, "Shift Cancelled", `Your shift scheduled at ${shift.projectTitle} on ${formatDate(shift.date)} has been cancelled.`, "shift");

        showToast("Shift removed.", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      }
    }
  });
}

// Parse CSV schedule columns: UserEmail, ProjectName, Date, StartTime, EndTime, TaskName
async function parseAndImportCSV(csvText, projects, users) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length <= 1) {
    showToast("CSV file is empty.", "error");
    return;
  }

  // Skip header line
  let importedCount = 0;
  let errorCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    if (cols.length < 6) {
      errorCount++;
      continue;
    }

    const email = cols[0];
    const projectName = cols[1];
    const date = cols[2]; // YYYY-MM-DD
    const startTime = cols[3];
    const endTime = cols[4];
    const taskName = cols[5];

    // Find User and Project objects
    const worker = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    const project = projects.find(p => p.name.toLowerCase() === projectName.toLowerCase());

    if (worker && project) {
      const payload = {
        userId: worker.id,
        projectId: project.id,
        projectTitle: project.name,
        date,
        startTime,
        endTime,
        siteAddress: project.address,
        taskName,
        repeatOption: 'none'
      };

      await createShift(payload);
      // Notification handled by Cloud Function
      importedCount++;
    } else {
      errorCount++;
    }
  }

  showToast(`CSV Processing Complete: ${importedCount} shifts imported. ${errorCount} errors.`, "success");
  init(document.getElementById('view-mount'));
}
