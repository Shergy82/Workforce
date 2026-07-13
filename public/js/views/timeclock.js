import { getCurrentUser, isManager } from '../auth.js';
import { getTimesheets, clockIn, clockOut, toggleBreak, getProjects, getShifts, approveTimesheet } from '../db.js';
import { formatTime, formatDate, formatDateTime, haversineDistance, getLoadingSpinner, getLocalDateString } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';

let activeInterval = null;

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderClockView(container, user);
}

async function renderClockView(container, user) {
  try {
    const [timesheets, projects, shifts] = await Promise.all([
      getTimesheets(),
      getProjects(),
      getShifts()
    ]);

    const todayStr = getLocalDateString();
    
    // Find active timesheet (clocked in today, no clockout yet)
    const activeTimesheet = timesheets.find(t => t.userId === user.id && t.date === todayStr && !t.clockOutTime);
    const completedTimesheet = timesheets.find(t => t.userId === user.id && t.date === todayStr && t.clockOutTime);
    
    // Find user shifts for today to auto-select project
    const todayShifts = shifts.filter(s => s.userId === user.id && s.date === todayStr);

    let mainCardHTML = '';

    if (activeTimesheet) {
      // User is currently clocked in
      const isOnBreak = activeTimesheet.breaks.some(b => !b.end);
      
      mainCardHTML = `
        <div class="card" style="text-align: center;">
          <div class="clock-container">
            <button class="clock-btn ${isOnBreak ? 'active' : ''}" id="clock-out-trigger">
              <i class="fa-solid fa-right-from-bracket fa-2x"></i>
              <span style="font-size:0.95rem; font-weight:600;">Clock Out</span>
            </button>
            <div class="clock-time" id="live-timer">00:00:00</div>
            <p style="color: hsl(var(--text-muted)); font-size: 0.9rem; margin-top: 10px;">
              Working at: <strong>${activeTimesheet.projectTitle}</strong>
            </p>
            
            <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center; width: 100%; max-width: 300px;">
              <button class="btn ${isOnBreak ? 'btn-success' : 'btn-warning'}" id="break-trigger" style="flex: 1;">
                <i class="fa-solid ${isOnBreak ? 'fa-play' : 'fa-pause'}"></i>
                ${isOnBreak ? 'End Break' : 'Start Break'}
              </button>
            </div>
          </div>
        </div>
      `;

      // Start live timer
      startLiveTimer(activeTimesheet.clockInTime, activeTimesheet.breaks);
    } else if (completedTimesheet) {
      // Already finished today's shift
      mainCardHTML = `
        <div class="card" style="text-align: center; padding: 40px 20px;">
          <i class="fa-solid fa-circle-check fa-4x" style="color: hsl(var(--success)); margin-bottom: 16px;"></i>
          <h3>Shift Completed</h3>
          <p style="color: hsl(var(--text-muted)); margin-top: 8px;">
            Clock In: ${formatTime(completedTimesheet.clockInTime)} | Clock Out: ${formatTime(completedTimesheet.clockOutTime)}
          </p>
          <p style="font-size: 1.15rem; font-weight: 700; margin-top: 8px; color: hsl(var(--primary));">
            Total Hours Worked: ${completedTimesheet.totalHours} hrs
          </p>
        </div>
      `;
    } else {
      // Not Clocked In
      mainCardHTML = `
        <div class="card">
          <div class="card-title">Clock In to Start Work</div>
          <form id="clock-in-form">
            <div class="form-group">
              <label class="form-label" for="clock-in-project">Select Project / Site</label>
              <select class="form-input" id="clock-in-project" required>
                <option value="">-- Choose a Site --</option>
                ${projects.map(p => `
                  <option value="${p.id}" ${todayShifts.some(s => s.projectId === p.id) ? 'selected' : ''}>${p.address || p.scheme || p.name || 'Unnamed Site'}</option>
                `).join('')}
              </select>
            </div>
            <button class="btn btn-primary" type="submit" style="width: 100%; font-weight: 600; padding: 12px;">
              <i class="fa-solid fa-play"></i> Clock In
            </button>
          </form>
        </div>
      `;
    }

    // User history logs
    const myHistory = timesheets
      .filter(t => t.userId === user.id)
      .sort((a, b) => b.clockInTime.localeCompare(a.clockInTime));

    const historyHTML = `
      <div class="card" style="margin-top: 24px;">
        <div class="card-title">My Attendance History</div>
        ${myHistory.length > 0 ? `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>In / Out</th>
                  <th>Hours</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${myHistory.map(h => `
                  <tr>
                    <td>${formatDate(h.date)}</td>
                    <td style="font-weight:600;">${h.projectTitle}</td>
                    <td>${formatTime(h.clockInTime)} - ${h.clockOutTime ? formatTime(h.clockOutTime) : '--'}</td>
                    <td>${h.totalHours || '0'} hrs</td>
                    <td>
                      <span class="badge ${h.approvedStatus === 'approved' ? 'badge-success' : 'badge-warning'}">
                        ${h.approvedStatus}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <p style="color: hsl(var(--text-muted)); font-size: 0.9rem; text-align: center; padding: 20px 0;">No history logs found.</p>
        `}
      </div>
    `;

    container.innerHTML = `
      <div style="max-width: 600px; margin: 0 auto;">
        ${mainCardHTML}
        ${historyHTML}
      </div>
    `;

    // Hook events
    setupClockEvents(user, activeTimesheet, projects, shifts);

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error setting up Time Clock view.</p>`;
  }
}

function startLiveTimer(clockInTime, breaks) {
  if (activeInterval) clearInterval(activeInterval);
  
  const timerElem = document.getElementById('live-timer');
  if (!timerElem) return;

  const inMs = new Date(clockInTime).getTime();

  activeInterval = setInterval(() => {
    let now = Date.now();
    let totalWorkedMs = now - inMs;
    
    // Subtract finished breaks and current active break
    let breakMs = 0;
    breaks.forEach(b => {
      const start = new Date(b.start).getTime();
      const end = b.end ? new Date(b.end).getTime() : Date.now();
      breakMs += (end - start);
    });

    let diffMs = Math.max(0, totalWorkedMs - breakMs);

    let sec = Math.floor((diffMs / 1000) % 60);
    let min = Math.floor((diffMs / (1000 * 60)) % 60);
    let hrs = Math.floor((diffMs / (1000 * 60 * 60)));

    timerElem.textContent = `${hrs.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }, 1000);
}

function setupClockEvents(user, activeTimesheet, projects, shifts) {
  const clockInForm = document.getElementById('clock-in-form');
  if (clockInForm) {
    clockInForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const projectId = document.getElementById('clock-in-project').value;
      const project = projects.find(p => p.id === projectId);
      
      const matchedShift = shifts.find(s => s.userId === user.id && s.projectId === projectId && s.date === getLocalDateString());

      // Request geolocation
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const userCoords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };

          // Check Geofence
          if (project.geofence && project.geofence.lat) {
            const distance = haversineDistance(userCoords, project.geofence);
            if (distance > project.geofence.radius) {
              // Outside geofence modal bypass option
              showModal({
                title: 'Geofence Warning',
                bodyHTML: `
                  <p style="margin-bottom: 12px;">You are currently <strong>${Math.round(distance)} meters</strong> away from the site geofence boundary (Limit: ${project.geofence.radius}m).</p>
                  <div class="form-group">
                    <label class="form-label" for="bypass-reason">Please provide a reason for clocking in off-site:</label>
                    <textarea class="form-input" id="bypass-reason" rows="3" placeholder="e.g. Working from material supplier yard / client meeting..."></textarea>
                  </div>
                `,
                confirmText: 'Request Off-Site Check-In',
                onConfirm: async (body) => {
                  const reason = body.querySelector('#bypass-reason').value;
                  if (!reason.trim()) {
                    showToast("Reason is required to bypass geofence.", "error");
                    return;
                  }
                  hideModal();
                  await executeClockIn(user.id, project.id, project.name, matchedShift?.id || null, userCoords, reason);
                }
              });
              return;
            }
          }

          await executeClockIn(user.id, project.id, project.name, matchedShift?.id || null, userCoords);
        },
        async (err) => {
          showToast("Geolocation access denied. Clock-in rejected.", "error");
        }
      );
    });
  }

  const clockOutTrigger = document.getElementById('clock-out-trigger');
  if (clockOutTrigger && activeTimesheet) {
    clockOutTrigger.addEventListener('click', () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          await executeClockOut(activeTimesheet.id, coords);
        },
        async () => {
          // Allow clock out without strict GPS check out
          await executeClockOut(activeTimesheet.id, null);
        }
      );
    });
  }

  const breakTrigger = document.getElementById('break-trigger');
  if (breakTrigger && activeTimesheet) {
    breakTrigger.addEventListener('click', async () => {
      const updated = await toggleBreak(activeTimesheet.id);
      if (updated) {
        showToast(updated.breaks.some(b => !b.end) ? "Break Started" : "Break Ended", "success");
        init(document.getElementById('view-mount'));
      }
    });
  }
}

async function executeClockIn(userId, projectId, projectTitle, shiftId, coords, bypassReason = null) {
  try {
    const log = await clockIn(userId, projectId, projectTitle, shiftId, coords);
    if (bypassReason) {
      // Save bypass notes to logs / metadata
      console.log("Geofence Bypassed. Reason:", bypassReason);
    }
    showToast("Clocked in successfully!", "success");
    init(document.getElementById('view-mount'));
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function executeClockOut(timesheetId, coords) {
  try {
    await clockOut(timesheetId, coords);
    showToast("Clocked out successfully!", "success");
    if (activeInterval) clearInterval(activeInterval);
    init(document.getElementById('view-mount'));
  } catch (err) {
    showToast(err.message, "error");
  }
}

export function destroy() {
  if (activeInterval) clearInterval(activeInterval);
}
