document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    // Skip validation if using AJAX
    if (form.hasAttribute("data-ajax")) return;

    // Existing required field checks...
    let valid = true;
    const requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(field => {
      if (!field.value.trim()) {
        valid = false;
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-message';
        errorMsg.innerText = 'This field is required';
        errorMsg.style.color = 'red';
        errorMsg.style.fontSize = '13px';
        field.parentNode.appendChild(errorMsg);
      }
    });

    // Date check
    const dobField = form.querySelector('input[name="date_of_birth"]');
    if (dobField && dobField.value) {
      const dob = new Date(dobField.value);
      const today = new Date();
      if (dob > today) {
        valid = false;
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-message';
        errorMsg.innerText = 'Date of Birth cannot be in the future';
        errorMsg.style.color = 'red';
        errorMsg.style.fontSize = '13px';
        dobField.parentNode.appendChild(errorMsg);
      }
    }

    if (!valid) e.preventDefault();
  });
});
