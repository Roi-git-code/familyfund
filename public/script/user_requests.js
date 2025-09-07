document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('requestModal');
  const modalCloseBtn = modal.querySelector('.modal-close');
  const requestIdElement = document.getElementById('requestId');
  const userNameElement = document.getElementById('userName');
  const submittedDateElement = document.getElementById('submittedDate');
  const requestStatusElement = document.getElementById('requestStatus');
  const changesBody = document.getElementById('changesBody');
  const rejectReasonContainer = document.getElementById('rejectReasonContainer');
  const rejectReasonTextarea = document.getElementById('rejectReason');
  const btnApprove = modal.querySelector('.btn-approve');
  const btnReject = modal.querySelector('.btn-reject');
  const btnConfirmReject = modal.querySelector('.btn-confirm-reject');

  let currentRequest = null;

  // ✅ NEW: Click "Review" button to open modal (not the whole row)
  document.querySelectorAll('.btn-review').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const row = btn.closest('.request-row');
      if (!row) return;
      const request = JSON.parse(row.dataset.request);
      currentRequest = request;
      showModal(request);
    });
  });

  function showModal(request) {
    requestIdElement.textContent = request.id;
    userNameElement.textContent = request.member_name;
    submittedDateElement.textContent = new Date(request.created_at).toLocaleString();
    requestStatusElement.textContent = request.status;

    requestStatusElement.className = '';
    requestStatusElement.classList.add(`status-${request.status.toLowerCase().replace(/\s+/g, '-')}`);

    changesBody.innerHTML = '';
    const entries = request.updated_fields ? Object.entries(request.updated_fields) : [];
    entries.forEach(([field, value]) => {
      const row = document.createElement('tr');

      const fieldCell = document.createElement('td');
      fieldCell.textContent = field.replace(/_/g, ' ').toUpperCase();

      const currentCell = document.createElement('td');
      currentCell.textContent = request.old_values?.[field] || 'N/A';

      const requestedCell = document.createElement('td');
      requestedCell.textContent = value;

      row.appendChild(fieldCell);
      row.appendChild(currentCell);
      row.appendChild(requestedCell);
      changesBody.appendChild(row);
    });

    rejectReasonTextarea.value = '';
    rejectReasonContainer.style.display = 'none';
    btnReject.style.display = 'inline-block';
    btnConfirmReject.style.display = 'none';

    modal.classList.add('show');
  }

  function closeModal() { modal.classList.remove('show'); }
  modalCloseBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  btnReject.addEventListener('click', () => {
    rejectReasonContainer.style.display = 'block';
    btnReject.style.display = 'none';
    btnConfirmReject.style.display = 'inline-block';
    rejectReasonTextarea.focus();
  });

  btnConfirmReject.addEventListener('click', () => {
    const reason = rejectReasonTextarea.value.trim();
    if (!reason) {
      alert('Please provide a reason for rejection.');
      rejectReasonTextarea.focus();
      return;
    }
    if (confirm('Are you sure you want to REJECT this update request?')) {
      updateRequestStatus(currentRequest.id, 'reject', reason);
    }
  });

  btnApprove.addEventListener('click', () => {
    if (!currentRequest) return;
    if (confirm('Are you sure you want to APPROVE this update request?')) {
      updateRequestStatus(currentRequest.id, 'approve', '');
    }
  });

  async function updateRequestStatus(requestId, action, reason) {
    try {
      const response = await fetch('/user-requests/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, reason })
      });
      if (response.ok) {
        alert(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully!`);
        location.reload();
      } else {
        const data = await response.json().catch(() => ({}));
        alert('Error: ' + (data.message || 'Could not update request.'));
      }
    } catch (err) {
      alert('Network error. Please try again later.');
    }
  }

  const scrollLink = document.getElementById('scrollToRequests');
  if (scrollLink) {
    scrollLink.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('requestsTable').scrollIntoView({ behavior: 'smooth' });
    });
  }
});

