
// services/azamPayService.js
const axios = require('axios');

class AzamPayService {
  constructor() {
    this.baseURL = process.env.AZAMPAY_BASE_URL || 'https://api.azampay.co.tz';
    this.clientId = process.env.AZAMPAY_CLIENT_ID;
    this.clientSecret = process.env.AZAMPAY_CLIENT_SECRET;
    this.appName = process.env.AZAMPAY_APP_NAME;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Get authentication token
  async authenticate() {
    try {
      const response = await axios.post(`${this.baseURL}/authenticate`, {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        appName: this.appName
      });

      if (response.data && response.data.data) {
        this.accessToken = response.data.data.accessToken;
        this.tokenExpiry = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour
        return this.accessToken;
      }
      throw new Error('Authentication failed');
    } catch (error) {
      console.error('AzamPay Authentication Error:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with AzamPay');
    }
  }

  // Generate dynamic payment link
  async generatePaymentLink(paymentData) {
    try {
      // Ensure we have a valid token
      if (!this.accessToken || new Date() > this.tokenExpiry) {
        await this.authenticate();
      }

      const { amount, phoneNumber, transactionId, externalId } = paymentData;

      const payload = {
        amount: amount.toString(),
        currency: "TZS",
        externalReference: externalId || transactionId,
        redirectUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payments/status/${transactionId}`,
        cancelUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/payments/status/${transactionId}`,
        provider: "ALL", // Let user choose provider on AzamPay page
        additionalProperties: {
          customerPhone: phoneNumber,
          description: `Family Fund Contribution - ${transactionId}`,
          customerEmail: paymentData.email || '',
          customerName: paymentData.customerName || ''
        }
      };

      const response = await axios.post(
        `${this.baseURL}/api/v1/partner/paymentLinks`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.data) {
        return {
          success: true,
          paymentLink: response.data.data.paymentLink,
          transactionId: response.data.data.transactionId,
          expiresAt: response.data.data.expiresAt
        };
      }

      throw new Error('Failed to generate payment link');
    } catch (error) {
      console.error('AzamPay Link Generation Error:', error.response?.data || error.message);
      
      // Fallback to manual process if API fails
      return {
        success: false,
        fallback: true,
        message: 'Using manual payment process'
      };
    }
  }

  // Check payment status via API
  async checkPaymentStatus(transactionId) {
    try {
      if (!this.accessToken || new Date() > this.tokenExpiry) {
        await this.authenticate();
      }

      const response = await axios.get(
        `${this.baseURL}/api/v1/partner/transactions/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('AzamPay Status Check Error:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = new AzamPayService();


