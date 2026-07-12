import { getCurrentUser, isManager } from '../auth.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;
  renderHelpPage(container, user);
}

function renderHelpPage(container, user) {
  const sections = getHelpSections(user);

  container.innerHTML = `
    <div style="max-width: 860px; margin: 0 auto;">
      <div style="margin-bottom: 28px;">
        <h2 style="font-size: 1.6rem; font-weight: 800; color: hsl(var(--text-main)); margin-bottom: 6px;">
          <i class="fa-solid fa-circle-question" style="color: hsl(var(--primary)); margin-right: 8px;"></i>Help & User Guide
        </h2>
        <p style="color: hsl(var(--text-muted)); font-size: 0.95rem;">Step-by-step guides for every part of the platform.</p>
      </div>
      <div style="margin-bottom: 24px;">
        <input class="form-input" type="search" id="help-search" placeholder="Search help topics..." style="max-width: 420px; padding-left: 14px;">
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 28px;" id="help-quicklinks">
        ${sections.map(s => `
          <button onclick="document.getElementById('help-sec-${s.id}').scrollIntoView({behavior:'smooth'})"
            style="padding: 8px 14px; border-radius: 999px; border: 1px solid hsl(var(--border)); background: hsl(var(--bg-card)); font-size: 0.8rem; font-weight: 600; cursor: pointer; color: hsl(var(--text-main)); transition: var(--transition);"
            onmouseover="this.style.backgroundColor='hsl(var(--primary)/0.1)'; this.style.borderColor='hsl(var(--primary))'; this.style.color='hsl(var(--primary))';"
            onmouseout="this.style.backgroundColor='hsl(var(--bg-card))'; this.style.borderColor='hsl(var(--border))'; this.style.color='hsl(var(--text-main))';">
            <i class="fa-solid ${s.icon}" style="margin-right:6px;"></i>${s.title}
          </button>
        `).join('')}
      </div>
      <div id="help-sections-container">
        ${sections.map(s => renderSection(s)).join('')}
      </div>
      <div class="card" style="margin-top: 32px; text-align: center; border: 2px solid hsl(var(--primary)/0.3); background: hsl(var(--primary)/0.04);">
        <i class="fa-solid fa-headset fa-2x" style="color: hsl(var(--primary)); margin-bottom: 12px; display: block;"></i>
        <h3 style="font-weight: 700; margin-bottom: 6px;">Need More Help?</h3>
        <p style="color: hsl(var(--text-muted)); font-size: 0.9rem;">Contact your system administrator or Phil Shergold for support.</p>
      </div>
    </div>
  `;

  const searchInput = document.getElementById('help-search');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('.help-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = (!q || text.includes(q)) ? 'block' : 'none';
    });
    document.querySelectorAll('.help-section').forEach(sec => {
      const visible = [...sec.querySelectorAll('.help-item')].some(i => i.style.display !== 'none');
      sec.style.display = (!q || visible) ? 'block' : 'none';
    });
  });

  document.querySelectorAll('.help-accordion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = btn.nextElementSibling;
      const icon = btn.querySelector('.help-acc-icon');
      const isOpen = body.style.display === 'block';
      body.style.display = isOpen ? 'none' : 'block';
      if (icon) icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
    });
  });
}

