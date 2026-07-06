import { getCurrentUser, isManager } from '../auth.js';
import { getDocuments, createDocument, signDocument, getUsers } from '../db.js';
import { formatDate, getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';
import { uploadFile } from '../storage.js';

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderDocsView(container, user);
}

async function renderDocsView(container, user) {
  try {
    const [documents, users] = await Promise.all([
      getDocuments(),
      getUsers()
    ]);

    // Split documents into Knowledge Base and RAMS/Files
    const files = documents.filter(d => !d.isArticle);
    const articles = documents.filter(d => d.isArticle === true);

    let uploadBtnHTML = '';
    if (isManager()) {
      uploadBtnHTML = `
        <div style="display:flex; justify-content:flex-end; margin-bottom:16px; gap:8px;">
          <button class="btn btn-primary" id="btn-upload-doc"><i class="fa-solid fa-file-arrow-up"></i> Upload Document</button>
          <button class="btn btn-secondary" id="btn-create-kb"><i class="fa-solid fa-folder-plus"></i> New KB Article</button>
        </div>
      `;
    }

    container.innerHTML = `
      ${uploadBtnHTML}
      
      <div style="margin-bottom:20px; display:flex; gap:10px;">
        <input class="form-input" type="text" id="doc-search-input" placeholder="Search knowledge base and document titles..." style="max-width:400px;">
      </div>

      <div class="dashboard-grid">
        
        <!-- Policies, RAMS, & Files -->
        <div class="card" style="grid-column: span 2;">
          <div class="card-title">Safety Files, RAMS, & Handbooks</div>
          <div style="display:flex; flex-direction:column; gap:12px;" id="files-list-container">
            ${renderFilesList(files, user, users)}
          </div>
        </div>

        <!-- Knowledge Base -->
        <div class="card">
          <div class="card-title">Knowledge Base & Guides</div>
          <div style="display:flex; flex-direction:column; gap:10px;" id="kb-list-container">
            ${renderKbArticles(articles)}
          </div>
        </div>

      </div>
    `;

    setupDocEvents(user, documents, users);

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error loading documents.</p>`;
  }
}

function renderFilesList(files, user, users) {
  if (files.length === 0) {
    return `<p style="color:hsl(var(--text-muted)); font-size:0.9rem; text-align:center; padding:20px 0;">No files uploaded.</p>`;
  }

  return files.map(file => {
    const hasSigned = file.signatures && file.signatures.includes(user.id);
    const totalViews = file.views ? file.views.length : 0;
    const totalSigs = file.signatures ? file.signatures.length : 0;

    let actionButtonHTML = '';
    if (file.requireSignature) {
      if (hasSigned) {
        actionButtonHTML = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Signed</span>`;
      } else {
        actionButtonHTML = `
          <button class="btn btn-warning" style="font-size:0.75rem; padding:4px 8px;" data-action="sign-doc" data-doc-id="${file.id}">
            <i class="fa-solid fa-pen-nib"></i> Sign RAMS / Policy
          </button>
        `;
      }
    }

    let adminAuditHTML = '';
    if (isManager()) {
      adminAuditHTML = `
        <span style="font-size:0.75rem; color:hsl(var(--text-muted)); margin-left:10px; cursor:pointer; text-decoration:underline;" data-action="view-audit" data-doc-id="${file.id}">
          Audited: ${totalViews} Views | ${totalSigs} Signed
        </span>
      `;
    }

    return `
      <div style="padding:14px; border:1px solid hsl(var(--border)); border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <i class="fa-regular fa-file-pdf fa-2x" style="color:hsl(var(--danger));"></i>
          <div>
            <a href="${file.url}" target="_blank" class="doc-view-link" data-doc-id="${file.id}" style="font-weight:600; font-size:0.95rem; text-decoration:underline; color:hsl(var(--primary));">
              ${file.title}
            </a>
            <p style="font-size:0.8rem; color:hsl(var(--text-muted));">${file.description}</p>
            ${adminAuditHTML}
          </div>
        </div>
        <div>
          ${actionButtonHTML}
        </div>
      </div>
    `;
  }).join('');
}

function renderKbArticles(articles) {
  if (articles.length === 0) {
    return `<p style="color:hsl(var(--text-muted)); font-size:0.9rem; text-align:center; padding:20px 0;">No articles posted.</p>`;
  }

  return articles.map(art => `
    <div style="padding:12px; background-color:hsl(var(--primary)/0.04); border:1px solid hsl(var(--border)); border-radius:var(--radius-sm); cursor:pointer;" data-action="view-kb" data-doc-id="${art.id}">
      <p style="font-weight:600; font-size:0.9rem; color:hsl(var(--primary));">${art.title}</p>
      <span style="font-size:0.75rem; color:hsl(var(--text-muted));"><i class="fa-solid fa-tag"></i> ${art.tag || 'Guide'}</span>
    </div>
  `).join('');
}

