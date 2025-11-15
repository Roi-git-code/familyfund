

  document.addEventListener('DOMContentLoaded', function() {
  const amountInput = document.getElementById('amount');
  const displayAmount = document.getElementById('displayAmount');
  const phoneInput = document.getElementById('phone_number');
  const paymentCards = document.querySelectorAll('.payment-method-card');
  const paymentMethodInput = document.getElementById('payment_method');
  const payButton = document.getElementById('payButton');
  const quickAmountButtons = document.querySelectorAll('[data-amount]');
  const paymentForm = document.getElementById('paymentForm');

  const providerMap = {
    airtel_money: 'airtel',
    halopesa: 'halopesa',
    tigo_pesa: 'tigo',
    azam_lipia_temp: 'azam'
  };

  const hardCodedLipiaLink = 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c402&language=en';
  const azamModalEl = document.getElementById('azamLipiaModal');
  const azamModal = new bootstrap.Modal(azamModalEl, { backdrop: 'static', keyboard: false });
  const azamIframe = document.getElementById('azamLipiaIframe');
  const azamSpinner = document.getElementById('azamIframeSpinner');
  const azamOpenNewTab = document.getElementById('azamOpenNewTab');

  // Update displayed amount
  function updateDisplayAmount() {
    const amount = amountInput.value ? parseInt(amountInput.value).toLocaleString() : '0';
    displayAmount.textContent = amount;
  }
  amountInput.addEventListener('input', updateDisplayAmount);
  updateDisplayAmount();

  // Quick amounts
  quickAmountButtons.forEach(button => {
    button.addEventListener('click', function() {
      amountInput.value = this.dataset.amount;
      updateDisplayAmount();
      amountInput.focus();
    });
  });

  // Payment method click
  paymentCards.forEach(card => {
    card.addEventListener('click', function() {
      if (this.dataset.method === 'azam_lipia_temp') {
        azamSpinner.style.display = 'flex';
        azamIframe.style.visibility = 'hidden';
        azamIframe.src = hardCodedLipiaLink;
        azamOpenNewTab.href = hardCodedLipiaLink;
        azamModal.show();
        return;
      }
      paymentCards.forEach(c => c.classList.remove('selected'));
      this.classList.add('selected');
      paymentMethodInput.value = this.dataset.method;
      const methodName = this.querySelector('h6').textContent;
      payButton.innerHTML = `<i class="fas fa-paper-plane me-2"></i>Pay with ${methodName} - TSh <span id="displayAmount">${displayAmount.textContent}</span>`;
    });
  });

  azamIframe.addEventListener('load', function() {
    azamSpinner.style.display = 'none';
    azamIframe.style.visibility = 'visible';
  });

  azamModalEl.addEventListener('hidden.bs.modal', function () {
    azamIframe.src = 'about:blank';
    azamSpinner.style.display = 'none';
    azamIframe.style.visibility = 'hidden';
  });

  // Auto-format phone
  phoneInput.addEventListener('input', function(e) {
    let value = e.target.value.replace(/\D/g,'');
    if(value.startsWith('0')) value = value.substring(1);
    e.target.value = value;
  });

  // Form submit
  paymentForm.addEventListener('submit', function(e) {
    const amount = parseFloat(amountInput.value);
    const selectedMethod = paymentMethodInput.value;

    if (!selectedMethod) {
      e.preventDefault(); showAlert('Please select a payment method', 'danger'); return;
    }

    if (!amount || amount < 100) {
      e.preventDefault(); showAlert('Please enter a valid amount (minimum TSh 100)', 'danger'); return;
    }

    if (!phoneInput.value || phoneInput.value.length < 9) {
      e.preventDefault(); showAlert('Please enter a valid phone number', 'danger'); return;
    }

    if(selectedMethod === 'azam_lipia_temp') {
      e.preventDefault();
      azamSpinner.style.display = 'flex';
      azamIframe.style.visibility = 'hidden';
      azamIframe.src = hardCodedLipiaLink;
      azamOpenNewTab.href = hardCodedLipiaLink;
      azamModal.show();
      return;
    }

    // Map frontend method to backend provider
    paymentMethodInput.value = providerMap[selectedMethod];

    payButton.disabled = true;
    payButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Processing Payment...';
  });

  function showAlert(message,type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    const flashContainer = document.getElementById('flashContainer');
    flashContainer.appendChild(alertDiv);
    setTimeout(()=>{ if(alertDiv.parentNode) alertDiv.remove(); },5000);
  }

  // Initialize first non-temporary card
  const firstSelectable = Array.from(paymentCards).find(c => c.dataset.method !== 'azam_lipia_temp');
  if(firstSelectable && !paymentMethodInput.value) firstSelectable.click();

// At the end of DOMContentLoaded
console.log('Hidden payment input before submit:', paymentMethodInput.value);

});
