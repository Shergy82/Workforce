import { getCurrentUser, isManager } from '../auth.js';
import { getForms, createForm, getFormSubmissions, submitForm, getProjects, getUsers } from '../db.js';
import { formatDate, getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';
import { uploadFile } from '../storage.js';

let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderFormsView(container, user);
}

async function renderFormsView(container, user) {
  try {
    const [forms, submissions, projects, users] = await Promise.all([
      getForms(),
      getFormSubmissions(),
      getProjects(),
      getUsers()
    ]);

    if (isManager()) {
      renderAdminForms(container, user, forms, submissions, projects, users);
    } else {
      renderOperativeForms(container, user, forms, projects);
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error loading checklists.</p>`;
  }
}

// ----------------------------------------------------
// OPERATIVE FORMS VIEW
// ----------------------------------------------------
function renderOperativeForms(container, user, forms, projects) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">Fill Out Checklist / Form</div>
      <form id="fill-form-selector">
        <div class="form-group">
          <label class="form-label" for="select-form-tmpl">Select Form Template</label>
          <select class="form-input" id="select-form-tmpl" required>
            <option value="">-- Choose Template --</option>
            ${forms.map(f => `<option value="${f.id}">${f.title}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="select-form-proj">Related Site Project</label>
          <select class="form-input" id="select-form-proj" required>
            <option value="">-- Choose Site --</option>
            ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
      </form>
      <div id="dynamic-form-container" style="margin-top: 20px;"></div>
    </div>
  `;

  const tmplSelect = document.getElementById('select-form-tmpl');
  tmplSelect.addEventListener('change', () => {
    const formId = tmplSelect.value;
    const projectSelect = document.getElementById('select-form-proj');
    const formContainer = document.getElementById('dynamic-form-container');

    if (!formId) {
      formContainer.innerHTML = '';
      return;
    }

    const tmpl = forms.find(f => f.id === formId);
    renderDynamicFormFields(formContainer, tmpl, projectSelect);
  });
}

function renderDynamicFormFields(container, tmpl, projectSelect) {
  let fieldsHTML = tmpl.fields.map((field, idx) => {
    const fieldId = `field-${idx}`;
    let inputHTML = '';

    if (field.type === 'text') {
      inputHTML = `<input class="form-input field-response" data-name="${field.name}" data-type="text" id="${fieldId}" required placeholder="Write answer here...">`;
    } else if (field.type === 'yesno') {
      inputHTML = `
        <div style="display:flex; gap:16px; margin-top:6px;">
          <label><input type="radio" name="${fieldId}" class="field-response" data-name="${field.name}" data-type="yesno" value="Yes" required> Yes</label>
          <label><input type="radio" name="${fieldId}" class="field-response" data-name="${field.name}" data-type="yesno" value="No"> No</label>
        </div>
      `;
    } else if (field.type === 'dropdown') {
      const opts = (field.options || '').split(',').map(o => o.trim());
      inputHTML = `
        <select class="form-input field-response" data-name="${field.name}" data-type="dropdown" id="${fieldId}" required>
          <option value="">-- Select option --</option>
          ${opts.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>
      `;
    } else if (field.type === 'photo') {
      inputHTML = `<input class="form-input field-response" data-name="${field.name}" data-type="photo" type="file" id="${fieldId}" accept="image/*" required>`;
    }

    return `
      <div class="form-group" style="border-bottom:1px solid hsl(var(--border)/0.3); padding-bottom:12px;">
        <label class="form-label">${field.name}</label>
        ${inputHTML}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <h4 style="margin-bottom:16px; color:hsl(var(--primary));">${tmpl.description}</h4>
    <form id="active-dynamic-form">
      ${fieldsHTML}
      
      <!-- Signature Pad Panel -->
      <div class="form-group">
        <label class="form-label">Operative Digital Signature</label>
        <canvas id="sig-pad" width="400" height="150" style="border:1px solid hsl(var(--border)); border-radius:var(--radius-sm); background-color:white; display:block; touch-action:none;"></canvas>
        <button class="btn btn-secondary" type="button" id="clear-sig" style="margin-top:6px; font-size:0.8rem; padding:4px 8px;">Clear Signature</button>
      </div>

      <button class="btn btn-success" type="submit" style="width: 100%; margin-top: 20px; padding: 12px; font-weight:600;">
        <i class="fa-solid fa-cloud-arrow-up"></i> Submit Checklist Form
      </button>
    </form>
  `;

  // Init signature Canvas
  initSignaturePad();

  const dynamicForm = document.getElementById('active-dynamic-form');
  dynamicForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const projId = projectSelect.value;
    if (!projId) {
      showToast("Please select the related Site Project first.", "error");
      return;
    }

    const submitBtn = dynamicForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting form...`;

    try {
      const user = getCurrentUser();
      const responses = [];

      // Gather responses
      const elements = dynamicForm.querySelectorAll('.field-response');
      for (const el of elements) {
        const type = el.getAttribute('data-type');
        const name = el.getAttribute('data-name');
        let val = '';

        if (type === 'yesno') {
          if (!el.checked) continue;
          val = el.value;
        } else if (type === 'photo') {
          const file = el.files[0];
          if (file) {
            val = await uploadFile(`forms/${tmpl.id}`, file);
          }
        } else {
          val = el.value;
        }

        responses.push({ name, type, value: val });
      }

      // Check signature data
      const sigData = getSignatureData();
      if (!sigData) {
        showToast("Signature is required.", "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Checklist Form";
        return;
      }

      const proj = projectSelect.options[projectSelect.selectedIndex].text;

      await submitForm({
        formId: tmpl.id,
        formTitle: tmpl.title,
        userId: user.id,
        userName: user.name,
        projectId: projId,
        projectTitle: proj,
        responses,
        signature: sigData
      });

      showToast("Checklist form submitted successfully!", "success");
      tmplSelect.value = '';
      container.innerHTML = '';
    } catch (err) {
      showToast(err.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Checklist Form";
    }
  });
}

function initSignaturePad() {
  signatureCanvas = document.getElementById('sig-pad');
  if (!signatureCanvas) return;

  signatureCtx = signatureCanvas.getContext('2d');
  signatureCtx.strokeStyle = '#0f172a';
  signatureCtx.lineWidth = 2;

  // Clear button
  document.getElementById('clear-sig').addEventListener('click', () => {
    signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  });

  const getPos = (e) => {
    const rect = signatureCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDraw = (e) => {
    isDrawing = true;
    const pos = getPos(e);
    signatureCtx.beginPath();
    signatureCtx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    signatureCtx.lineTo(pos.x, pos.y);
    signatureCtx.stroke();
  };

  const stopDraw = () => {
    isDrawing = false;
  };

  // Mouse events
  signatureCanvas.addEventListener('mousedown', startDraw);
  signatureCanvas.addEventListener('mousemove', draw);
  signatureCanvas.addEventListener('mouseup', stopDraw);

  // Touch events
  signatureCanvas.addEventListener('touchstart', startDraw);
  signatureCanvas.addEventListener('touchmove', draw);
  signatureCanvas.addEventListener('touchend', stopDraw);
}

function getSignatureData() {
  // Quick validation to check if signature is empty
  const buffer = new Uint32Array(signatureCtx.getImageData(0, 0, signatureCanvas.width, signatureCanvas.height).data.buffer);
  const isBlank = !buffer.some(color => color !== 0);
  if (isBlank) return null;
  return signatureCanvas.toDataURL(); // Data URI string
}

// ----------------------------------------------------
// ADMIN FORMS & SUBMISSIONS VIEWS
// ----------------------------------------------------
function renderAdminForms(container, user, templates, submissions, projects, users) {
  container.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px; gap:8px;">
      <button class="btn btn-primary" id="btn-create-form-template"><i class="fa-solid fa-circle-plus"></i> New Form Template</button>
    </div>

    <!-- Active Templates List -->
    <div class="card">
      <div class="card-title">Checklist Form Templates</div>
      ${templates.length > 0 ? `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Form Title</th>
                <th>Description</th>
                <th>Total Fields</th>
                <th>Created Date</th>
              </tr>
            </thead>
            <tbody>
              ${templates.map(t => `
                <tr>
                  <td style="font-weight:600;">${t.title}</td>
                  <td>${t.description}</td>
                  <td>${t.fields.length} fields</td>
                  <td>${formatDate(t.createdAt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <p style="color:hsl(var(--text-muted)); font-size:0.9rem; text-align:center; padding:20px 0;">No form templates built yet.</p>
      `}
    </div>

    <!-- Submissions History -->
    <div class="card" style="margin-top:24px;">
      <div class="card-title">Operative Form Submissions</div>
      ${submissions.length > 0 ? `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Checklist Title</th>
                <th>Site Project</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${submissions.map(sub => `
                <tr>
                  <td>${formatDate(sub.submittedAt)}</td>
                  <td style="font-weight:600;">${sub.userName}</td>
                  <td>${sub.formTitle}</td>
                  <td>${sub.projectTitle}</td>
                  <td>
                    <button class="btn btn-secondary" style="font-size:0.75rem; padding:4px 8px;" data-action="view-sub" data-sub-id="${sub.id}">
                      <i class="fa-solid fa-file-invoice"></i> View Details / PDF
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <p style="color:hsl(var(--text-muted)); font-size:0.9rem; text-align:center; padding:20px 0;">No submissions logged.</p>
      `}
    </div>
  `;

  // Hooks
  document.getElementById('btn-create-form-template').addEventListener('click', showCreateTemplateModal);

  document.querySelectorAll('button[data-action="view-sub"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.getAttribute('data-sub-id');
      const sub = submissions.find(s => s.id === subId);
      if (sub) {
        showSubmissionDetailsModal(sub);
      }
    });
  });
}

function showCreateTemplateModal() {
  const fields = [];
  
  const updateFieldsHTML = (c) => {
    const list = c.querySelector('#field-items-list');
    list.innerHTML = fields.map((f, i) => `
      <div style="display:flex; gap:10px; margin-bottom:8px; align-items:center;">
        <span style="font-size:0.8rem; font-weight:700; color:hsl(var(--text-muted));">#${i+1}</span>
        <input class="form-input field-label-input" style="flex:2;" data-idx="${i}" type="text" value="${f.name}" placeholder="Field Question/Label">
        <select class="form-input field-type-select" style="flex:1;" data-idx="${i}">
          <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text Input</option>
          <option value="yesno" ${f.type === 'yesno' ? 'selected' : ''}>Yes / No</option>
          <option value="dropdown" ${f.type === 'dropdown' ? 'selected' : ''}>Dropdown Select</option>
          <option value="photo" ${f.type === 'photo' ? 'selected' : ''}>Photo Upload</option>
        </select>
        <input class="form-input field-opts-input" style="flex:1; display:${f.type === 'dropdown' ? 'block' : 'none'}" data-idx="${i}" type="text" value="${f.options || ''}" placeholder="Opt1,Opt2,Opt3">
        <button class="btn btn-danger btn-remove-field" style="padding:8px;" data-idx="${i}" type="button">&times;</button>
      </div>
    `).join('');

    // Rebind input changes to array
    list.querySelectorAll('.field-label-input').forEach(input => {
      input.addEventListener('change', (e) => {
        fields[e.target.dataset.idx].name = e.target.value;
      });
    });

    list.querySelectorAll('.field-type-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const idx = e.target.dataset.idx;
        fields[idx].type = e.target.value;
        updateFieldsHTML(c);
      });
    });

    list.querySelectorAll('.field-opts-input').forEach(input => {
      input.addEventListener('change', (e) => {
        fields[e.target.dataset.idx].options = e.target.value;
      });
    });

    list.querySelectorAll('.btn-remove-field').forEach(btn => {
      btn.addEventListener('click', (e) => {
        fields.splice(e.target.dataset.idx, 1);
        updateFieldsHTML(c);
      });
    });
  };

  showModal({
    title: 'Design Checklist Template',
    bodyHTML: `
      <div id="form-builder-body">
        <div class="form-group">
          <label class="form-label" for="builder-title">Checklist Form Title</label>
          <input class="form-input" type="text" id="builder-title" required placeholder="e.g. Near Miss Report">
        </div>
        <div class="form-group">
          <label class="form-label" for="builder-desc">Brief Instructions / Description</label>
          <input class="form-input" type="text" id="builder-desc" required placeholder="Guidelines for staff...">
        </div>
        
        <div style="border-top: 1px solid hsl(var(--border)); padding-top:16px; margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="font-size:0.95rem;">Fields Configuration</h4>
            <button class="btn btn-secondary" style="font-size:0.8rem; padding:4px 8px;" type="button" id="btn-add-builder-field">+ Add Field</button>
          </div>
          <div id="field-items-list"></div>
        </div>
      </div>
    `,
    confirmText: 'Create Template',
    onConfirm: async (body) => {
      const title = body.querySelector('#builder-title').value;
      const description = body.querySelector('#builder-desc').value;

      if (!title.trim() || fields.length === 0) {
        showToast("Please provide a Title and configure at least one field.", "error");
        return;
      }

      try {
        const user = getCurrentUser();
        await createForm({
          title,
          description,
          fields,
          createdBy: user.id
        });

        showToast("Checklist form template created!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });

  // Wire builders button
  const bodyRef = document.getElementById('form-builder-body');
  document.getElementById('btn-add-builder-field').addEventListener('click', () => {
    fields.push({ name: '', type: 'text', options: '' });
    updateFieldsHTML(bodyRef);
  });
}

function showSubmissionDetailsModal(sub) {
  showModal({
    title: `${sub.formTitle} - Submission Details`,
    confirmText: 'Print / Save PDF',
    cancelText: 'Close',
    onConfirm: () => {
      window.print();
    },
    bodyHTML: `
      <div style="display:flex; flex-direction:column; gap:10px; font-size:0.9rem;">
        <p>Submitted by: <strong>${sub.userName}</strong></p>
        <p>Date: <strong>${formatDate(sub.submittedAt)}</strong></p>
        <p>Project: <strong>${sub.projectTitle}</strong></p>
        
        <div style="border-top:1px solid hsl(var(--border)); padding-top:14px; margin-top:10px; display:flex; flex-direction:column; gap:12px;">
          ${sub.responses.map(r => `
            <div>
              <p style="font-weight:600; font-size:0.85rem; color:hsl(var(--text-muted));">${r.name}</p>
              ${r.type === 'photo' && r.value ? `
                <img src="${r.value}" style="max-width:100%; max-height:160px; border-radius:var(--radius-sm); border:1px solid hsl(var(--border)); margin-top:6px; object-fit:contain;">
              ` : `<p style="font-size:0.95rem;">${r.value || 'N/A'}</p>`}
            </div>
          `).join('')}
        </div>
        
        <div style="border-top:1px solid hsl(var(--border)); padding-top:14px; margin-top:10px;">
          <p style="font-weight:600; font-size:0.85rem; color:hsl(var(--text-muted)); margin-bottom:6px;">Signature</p>
          <img src="${sub.signature}" style="border:1px solid hsl(var(--border)); border-radius:var(--radius-sm); background-color:white; max-height:80px; width:200px; object-fit:contain;">
        </div>
      </div>
    `
  });
}
export function destroy() {}
