// modal.js

function showError(message, container = document.querySelector('#modal-message')) {
  if (!container) return;
  container.innerHTML = `<p class="error">${message}</p>`;
  container.classList.add('error');
  setTimeout(() => container.classList.remove('error'), 5000);
}

// Simple openModal for custom content, disables confirm by default
function openModal({ content = '', onConfirm = null, onCancel = null, confirmText = 'Confirm', cancelText = 'Cancel', disableConfirm = false } = {}) {
  const modalOverlay = document.querySelector('#modal-overlay');
  const modalMessage = document.querySelector('#modal-message');
  const modalConfirm = document.querySelector('#modal-confirm');
  const modalCancel = document.querySelector('#modal-cancel');
  const modal = document.querySelector('.modal');

  if (!modalOverlay || !modalMessage || !modalConfirm || !modalCancel) return;

  // Set content and buttons
  modalMessage.innerHTML = content;
  modalConfirm.textContent = confirmText;
  modalCancel.textContent = cancelText;
  modalConfirm.disabled = !!disableConfirm;

  modalOverlay.style.display = 'flex';
  modal.style.animation = 'modalFadeIn 0.22s forwards';

  // Remove old listeners, add new
  const newConfirm = modalConfirm.cloneNode(true);
  modalConfirm.parentNode.replaceChild(newConfirm, modalConfirm);
  const newCancel = modalCancel.cloneNode(true);
  modalCancel.parentNode.replaceChild(newCancel, modalCancel);

  newConfirm.addEventListener('click', () => {
    if (onConfirm) onConfirm();
  });
  newCancel.addEventListener('click', () => {
    if (onCancel) onCancel();
    closeModal();
  });

  // Overlay click closes modal
  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) closeModal();
  };
}

// Close modal
function closeModal() {
  const modalOverlay = document.querySelector('#modal-overlay');
  const modal = document.querySelector('.modal');
  if (!modalOverlay || !modal) return;
  modal.style.animation = 'modalFadeOut 0.22s forwards';
  setTimeout(() => {
    modalOverlay.style.display = 'none';
    modal.style.animation = '';
  }, 220);
}

// Keyframes (unique variable name)
const modalStyleSheet = document.createElement('style');
modalStyleSheet.textContent = `
  @keyframes modalFadeIn {
    0% { opacity: 0; transform: scale(0.95);}
    100% { opacity: 1; transform: scale(1);}
  }
  @keyframes modalFadeOut {
    0% { opacity: 1; transform: scale(1);}
    100% { opacity: 0; transform: scale(0.95);}
  }
`;
document.head.appendChild(modalStyleSheet);

window.openModal = openModal;
window.closeModal = closeModal;
