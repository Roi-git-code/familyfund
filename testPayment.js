

// testPayment.js
require('dotenv').config();
const paymentService = require('./services/paymentService');

(async () => {
  try {
    console.log('=== Payment Service Keys ===');
    console.log(Object.keys(paymentService.gateways));

    // Test Azam token retrieval
    const azamGateway = paymentService.gateways.azam;
    const token = await azamGateway.getToken();
    console.log('Azam token:', token);

    if (!token) {
      console.error('Cannot proceed without Azam token.');
      return;
    }

    // Test initiating a payment
    const testPaymentData = {
      payment_method: 'tigo_pesa',   // uses AzamPay Lipia Link
      amount: 1000,
      phone_number: '0712345678',    // replace with valid test phone
      transaction_id: `TXN${Date.now()}`, // unique transaction id
      member_name: 'Test User'
    };

    const result = await paymentService.initiatePayment(testPaymentData);
    console.log('Payment initiation result:\n', result);

    if (result.success) {
      console.log('Redirect URL for checkout:', result.data.checkoutUrl);
    }
  } catch (err) {
    console.error('Test script error:', err);
  }
})();