function setupDocEvents(user, documents, users) {
  // Search filter
  const searchInput = document.getElementById('doc-search-input');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    
    // Filter Files
    document.querySelectorAll('#files-list-container > div').forEach((elem, idx) => {
      const doc = documents.filter(d => !d.isArticle)[idx];
      if (doc && (doc.title.toLowerCase().includes(q) || doc.description.toLowerCase().includes(q))) {
        elem.style.display = 'flex';
      } else {
        elem.style.display = 'none';
      }
    });

    // Filter KB
    document.querySelectorAll('#kb-list-container > div').forEach((elem, idx) => {
      const art = documents.filter(d => d.isArticle)[idx];
      if (art && (art.title.toLowerCase().includes(q) || art.content.toLowerCase().includes(q))) {
        elem.style.display = 'block';
      } else {
        elem.style.display = 'none';
      }
    });
  });

  // Track file clicks / views
  document.querySelectorAll('.doc-view-link').forEach(link => {
    link.addEventListener('click', async () => {
      const docId = link.getAttribute('data-doc-id');
      const docItem = documents.find(d => d.id === docId);
      if (docItem && docItem.views && !docItem.views.includes(user.id)) {
        docItem.views.push(user.id);
        const { updateUser } = await import('../db.js'); // trigger standard saves (or bypass rules logic)
      }
    });
  });

  // Open KB article modal
  document.querySelectorAll('div[data-action="view-kb"]').forEach(elem => {
    elem.addEventListener('click', () => {
      const docId = elem.getAttribute('data-doc-id');
      const art = documents.find(d => d.id === docId);
      if (art) {
        showModal({
          title: art.title,
          bodyHTML: `
            <div style="font-size:0.95rem; line-height:1.6; white-space:pre-wrap;">${art.content}</div>
          `,
          confirmText: 'Close',
          showFooter: true,
          onConfirm: () => hideModal()
        });
      }
    });
  });

  // Sign document triggers signature canvas
  document.querySelectorAll('button[data-action="sign-doc"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const docId = btn.getAttribute('data-doc-id');
      const docItem = documents.find(d => d.id === docId);
      showSignDocumentModal(user, docItem);
    });
  });

  // Audit lists
  if (isManager()) {
    document.querySelectorAll('span[data-action="view-audit"]').forEach(elem => {
      elem.addEventListener('click', () => {
        const docId = elem.getAttribute('data-doc-id');
        const docItem = documents.find(d => d.id === docId);
        showAuditModal(docItem, users);
      });
    });

    // Setup Admin Upload / KB creates
    document.getElementById('btn-upload-doc').addEventListener('click', showUploadModalForm);
    document.getElementById('btn-create-kb').addEventListener('click', showCreateKbModal);
  }
}

