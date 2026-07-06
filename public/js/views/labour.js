import { getCurrentUser } from '../auth.js';
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
  await renderLabourSheet(container);
}

async function renderLabourSheet(container) {
  try {
    const [shifts, users] = await Promise.all([
      getShifts(),
      getUsers()
    ]);

    const operatives = users.filter(u => u.role === 'operative' && u.status === 'active');

    // Generate dates for Mon - Sun of the selected week
    const weekDates = [];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const dateStr = getLocalDateString(d);
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      weekDates.push({ dateStr, dayName: dayNames[i], label });
    }

    const rangeLabel = `${weekDates[0].label} - ${weekDates[6].label} ${weekStart.getFullYear()}`;

    let rowsHTML = operatives.map(worker => {
      let cellsHTML = weekDates.map(wd => {
        // Filter shifts for this engineer on this date
        const dayShifts = shifts.filter(s => s.userId === worker.id && s.date === wd.dateStr);

        return `
          <td style="vertical-align: top; padding: 8px; border: 1px solid hsl(var(--border)); min-width: 150px; background-color: hsl(var(--bg-card));">
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${dayShifts.map(s => {
                let statusColorClass = 'status-pending';
                if (s.status === 'confirmed') statusColorClass = 'status-confirmed';
                else if (s.status === 'on site') statusColorClass = 'status-on-site';
                else if (s.status === 'completed') statusColorClass = 'status-completed';
                else if (s.status === 'incomplete') statusColorClass = 'status-incomplete';
                else if (s.status === 'cancelled') statusColorClass = 'status-cancelled';

                return `
                  <div style="padding: 6px; border-radius: var(--radius-sm); font-size: 0.75rem; cursor: pointer; transition: var(--transition);" 
                       class="${statusColorClass}" 
                       onclick="location.hash='#/shift-detail?id=${s.id}'"
                       title="Click to view shift details">
                    <div style="font-weight: 700;">${s.startTime || '08:00'}</div>
                    <div style="font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;">${s.siteAddress.split(',')[0]}</div>
                    <div style="font-size: 0.65rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.8;">${s.task}</div>
                    <span class="status-badge ${statusColorClass}" style="font-size: 0.55rem; padding: 2px 4px; border-radius: 2px; margin-top: 4px; display: inline-block;">
                      ${s.status}
                    </span>
                  </div>
                `;
              }).join('')}
              ${dayShifts.length === 0 ? `<span style="color: hsl(var(--text-muted)); font-style: italic; font-size:0.7rem; text-align: center; display: block; padding-top: 8px;">Off Duty</span>` : ''}
            </div>
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td style="font-weight: 700; font-size:0.875rem; padding: 12px; background-color: hsl(var(--bg-primary)/0.3); border: 1px solid hsl(var(--border)); position: sticky; left: 0; z-index: 10;">
            <div>${worker.name}</div>
            <div style="font-size: 0.7rem; color: hsl(var(--text-muted)); font-weight: 500; margin-top: 2px;">${worker.trade || 'General Builder'}</div>
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
            <button class="btn btn-secondary" id="labour-week-prev" style="padding: 6px 12px;"><i class="fa-solid fa-chevron-left"></i> Previous Week</button>
            <h3 style="font-weight: 700; min-width: 180px; text-align: center; font-size: 1.05rem;">${rangeLabel}</h3>
            <button class="btn btn-secondary" id="labour-week-next" style="padding: 6px 12px;">Next Week <i class="fa-solid fa-chevron-right"></i></button>
          </div>
          <button class="btn btn-secondary" id="labour-print-btn"><i class="fa-solid fa-print"></i> Print Labour Sheet</button>
        </div>

        <!-- Labour Sheet Table Matrix -->
        <div class="table-responsive" style="overflow-x: auto; max-height: 550px;">
          <table class="data-table" style="border-collapse: collapse; width: 100%;">
            <thead>
              <tr style="background-color: hsl(var(--bg-primary));">
                <th style="padding: 12px; border: 1px solid hsl(var(--border)); position: sticky; left: 0; background-color: hsl(var(--bg-primary)); z-index: 11; width: 180px;">Engineer</th>
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
              ${operatives.length === 0 ? `
                <tr>
                  <td colspan="8" style="text-align: center; padding: 40px; color: hsl(var(--text-muted));">
                    No active operatives in directory.
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    setupLabourEvents(container);
  } catch (err) {
    console.error("Labour sheet load error:", err);
    container.innerHTML = `<div class="card"><p style="color:hsl(var(--danger));">Error loading Labour Sheet: ${err.message}</p></div>`;
  }
}

function setupLabourEvents(container) {
  document.getElementById('labour-week-prev').addEventListener('click', () => {
    weekStart.setDate(weekStart.getDate() - 7);
    init(container);
  });

  document.getElementById('labour-week-next').addEventListener('click', () => {
    weekStart.setDate(weekStart.getDate() + 7);
    init(container);
  });

  document.getElementById('labour-print-btn').addEventListener('click', () => {
    window.print();
  });
}

export function destroy() {}
