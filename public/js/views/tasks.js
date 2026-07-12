import { getCurrentUser, isManager, isSupervisor } from '../auth.js';
import { getTasks, createTask, updateTask, getProjects, getUsers, createNotification } from '../db.js';
import { formatDate, getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';
import { uploadFile } from '../storage.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderTaskView(container, user);
}

async function renderTaskView(container, user) {
  try {
    const [tasks, projects, users] = await Promise.all([
      getTasks(),
      getProjects(),
      getUsers()
    ]);

    const activeUserTasks = isManager() ? tasks : tasks.filter(t => t.assignedTo === user.id);

    // Grouping tasks by columns
    const columns = {
      pending: activeUserTasks.filter(t => t.status === 'pending'),
      in_progress: activeUserTasks.filter(t => t.status === 'in_progress'),
      completed: activeUserTasks.filter(t => t.status === 'completed'),
      approved: activeUserTasks.filter(t => t.status === 'approved')
    };

    let headerHTML = '';
    if (isManager() || isSupervisor()) {
      headerHTML = `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 16px;">
          <button class="btn btn-primary" id="add-task-btn"><i class="fa-solid fa-plus"></i> Create Task</button>
        </div>
      `;
    }

    container.innerHTML = `
      ${headerHTML}
      <div class="task-board">
        <!-- Pending -->
        <div class="task-column">
          <div class="task-column-title">
            <span>Pending</span>
            <span class="badge badge-info">${columns.pending.length}</span>
          </div>
          <div class="task-list-drop" data-status="pending" style="display:flex; flex-direction:column; gap:10px;">
            ${renderColumnTasks(columns.pending, users)}
          </div>
        </div>

        <!-- In Progress -->
        <div class="task-column">
          <div class="task-column-title">
            <span>In Progress</span>
            <span class="badge badge-warning">${columns.in_progress.length}</span>
          </div>
          <div class="task-list-drop" data-status="in_progress" style="display:flex; flex-direction:column; gap:10px;">
            ${renderColumnTasks(columns.in_progress, users)}
          </div>
        </div>

        <!-- Completed / Review -->
        <div class="task-column">
          <div class="task-column-title">
            <span>Completed (Review)</span>
            <span class="badge badge-danger">${columns.completed.length}</span>
          </div>
          <div class="task-list-drop" data-status="completed" style="display:flex; flex-direction:column; gap:10px;">
            ${renderColumnTasks(columns.completed, users)}
          </div>
        </div>

        <!-- Approved / Done -->
        <div class="task-column">
          <div class="task-column-title">
            <span>Approved / Done</span>
            <span class="badge badge-success">${columns.approved.length}</span>
          </div>
          <div class="task-list-drop" data-status="approved" style="display:flex; flex-direction:column; gap:10px;">
            ${renderColumnTasks(columns.approved, users)}
          </div>
        </div>
      </div>
    `;

    setupTaskEvents(user, tasks, projects, users);

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error loading task board.</p>`;
  }
}

function renderColumnTasks(tasks, users) {
  if (tasks.length === 0) {
    return `<div style="text-align:center; padding: 20px 0; color:hsl(var(--text-muted)); font-size:0.85rem; border:1px dashed hsl(var(--border)); border-radius: var(--radius-sm);">No tasks</div>`;
  }

  return tasks.map(t => {
    const assignee = users.find(u => u.id === t.assignedTo) || { name: 'Unassigned' };
    return `
      <div class="task-card" data-task-id="${t.id}">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="badge ${t.priority === 'high' ? 'badge-danger' : 'badge-warning'}">${t.priority}</span>
          <span style="font-size: 0.75rem; color: hsl(var(--text-muted));">${formatDate(t.dueDate)}</span>
        </div>
        <p style="font-weight: 600; font-size: 0.95rem; margin-top: 4px;">${t.title}</p>
        <p style="font-size: 0.8rem; color: hsl(var(--text-muted)); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${t.description}</p>
        <div style="margin-top: 8px; border-top: 1px solid hsl(var(--border)/0.5); padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; color: hsl(var(--text-muted));"><i class="fa-regular fa-user"></i> ${assignee.name}</span>
          <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" data-action="view" data-task-id="${t.id}">Manage</button>
        </div>
      </div>
    `;
  }).join('');
}

function setupTaskEvents(user, tasks, projects, users) {
  // Add task button
  const addBtn = document.getElementById('add-task-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showCreateTaskModal(projects, users));
  }

  // Manage buttons
  document.querySelectorAll('button[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = btn.getAttribute('data-task-id');
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        showManageTaskModal(user, task, users);
      }
    });
  });
}

function showCreateTaskModal(projects, users) {
  const operatives = (users || []).filter(u => u.role === 'operative');
  const projectList = projects || [];

  showModal({
    title: 'Create & Assign Task',
    bodyHTML: `
      <form id="modal-task-form">
        <div class="form-group">
          <label class="form-label" for="task-title">Task Title</label>
          <input class="form-input" type="text" id="task-title" required placeholder="Verify site welds">
        </div>
        <div class="form-group">
          <label class="form-label" for="task-desc">Description</label>
          <textarea class="form-input" id="task-desc" rows="3" required placeholder="Instructions / details..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="task-project">Related Project Site</label>
          <select class="form-input" id="task-project" required>
            ${projectList.length > 0 
              ? projectList.map(p => `<option value="${p.id}">${p.name || p.scheme || p.address || 'Unnamed Site'}</option>`).join('')
              : '<option value="">No Active Projects Available</option>'
            }
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="task-user">Assign to Employee</label>
          <select class="form-input" id="task-user" required>
            ${operatives.length > 0
              ? operatives.map(o => `<option value="${o.id}">${o.name}</option>`).join('')
              : '<option value="">No Operatives Available</option>'
            }
          </select>
        </div>
        <div style="display: flex; gap: 10px;">
          <div class="form-group" style="flex: 1;">
            <label class="form-label" for="task-priority">Priority</label>
            <select class="form-input" id="task-priority">
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <label class="form-label" for="task-due">Due Date</label>
            <input class="form-input" type="date" id="task-due" required value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
      </form>
    `,
    confirmText: 'Assign Task',
    onConfirm: async (body) => {
      const titleEl = body.querySelector('#task-title');
      const descEl = body.querySelector('#task-desc');
      const projectEl = body.querySelector('#task-project');
      const userEl = body.querySelector('#task-user');
      const priorityEl = body.querySelector('#task-priority');
      const dueEl = body.querySelector('#task-due');

      if (!titleEl || !titleEl.value.trim()) {
        showToast("Please enter a task title.", "error");
        return;
      }
      if (!descEl || !descEl.value.trim()) {
        showToast("Please enter a task description.", "error");
        return;
      }
      if (!projectEl || !projectEl.value) {
        showToast("Please select a project site.", "error");
        return;
      }
      if (!userEl || !userEl.value) {
        showToast("Please select an assignee.", "error");
        return;
      }

      const title = titleEl.value;
      const description = descEl.value;
      const projectId = projectEl.value;
      const assignedTo = userEl.value;
      const priority = priorityEl ? priorityEl.value : 'medium';
      const dueDate = dueEl ? dueEl.value : new Date().toISOString().split('T')[0];

      const payload = { title, description, projectId, assignedTo, priority, dueDate };

      try {
        await createTask(payload);
        
        // Notify
        await createNotification(assignedTo, "New Task Assigned", `You have been assigned the task: "${title}". Due: ${formatDate(dueDate)}.`, "task");

        showToast("Task assigned successfully!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}

function showManageTaskModal(user, task, users) {
  const isUserAssignee = task.assignedTo === user.id;
  const isManagerUser = isManager();

  let actionButtonsHTML = '';
  let completeFormHTML = '';

  if (isUserAssignee && task.status === 'pending') {
    actionButtonsHTML = `
      <button class="btn btn-primary" id="btn-start-task" style="width:100%;">Start Task</button>
    `;
  } else if (isUserAssignee && task.status === 'in_progress') {
    completeFormHTML = `
      <div style="border-top: 1px solid hsl(var(--border)); padding-top: 16px; margin-top: 16px;">
        <h4 style="margin-bottom:12px;">Submit Completion Proof</h4>
        <div class="form-group">
          <label class="form-label" for="complete-notes">Completion Notes</label>
          <textarea class="form-input" id="complete-notes" rows="2" required placeholder="Details on completed works..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="complete-photo">Upload Completion Photo</label>
          <input class="form-input" type="file" id="complete-photo" accept="image/*" required>
        </div>
        <button class="btn btn-success" id="btn-complete-task" style="width:100%;">Submit for Review</button>
      </div>
    `;
  } else if (isManagerUser && task.status === 'completed') {
    actionButtonsHTML = `
      <div style="display:flex; gap:10px; width:100%;">
        <button class="btn btn-success" id="btn-approve-task" style="flex:1;">Approve Work</button>
        <button class="btn btn-danger" id="btn-reject-task" style="flex:1;">Reject / Return</button>
      </div>
    `;
  }

  const assignee = users.find(u => u.id === task.assignedTo) || { name: 'Unassigned' };

  showModal({
    title: task.title,
    showFooter: false,
    bodyHTML: `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <p style="font-size:0.95rem;">${task.description}</p>
        <div style="font-size:0.85rem; color:hsl(var(--text-muted));">
          <p>Assigned to: <strong>${assignee.name}</strong></p>
          <p>Due date: <strong>${formatDate(task.dueDate)}</strong></p>
          <p>Priority: <strong>${task.priority.toUpperCase()}</strong></p>
          <p>Status: <strong>${task.status.toUpperCase()}</strong></p>
        </div>
        
        ${task.notes ? `
          <div style="padding:10px; background-color:hsl(var(--primary)/0.05); border-radius:var(--radius-sm); margin-top:10px;">
            <p style="font-size:0.8rem; font-weight:600; margin-bottom:4px;">Operative Notes:</p>
            <p style="font-size:0.85rem; color:hsl(var(--text-muted));">${task.notes}</p>
          </div>
        ` : ''}

        ${task.completionPhoto ? `
          <div style="margin-top:10px; text-align:center;">
            <p style="font-size:0.8rem; font-weight:600; text-align:left; margin-bottom:6px;">Proof Photo:</p>
            <img src="${task.completionPhoto}" style="max-width:100%; max-height:220px; border-radius:var(--radius-sm); border:1px solid hsl(var(--border)); object-fit:contain;">
          </div>
        ` : ''}

        <div style="margin-top:20px;">
          ${actionButtonsHTML}
        </div>
        
        ${completeFormHTML}
      </div>
    `
  });

  // Modal event hooks
  const startBtn = document.getElementById('btn-start-task');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      await updateTask(task.id, { status: 'in_progress' });
      showToast("Task marked as in progress.", "success");
      hideModal();
      init(document.getElementById('view-mount'));
    });
  }

  const completeBtn = document.getElementById('btn-complete-task');
  if (completeBtn) {
    completeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const notes = document.getElementById('complete-notes').value;
      const photoFile = document.getElementById('complete-photo').files[0];

      if (!notes.trim() || !photoFile) {
        showToast("Completion notes and photo are required.", "error");
        return;
      }

      completeBtn.disabled = true;
      completeBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading proof...`;

      try {
        // Upload photo
        const photoUrl = await uploadFile(`tasks/${task.id}`, photoFile);

        await updateTask(task.id, {
          status: 'completed',
          notes,
          completionPhoto: photoUrl
        });

        // Notify managers
        showToast("Task submitted for manager review.", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
        completeBtn.disabled = false;
        completeBtn.textContent = "Submit for Review";
      }
    });
  }

  const approveBtn = document.getElementById('btn-approve-task');
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      await updateTask(task.id, { status: 'approved' });
      await createNotification(task.assignedTo, "Task Approved", `Your work on "${task.title}" has been reviewed and approved.`, "task");
      showToast("Task approved and closed.", "success");
      hideModal();
      init(document.getElementById('view-mount'));
    });
  }

  const rejectBtn = document.getElementById('btn-reject-task');
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async () => {
      const reason = prompt("Enter return/rejection reason for operative:");
      if (reason === null) return; // cancel
      
      await updateTask(task.id, {
        status: 'in_progress',
        notes: `Returned: ${reason}. Original notes: ${task.notes || ''}`
      });
      
      await createNotification(task.assignedTo, "Task Returned", `Your work on "${task.title}" was returned: ${reason}`, "task");
      showToast("Task returned to operative.", "warning");
      hideModal();
      init(document.getElementById('view-mount'));
    });
  }
}
