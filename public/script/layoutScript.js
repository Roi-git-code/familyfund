
//Contribution-form validation
document.addEventListener('DOMContentLoaded', () => {
  const flashContainer = document.getElementById('flashContainer');
  if (document.querySelector('.flash-message')) flashContainer.style.display = 'block';

  document.querySelectorAll('.close-flash').forEach(btn => {
    btn.addEventListener('click', e => {
      e.target.closest('.flash-message').remove();
      if (!document.querySelector('.flash-message')) flashContainer.style.display = 'none';
    });
  });

  setTimeout(() => {
    document.querySelectorAll('.flash-message').forEach(msg => msg.remove());
    if (flashContainer) flashContainer.style.display = 'none';
  }, 4500);

  // Form validation
  const form = document.getElementById('contributionForm');
  const memberId = document.getElementById('member_id');
  const amount = document.getElementById('amount');
  const memberIdError = document.getElementById('memberIdError');
  const amountError = document.getElementById('amountError');

  form.addEventListener('submit', e => {
    let valid = true;

    // Member ID validation
    if (!memberId.value || memberId.value <= 0) {
      memberIdError.style.display = 'block';
      valid = false;
    } else {
      memberIdError.style.display = 'none';
    }

    // Amount validation
    const amt = parseInt(amount.value);
    if (!amt || amt < 10000 || amt > 100000) {
      amountError.style.display = 'block';
      valid = false;
    } else {
      amountError.style.display = 'none';
    }

    if (!valid) e.preventDefault();
  });


});
