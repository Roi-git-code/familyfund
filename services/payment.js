

// services/paymentService.js - SIMPLIFIED
// This file is kept for compatibility but does nothing
// All payment logic is handled in the frontend modal

class PaymentService {
  // Empty service - all logic handled in frontend
  async initiatePayment() {
    // No API calls - handled by frontend modal
    return null;
  }

  async processAzamWebhook(webhookData) {
    // Handle webhooks if needed
    console.log('Webhook received:', webhookData);
    return { status: 'processed' };
  }
}

module.exports = new PaymentService();
