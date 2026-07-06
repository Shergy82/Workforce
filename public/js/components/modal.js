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
  showFooter = true
}) {
  titleElem.textContent = title;
  bodyElem.innerHTML = bodyHTML;
  confirmBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;

  document.getElementById('modal-footer').style.display = showFooter ? 'flex' : 'none';

  activeConfirmCallback = onConfirm;
  activeCancelCallback = onCancel;

  overlay.classList.add('active');
}

export function hideModal() {
  overlay.classList.remove('active');
  activeConfirmCallback = null;
  activeCancelCallback = null;
}

closeBtn.addEventListener('click', () => {
  if (activeCancelCallback) activeCancelCallback();
  hideModal();
});

cancelBtn.addEventListener('click', () => {
  if (activeCancelCallback) activeCancelCallback();
  hideModal();
});

confirmBtn.addEventListener('click', () => {
  if (activeConfirmCallback) {
    activeConfirmCallback(bodyElem);
  } else {
    hideModal();
  }
});
