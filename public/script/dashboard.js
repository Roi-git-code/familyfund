
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const content = document.querySelector('.content');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('show');
      content.classList.toggle('shift');
    });
  }

  const passwordModal = document.getElementById('passwordModal');
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  const feedbackMessage = document.getElementById('feedbackMessage');
  const passwordMatchError = document.getElementById('passwordMatchError');
  const changePasswordForm = document.getElementById('changePasswordForm');

  if (changePasswordBtn && passwordModal) {
    changePasswordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log("Manage Password clicked"); // Debug line
      passwordModal.classList.add('show');
    });
  }

  if (passwordModal) {
    passwordModal.addEventListener('click', (e) => {
      if (e.target === passwordModal) {
        passwordModal.classList.remove('show');
        clearFeedback();
        if (changePasswordForm) changePasswordForm.reset();
      }
    });
  }

  function clearFeedback() {
    if(feedbackMessage) feedbackMessage.style.display = 'none';
    if(passwordMatchError) passwordMatchError.style.display = 'none';
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newPass = document.getElementById('newPassword').value;
      const confirmPass = document.getElementById('confirmNewPassword').value;

      if (newPass !== confirmPass) {
        passwordMatchError.style.display = 'block';
        return;
      }

      passwordMatchError.style.display = 'none';

      const formData = new FormData(changePasswordForm);
      const data = Object.fromEntries(formData.entries());

      try {
        const response = await fetch('/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
          showFeedback('Password updated successfully!', 'success');
          changePasswordForm.reset();
          setTimeout(() => {
            passwordModal.classList.remove('show');
          }, 1500);
        } else {
          showFeedback(result.message || 'Password update failed.', 'error');
        }
      } catch (err) {
        showFeedback('Error updating password. Try again later.', 'error');
      }
    });
  }

  function showFeedback(message, type) {
    if (!feedbackMessage) return;
    feedbackMessage.textContent = message;
    feedbackMessage.className = 'feedback ' + (type === 'success' ? 'success' : 'error');
    feedbackMessage.style.display = 'block';

    setTimeout(() => {
      feedbackMessage.style.display = 'none';
    }, 4000);
  }
});