function renderSection(section) {
  return `
    <div class="help-section card" id="help-sec-${section.id}" style="margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid hsl(var(--border)/0.5);">
        <div style="width:36px; height:36px; border-radius:8px; background:hsl(var(--primary)/0.1); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <i class="fa-solid ${section.icon}" style="color: hsl(var(--primary));"></i>
        </div>
        <div>
          <h3 style="font-size: 1rem; font-weight: 700; margin: 0;">${section.title}</h3>
          <p style="font-size: 0.8rem; color: hsl(var(--text-muted)); margin: 0;">${section.desc}</p>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${section.items.map(item => `
          <div class="help-item" style="border: 1px solid hsl(var(--border)/0.5); border-radius: var(--radius-sm); overflow: hidden;">
            <button class="help-accordion-btn" style="width:100%; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; background:hsl(var(--bg-primary)/0.3); border:none; cursor:pointer; text-align:left; font-size:0.9rem; font-weight:600; color:hsl(var(--text-main)); transition:var(--transition);"
              onmouseover="this.style.backgroundColor='hsl(var(--primary)/0.07)'"
              onmouseout="this.style.backgroundColor='hsl(var(--bg-primary)/0.3)'">
              <span><i class="fa-regular fa-circle-question" style="color:hsl(var(--primary)); margin-right:8px; font-size:0.85rem;"></i>${item.q}</span>
              <i class="fa-solid fa-chevron-right help-acc-icon" style="font-size:0.75rem; color:hsl(var(--text-muted)); transition:transform 0.2s; flex-shrink:0;"></i>
            </button>
            <div style="display:none; padding:14px 16px; font-size:0.88rem; line-height:1.7; color:hsl(var(--text-muted)); background:hsl(var(--bg-card));">
              ${item.a}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function getHelpSections(user) {
  const managerOnly = isManager();
  const all = [
    {
      id: 'getting-started', title: 'Getting Started', icon: 'fa-rocket',
      desc: 'Login, navigation, and your profile',
      items: [
        { q: 'How do I log in?', a: 'Enter your email and password on the login screen. If you have forgotten your password, click <strong>Forgot Password</strong> to receive a reset email. You will remain logged in automatically unless you choose to sign out.' },
        { q: 'How do I navigate the app?', a: 'On desktop, use the left sidebar. On mobile, use the bottom navigation bar. Tap <strong>More</strong> to access additional modules like HR, Tasks, and Documents.' },
        { q: 'How do I update my profile?', a: 'On mobile tap <strong>More</strong> then <strong>Profile and Settings</strong>. On desktop click your name in the top-left to open the profile panel. Here you can change your name, notification preferences, and password.' },
        { q: 'Can I use this on my phone?', a: 'Yes. The app is a Progressive Web App (PWA). Install it on iPhone via Safari Share button then Add to Home Screen. On Android use Chrome Menu then Install App.' },
      ]
    },
    {
      id: 'shifts', title: 'Shifts and My Schedule', icon: 'fa-calendar-check',
      desc: 'Viewing and managing your allocated shifts',
      items: [
        { q: 'Where do I see my shifts?', a: 'Operatives go to <strong>My Shifts</strong> from the bottom navigation. You will see all upcoming shifts with site address, date, time, and task.' },
        { q: 'How do I confirm I am on my way to site?', a: 'Open the shift card and tap <strong>Confirm</strong>. This updates the manager in real-time. Once on site tap <strong>Mark On Site</strong>.' },
        { q: 'How do I mark a shift as complete?', a: 'Tap <strong>Mark Complete</strong> on the shift card. You will be asked to enter completion notes and upload photo evidence. Both are required before submission.' },
        { q: 'What if I cannot complete the job?', a: 'Tap <strong>Mark Incomplete</strong> on the shift card. Describe the reason and upload a photo showing the barrier. The manager will be notified immediately.' },
        { q: 'I was notified about a shift, what do I do?', a: 'A pop-up appears when you have a new shift awaiting confirmation. Confirm directly from the notification. Only shifts for today and future dates will trigger this prompt.' },
      ]
    },
    ...(managerOnly ? [
      {
        id: 'easy-planner', title: 'Easy Planner', icon: 'fa-chalkboard-user',
        desc: 'Drag-and-drop scheduling board',
        items: [
          { q: 'How do I assign an engineer to a shift?', a: 'Go to <strong>Easy Planner</strong>. Drag an engineer name card from the left panel and drop it onto the date column you want. A shift creation form will appear - fill in the site, task, and time.' },
          { q: 'How do I move a shift to a different date?', a: 'Drag the shift card from one date column and drop it onto another. Confirm the change in the pop-up.' },
          { q: 'What do the status badges mean?', a: '<strong>Pending</strong> - Awaiting confirmation. <strong>Confirmed</strong> - Operative acknowledged. <strong>On Site</strong> - Operative arrived. <strong>Completed</strong> - Job done with evidence. <strong>Incomplete</strong> - Job could not be completed. <strong>Cancelled</strong> - Shift was cancelled.' },
          { q: 'How do I cancel a shift?', a: 'Open the Shift Detail page (click the shift card) and click <strong>Cancel Shift</strong>. The engineer will see it as CANCELLED.' },
        ]
      },
      {
        id: 'sites', title: 'Sites and Addresses', icon: 'fa-location-dot',
        desc: 'Managing site locations',
        items: [
          { q: 'How do I add a new site?', a: 'Go to <strong>Sites and Addresses</strong> and click <strong>Add Site</strong>. Enter the full address and any notes. Active sites appear in the shift planner.' },
          { q: 'How do I edit a site or upload files to it?', a: 'Click on a site to open its detail panel. Edit the address directly or use the <strong>Upload File</strong> button. Changes and uploaded files appear in real-time for all users.' },
        ]
      },
      {
        id: 'engineers', title: 'Engineers Directory', icon: 'fa-helmet-safety',
        desc: 'Managing your workforce',
        items: [
          { q: 'How do I add a new engineer?', a: 'Go to <strong>Engineers Directory</strong> and click <strong>Add Engineer</strong>. Enter their name, email, trade, and role. They receive a welcome email and can log in immediately.' },
          { q: 'How do I delete an engineer?', a: 'On the engineer profile in the <strong>Engineers Directory</strong>, click the red trash icon. This removes their account but keeps historical shift records. Note: the delete button is only in the Engineers Directory, not in the Easy Planner.' },
        ]
      },
      {
        id: 'tasks', title: 'Tasks', icon: 'fa-list-check',
        desc: 'Creating and tracking work tasks',
        items: [
          { q: 'How do I create a task?', a: 'Go to <strong>Tasks</strong> and click <strong>Create Task</strong>. Enter a title, description, select a project site from the dropdown, assign an employee, set priority and due date.' },
          { q: 'How does the task workflow work?', a: 'Tasks move through: <strong>Pending - In Progress - Completed (Review) - Approved</strong>. The operative starts it, submits photo proof when done, and a manager approves or returns it.' },
          { q: 'How do I return a task to an operative?', a: 'When a task is in Completed (Review), click <strong>Manage</strong> then <strong>Reject / Return</strong>. Enter a reason - the operative is notified and the task returns to In Progress.' },
        ]
      },
      {
        id: 'hr', title: 'HR Module', icon: 'fa-user-tie',
        desc: 'Holiday requests, timesheets and records',
        items: [
          { q: 'How do I approve a holiday request?', a: 'Go to <strong>HR</strong> then <strong>Holiday Requests</strong>. Pending requests show in amber. Click Approve or Reject and add a note. The employee is notified automatically.' },
          { q: 'Where are timesheets?', a: 'Go to <strong>HR</strong> then <strong>Timesheets</strong>. View all submitted timesheets, filter by employee or date, and approve them.' },
          { q: 'How do I add a training record?', a: 'Go to <strong>HR</strong> then <strong>Training Records</strong> and click <strong>Add Record</strong>. Select the employee, course, and completion date.' },
        ]
      },
    ] : []),
    {
      id: 'documents', title: 'Documents and RAMS', icon: 'fa-file-lines',
      desc: 'Viewing, signing, and managing documents',
      items: [
        { q: 'How do I view a document?', a: 'Go to <strong>Documents</strong> and click the document title link. It will open in a new tab. Your view is automatically logged for audit purposes.' },
        { q: 'How do I sign a RAMS or policy?', a: 'If a document requires a signature, a <strong>Sign RAMS / Policy</strong> button appears next to it. Click it, draw your signature using your mouse or finger, then click <strong>Acknowledge and Sign</strong>.' },
        ...(managerOnly ? [
          { q: 'How do I upload a new document?', a: 'Click <strong>Upload Document</strong> at the top of the Documents page. Give it a title, description, and choose whether it requires a signature.' },
          { q: 'How do I see who has signed a document?', a: 'Click the <strong>Audited: X Views | Y Signed</strong> link next to any document. A panel shows everyone who viewed or signed it.' },
        ] : []),
      ]
    },
    {
      id: 'chat', title: 'Chat and Messaging', icon: 'fa-comments',
      desc: 'Team communication and channels',
      items: [
        { q: 'How do I send a message?', a: 'Go to <strong>Chat</strong>. Select a channel from the left panel or click a colleague name under Direct Messages. Type in the box at the bottom and press Enter or the send button.' },
        { q: 'What is the General Chat channel?', a: 'The General Chat is visible to everyone in the organisation. Use it for company-wide announcements and general conversation.' },
        { q: 'How do I mute a channel?', a: 'Open the channel then click the bell icon in the top-right of the chat. You will only be notified if someone mentions you by name or @all.' },
        { q: 'How do chat notification badges work?', a: 'A red dot appears on the Chat icon when you have unread messages. It clears automatically when you open that chat.' },
        ...(managerOnly ? [
          { q: 'How do I delete a chat channel?', a: 'In the Chat sidebar, click the red trash icon next to any channel. This permanently deletes the channel and all its messages.' },
        ] : []),
      ]
    },
    {
      id: 'forms', title: 'Forms', icon: 'fa-clipboard-list',
      desc: 'Completing and submitting digital forms',
      items: [
        { q: 'How do I fill in a form?', a: 'Go to <strong>Forms</strong> and click the form you want to complete. Fill in all required fields and click <strong>Submit Form</strong>. You will get a confirmation when saved.' },
        { q: 'Can I see my previous form submissions?', a: 'Yes. In the Forms section, your submitted forms appear below the available forms with a timestamp.' },
      ]
    },
  ];
  return all;
}

export function destroy() {}
