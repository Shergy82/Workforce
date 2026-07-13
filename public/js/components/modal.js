const overlay = document.getElementById('app-modal');
const titleElem = document.getElementById('modal-title');
const bodyElem = document.getElementById('modal-body');
const closeBtn = document.getElementById('modal-close-btn');
const cancelBtn = document.getElementById('modal-cancel-btn');
const confirmBtn = document.getElementById('modal-confirm-btn');

let activeConfirmCallback = null;
let activeCancelCallback = null;

export function showModal({
  title,
  bodyHTML,
  onConfirm = null,
  onCancel = null,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  showFooter = true,
  showCloseBtn = true
}) {
  titleElem.textContent = title;
  bodyElem.innerHTML = bodyHTML;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;
  confirmBtn.disabled = false;

  document.getElementById('modal-footer').style.display = showFooter ? 'flex' : 'none';
  closeBtn.style.display = showCloseBtn ? '' : 'none';

  activeConfirmCallback = onConfirm;
  activeCancelCallback = onCancel;

  overlay.classList.add('active');
}

export function hideModal() {
  overlay.classList.remove('active');
  activeConfirmCallback = null;
  activeCancelCallback = null;
  confirmBtn.disabled = false;
  closeBtn.style.display = '';
}

closeBtn.addEventListener('click', () => {
  if (activeCancelCallback) {
    try {
      activeCancelCallback();
    } catch (err) {
      console.error('Modal cancel callback error:', err);
    }
  }
  hideModal();
});

cancelBtn.addEventListener('click', () => {
  if (activeCancelCallback) {
    try {
      activeCancelCallback();
    } catch (err) {
      console.error('Modal cancel callback error:', err);
    }
  }
  hideModal();
});

confirmBtn.addEventListener('click', () => {
  if (confirmBtn.disabled) return; // Guard against double-fire on rapid taps
  if (activeConfirmCallback) {
    confirmBtn.disabled = true; // Prevent re-entry while async callback runs
    const cb = activeConfirmCallback;
    Promise.resolve(cb(bodyElem)).catch(err => {
      console.error('Modal confirm callback error:', err);
    }).finally(() => {
      // Only re-enable if modal is still open (not hidden by the callback itself)
      if (overlay.classList.contains('active')) {
        confirmBtn.disabled = false;
      }
    });
  } else {
    hideModal();
  }
});
