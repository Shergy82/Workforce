import { getCurrentUser, isManager } from '../auth.js';
import { getShifts, getUsers } from '../db.js';
import { formatDate, getLoadingSpinner, getLocalDateString } from '../utils.js';

let weekStart = new Date();
// Set to Monday of the current week
const dayOfWeek = weekStart.getDay();
const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
weekStart.setDate(diff);
weekStart.setHours(0, 0, 0, 0);

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderSheet(container);
}

async function renderSheet(container) {
  try {
    const [shifts, users] = await Promise.all([
      getShifts(),
      getUsers()
    ]);

    const operatives = users.filter(u => u.role === 'operative');

    // Generate dates for Mon - Sun of selected week
    const weekDates = [];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dateStr = getLocalDateString(d);
      
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      weekDates.push({ dateStr, dayName: dayNames[i], label });
    }

    // Format week range label
    const rangeLabel = `${weekDates[0].label} - ${weekDates[6].label} ${weekStart.getFullYear()}`;

    let rowsHTML = operatives.map(worker => {
      let cellsHTML = weekDates.map(wd => {
        const dayShifts = shifts.filter(s => s.userId === worker.id && s.date === wd.dateStr);
        
        return `
          <td style="vertical-align: top; padding: 8px; border: 1px solid hsl(var(--border)); min-width: 140px; background-color: hsl(var(--bg-card));">
            <div style="display:flex; flex-direction:column; gap:4px; font-size: 0.75rem;">
              ${dayShifts.map(s => `
                <div style="padding: 6px; background-color: hsl(var(--primary) / 0.08); border-left: 3px solid hsl(var(--primary)); border-radius: 4px;" title="${s.taskName}">
                  <span style="font-weight:700; color:hsl(var(--primary));">${s.startTime} - ${s.endTime}</span>
                  <p style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;">${s.projectTitle}</p>
                </div>
              `).join('')}
              ${dayShifts.length === 0 ? `<span style="color: hsl(var(--text-muted)); font-style: italic; font-size:0.7rem;">Off</span>` : ''}
            </div>
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td style="font-weight: 600; font-size:0.875rem; padding: 12px; background-color: hsl(var(--bg-primary)/0.4); border: 1px solid hsl(var(--border)); position: sticky; left: 0; z-index: 10;">
            ${worker.name}
          </td>
          ${cellsHTML}
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="card" style="padding: 16px;">
        <!-- Date Selector Header -->
        <div style="display: flex; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary" id="week-prev" style="padding: 6px 12px;"><i class="fa-solid fa-chevron-left"></i> Previous Week</button>
            <h3 style="font-weight: 700; min-width: 180px; text-align: center; font-size: 1.05rem;">${rangeLabel}</h3>
            <button class="btn btn-secondary" id="week-next" style="padding: 6px 12px;">Next Week <i class="fa-solid fa-chevron-right"></i></button>
          </div>
          <button class="btn btn-secondary" id="btn-print-sheet"><i class="fa-solid fa-print"></i> Print Sheet</button>
        </div>

        <!-- Gantt Matrix Table -->
        <div class="table-responsive" style="overflow-x: auto; max-height: 550px;">
          <table class="data-table" style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr style="background-color: hsl(var(--bg-primary));">
                <th style="padding: 12px; border: 1px solid hsl(var(--border)); position: sticky; left: 0; background-color: hsl(var(--bg-primary)); z-index: 11; width: 160px;">Employee</th>
                ${weekDates.map(wd => `
                  <th style="padding: 12px; border: 1px solid hsl(var(--border)); font-size:0.8rem; text-align: center;">
                    <span style="font-weight:700;">${wd.dayName}</span><br>
                    <span style="font-size:0.75rem; color:hsl(var(--text-muted)); font-weight:500;">${wd.label}</span>
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody>
              ${rowsHTML}
            </tbody>
          </table>
        </div>
      </div>
    `;

    setupSheetEvents(container);

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error rendering sheet matrix.</p>`;
  }
}

function setupSheetEvents(container) {
  document.getElementById('week-prev').addEventListener('click', () => {
    weekStart.setDate(weekStart.getDate() - 7);
    init(container);
  });

  document.getElementById('week-next').addEventListener('click', () => {
    weekStart.setDate(weekStart.getDate() + 7);
    init(container);
  });

  document.getElementById('btn-print-sheet').addEventListener('click', () => {
    window.print();
  });
}

export function destroy() {}
