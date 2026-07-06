import { getCurrentUser } from '../auth.js';
import { getShifts } from '../db.js';
import { formatDate, getLoadingSpinner, getLocalDateString } from '../utils.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderMobileJobList(container, user);
}

async function renderMobileJobList(container, user) {
  try {
    const allShifts = await getShifts();
    
    // Operatives only see their own shifts
    const myShifts = allShifts
      .filter(s => s.userId === user.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    const todayStr = getLocalDateString();

    // Segment shifts
    const todayShifts = myShifts.filter(s => s.date === todayStr);
    const upcomingShifts = myShifts.filter(s => s.date > todayStr);
    const historicalShifts = myShifts.filter(s => s.date < todayStr);

    container.innerHTML = `
      <div style="max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px;">
        
        <!-- Welcome Operative Banner -->
        <div class="card" style="background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%); color: white; border: none; padding: 16px; margin-bottom: 0;">
          <h4 style="font-weight: 700; margin-bottom: 4px;">Hello, ${user.name}</h4>
          <p style="font-size: 0.85rem; opacity: 0.9;"><i class="fa-solid fa-helmet-safety"></i> Roster: <strong>${user.trade || 'General Operative'}</strong></p>
        </div>

        ${myShifts.length === 0 ? `
          <div class="card" style="text-align: center; color: hsl(var(--text-muted)); font-style: italic; padding: 40px; margin-bottom: 0;">
            No scheduled shifts.
          </div>
        ` : `
          <!-- TODAY'S SHIFT ALLOCATION -->
          <div>
            <h4 style="font-weight: 700; font-size: 0.9rem; text-transform: uppercase; color: hsl(var(--text-muted)); margin-bottom: 8px; letter-spacing: 0.05em;">Today's Shift</h4>
            ${todayShifts.length > 0 ? todayShifts.map(s => renderJobCard(s)).join('') : `
              <div class="card" style="text-align: center; color: hsl(var(--text-muted)); font-style: italic; padding: 20px; margin-bottom: 0;">
                No shift scheduled for today.
              </div>
            `}
          </div>

          <!-- UPCOMING SHIFTS -->
          <div>
            <h4 style="font-weight: 700; font-size: 0.9rem; text-transform: uppercase; color: hsl(var(--text-muted)); margin-bottom: 8px; letter-spacing: 0.05em;">Upcoming Schedule</h4>
            ${upcomingShifts.length > 0 ? `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${upcomingShifts.map(s => renderJobCard(s)).join('')}
              </div>
            ` : `
              <div class="card" style="text-align: center; color: hsl(var(--text-muted)); font-style: italic; padding: 20px; margin-bottom: 0;">
                No upcoming shifts scheduled.
              </div>
            `}
          </div>

          <!-- HISTORICAL SHIFTS -->
          ${historicalShifts.length > 0 ? `
            <details style="margin-top: 10px;">
              <summary style="font-weight: 700; font-size: 0.85rem; text-transform: uppercase; color: hsl(var(--text-muted)); cursor: pointer; user-select: none; margin-bottom: 8px; outline: none;">
                Historical Shifts (${historicalShifts.length})
              </summary>
              <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
                ${historicalShifts.map(s => renderJobCard(s)).join('')}
              </div>
            </details>
          ` : ''}
        `}

      </div>
    `;
  } catch (err) {
    console.error("Error rendering mobile shifts:", err);
    container.innerHTML = `
      <div style="max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px;">
        <div class="card" style="background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%); color: white; border: none; padding: 16px; margin-bottom: 0;">
          <h4 style="font-weight: 700; margin-bottom: 4px;">Hello, ${user.name}</h4>
          <p style="font-size: 0.85rem; opacity: 0.9;"><i class="fa-solid fa-helmet-safety"></i> Roster: <strong>${user.trade || 'General Operative'}</strong></p>
        </div>
        <div class="card" style="text-align: center; color: hsl(var(--text-muted)); font-style: italic; padding: 40px; margin-bottom: 0;">
          No scheduled shifts.
        </div>
      </div>
    `;
  }
}

function renderJobCard(s) {
  let statusColorClass = 'status-pending';
  if (s.status === 'confirmed') statusColorClass = 'status-confirmed';
  else if (s.status === 'on site') statusColorClass = 'status-on-site';
  else if (s.status === 'completed') statusColorClass = 'status-completed';
  else if (s.status === 'incomplete') statusColorClass = 'status-incomplete';
  else if (s.status === 'cancelled') statusColorClass = 'status-cancelled';

  return `
    <div class="card" 
         onclick="location.hash='#/mobile-card?id=${s.id}'" 
         style="margin-bottom: 0; padding: 16px; cursor: pointer; border-left: 5px solid ${s.status === 'cancelled' ? '#71717a' : 'hsl(var(--primary))'}; position: relative; transition: var(--transition); ${s.status === 'cancelled' ? 'opacity: 0.75;' : ''}"
         onmouseover="this.style.transform='translateY(-2px)'"
         onmouseout="this.style.transform='translateY(0)'">
      
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
        <span style="font-weight: 700; font-size: 0.95rem; color: hsl(var(--primary));">${formatDate(s.date)}</span>
        <span class="status-badge ${statusColorClass}" style="font-size: 0.65rem;">${s.status}</span>
      </div>

      <div style="font-size: 0.85rem; font-weight: 500; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
        <i class="fa-regular fa-clock" style="color: hsl(var(--text-muted));"></i>
        <span>Start Time: ${s.startTime || 'Not specified'}</span>
      </div>

      <div style="font-size: 0.9rem; font-weight: 600; margin-bottom: 6px; display: flex; align-items: start; gap: 6px;">
        <i class="fa-solid fa-location-dot" style="color: hsl(var(--text-muted)); margin-top: 3px;"></i>
        <span style="min-width: 0; word-break: break-word;">${s.siteAddress}</span>
      </div>

      <div style="font-size: 0.85rem; background-color: hsl(var(--bg-primary)/0.4); padding: 8px; border-radius: var(--radius-sm); display: flex; align-items: start; gap: 6px;">
        <i class="fa-solid fa-briefcase" style="color: hsl(var(--text-muted)); margin-top: 3px;"></i>
        <span style="font-weight: 500; color: hsl(var(--text-main));">${s.task}</span>
      </div>

      ${s.status === 'cancelled' ? `
        <div style="position: absolute; inset: 0; background-color: rgba(244, 244, 245, 0.05); pointer-events: none; border-radius: var(--radius-md);"></div>
      ` : ''}

    </div>
  `;
}

export function destroy() {}