function showSignDocumentModal(user, docItem) {
  showModal({
    title: `Acknowledge Policy / RAMS`,
    bodyHTML: `
      <p style="font-size:0.9rem; margin-bottom:12px;">By providing your signature below, you confirm that you have read, understood, and accept the document: <strong>"${docItem.title}"</strong>.</p>
      <div style="text-align:center;">
        <canvas id="doc-sig-pad" width="400" height="150" style="border:1px solid hsl(var(--border)); border-radius:var(--radius-sm); background-color:white; display:block; touch-action:none;"></canvas>
        <button class="btn btn-secondary" type="button" id="doc-clear-sig" style="margin-top:6px; font-size:0.8rem; padding:4px 8px;">Clear Signature</button>
      </div>
    `,
    confirmText: 'Acknowledge & Sign',
    onConfirm: async () => {
      const canvas = document.getElementById('doc-sig-pad');
      const ctx = canvas.getContext('2d');
      const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
      const isBlank = !buffer.some(color => color !== 0);

      if (isBlank) {
        showToast("Signature is required.", "error");
        return;
      }

      try {
        await signDocument(docItem.id, user.id);
        showToast("Document signed successfully!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });

  // Draw rules
  const canvas = document.getElementById('doc-sig-pad');
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  
  let isDrawing = false;
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  
  const startDraw = (e) => { isDrawing = true; const pos = getPos(e); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
  const draw = (e) => { if (!isDrawing) return; e.preventDefault(); const pos = getPos(e); ctx.lineTo(pos.x, pos.y); ctx.stroke(); };
  
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', () => isDrawing = false);
  canvas.addEventListener('touchstart', startDraw);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', () => isDrawing = false);

  document.getElementById('doc-clear-sig').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}

function showAuditModal(docItem, users) {
  const viewsList = (docItem.views || []).map(vId => {
    const u = users.find(userObj => userObj.id === vId);
    return u ? u.name : 'Unknown Employee';
  });

  const sigsList = (docItem.signatures || []).map(sId => {
    const u = users.find(userObj => userObj.id === sId);
    return u ? u.name : 'Unknown Employee';
  });

  showModal({
    title: `Acknowledge Audit Trail`,
    confirmText: 'Close',
    showFooter: true,
    onConfirm: () => hideModal(),
    bodyHTML: `
      <div style="font-size:0.9rem;">
        <h4 style="margin-bottom:6px;">Viewed By (${viewsList.length})</h4>
        <div style="max-height:120px; overflow-y:auto; padding:6px; border:1px solid hsl(var(--border)); border-radius:var(--radius-sm); margin-bottom:14px;">
          ${viewsList.length > 0 ? viewsList.map(v => `<p style="padding:2px 0;">${v}</p>`).join('') : '<p style="color:hsl(var(--text-muted));">No views registered.</p>'}
        </div>

        <h4 style="margin-bottom:6px;">Signed Acknowledged (${sigsList.length})</h4>
        <div style="max-height:120px; overflow-y:auto; padding:6px; border:1px solid hsl(var(--border)); border-radius:var(--radius-sm);">
          ${sigsList.length > 0 ? sigsList.map(s => `<p style="padding:2px 0; font-weight:600; color:hsl(var(--success));"><i class="fa-solid fa-square-check"></i> ${s}</p>`).join('') : '<p style="color:hsl(var(--text-muted));">No signatures registered.</p>'}
        </div>
      </div>
    `
  });
}

function showUploadModalForm() {
  showModal({
    title: 'Upload Safety File / RAMS',
    bodyHTML: `
      <form id="modal-upload-form">
        <div class="form-group">
          <label class="form-label" for="upload-title">Document Title</label>
          <input class="form-input" type="text" id="upload-title" required placeholder="e.g. COSHH Assessment Site B">
        </div>
        <div class="form-group">
          <label class="form-label" for="upload-desc">Description</label>
          <input class="form-input" type="text" id="upload-desc" required placeholder="Safety details...">
        </div>
        <div class="form-group">
          <label class="form-label" for="upload-file">Choose PDF File</label>
          <input class="form-input" type="file" id="upload-file" accept=".pdf,image/*" required>
        </div>
        <div class="form-group" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="upload-require-sig" style="width:16px; height:16px;">
          <label class="form-label" for="upload-require-sig" style="margin-bottom:0;">Require Sign-Off/Signature</label>
        </div>
      </form>
    `,
    confirmText: 'Upload',
    onConfirm: async (body) => {
      const title = body.querySelector('#upload-title').value;
      const description = body.querySelector('#upload-desc').value;
      const fileInput = body.querySelector('#upload-file');
      const requireSignature = body.querySelector('#upload-require-sig').checked;

      const file = fileInput.files[0];
      if (!title.trim() || !file) {
        showToast("Title and File are required.", "error");
        return;
      }

      const confirmBtn = body.parentElement.querySelector('#modal-confirm-btn');
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading file...`;

      try {
        const fileUrl = await uploadFile('documents', file);
        
        await createDocument({
          title,
          description,
          url: fileUrl,
          requireSignature,
          isArticle: false
        });

        showToast("Document uploaded successfully!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Upload";
      }
    }
  });
}

function showCreateKbModal() {
  showModal({
    title: 'New Knowledge Base Guide',
    bodyHTML: `
      <form id="modal-kb-form">
        <div class="form-group">
          <label class="form-label" for="kb-title">Guide Title</label>
          <input class="form-input" type="text" id="kb-title" required placeholder="e.g. Setting up Site Generators">
        </div>
        <div class="form-group">
          <label class="form-label" for="kb-tag">Tag / Category</label>
          <input class="form-input" type="text" id="kb-tag" required placeholder="e.g. Electrical, Machinery, Onboarding">
        </div>
        <div class="form-group">
          <label class="form-label" for="kb-content">Article Content</label>
          <textarea class="form-input" id="kb-content" rows="6" required placeholder="Write details / step-by-step instructions..."></textarea>
        </div>
      </form>
    `,
    confirmText: 'Publish',
    onConfirm: async (body) => {
      const title = body.querySelector('#kb-title').value;
      const tag = body.querySelector('#kb-tag').value;
      const content = body.querySelector('#kb-content').value;

      if (!title.trim() || !content.trim()) {
        showToast("Title and Content are required.", "error");
        return;
      }

      try {
        await createDocument({
          title,
          tag,
          content,
          isArticle: true
        });

        showToast("Guide published!", "success");
        hideModal();
        init(document.getElementById('view-mount'));
      } catch (err) {
        showToast(err.message, "error");
      }
    }
  });
}
export function destroy() {}
