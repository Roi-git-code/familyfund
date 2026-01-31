

// utils/mail.js
const nodemailer = require('nodemailer');

// Cloud-optimized transporter creation
const createTransporter = () => {
  console.log('🔧 Creating cloud-optimized SMTP transporter...');
  console.log('   Host:', process.env.SMTP_HOST);
  console.log('   User:', process.env.SMTP_USER);
  console.log('   Pass:', process.env.SMTP_PASS ? '✅ Set' : '❌ Missing');
  
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Cloud-optimized settings
    connectionTimeout: 15000, // 15 seconds
    greetingTimeout: 10000,   // 10 seconds
    socketTimeout: 30000,     // 30 seconds
    // Important for cloud environments
    tls: {
      rejectUnauthorized: false,
      ciphers: 'SSLv3'
    },
    // Additional options for better compatibility
    requireTLS: true,
    ignoreTLS: false,
    debug: process.env.NODE_ENV !== 'production', // Debug in development only
    logger: process.env.NODE_ENV !== 'production'
  });
};

// Create transporter instance
const transporter = createTransporter();

// Enhanced connection test with retry logic
transporter.verify(function(error, success) {
  if (error) {
    console.log('❌ SMTP Connection Error:', error.message);
    console.log('💡 Diagnosis: This is common on cloud platforms due to network restrictions');
    console.log('🚀 Solution: The app will use Resend API as fallback');
  } else {
    console.log('✅ SMTP Server is ready to take our messages');
  }
});


// utils/mail.js
const sendVerificationEmail = async (email, otpCode) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'FamilyFund System <itzfamilyfund@gmail.com>',
    to: email,
    subject: 'Email Verification - Family Fund Management System',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification - FamilyFund</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; }
        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .email-header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 40px; text-align: center; }
        .email-body { padding: 40px; }
        .otp-code { font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 8px; background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; color: #2c3e50; border: 2px dashed #3498db; }
        .security-notice { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 14px; }
        .no-reply-notice { background: #e9ecef; padding: 12px; border-radius: 4px; text-align: center; font-size: 12px; color: #666; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Secure Family Financial Management</p>
        </div>
        <div class="email-body">
            <p>Hello,</p>
            <p>Thank you for signing up with FamilyFund! To complete your registration, please use the following verification code:</p>
            
            <div class="otp-code">${otpCode}</div>
            
            <p>This code will expire in 15 minutes.</p>
            
            <div class="security-notice">
                <strong>🔒 Security Notice:</strong> For your protection, never share this code with anyone. FamilyFund staff will never ask for your verification code.
            </div>
            
            <p>If you didn't request this verification, please ignore this email.</p>
            
            <div class="no-reply-notice">
                ⚠️ This is an automated message. Please do not reply to this email.
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent to:', email);
    return info;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};


// Send password reset email function
const sendResetEmail = async (email, resetLink) => {
  const mailOptions = {
    from: process.env.SMTP_FROM || 'FamilyFund System <itzfamilyfund@gmail.com>',
    to: email,
    subject: 'Password Reset Request - Family Fund Management System',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset - FamilyFund</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f8f9fa;
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        .email-header {
            background: linear-gradient(135deg, #2c3e50, #3498db);
            color: white;
            padding: 30px 40px;
            text-align: center;
        }
        
        .email-header h1 {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .email-header p {
            font-size: 16px;
            opacity: 0.9;
        }
        
        .email-body {
            padding: 40px;
        }
        
        .welcome-text {
            font-size: 16px;
            margin-bottom: 24px;
            color: #555;
        }
        
        .reset-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 24px;
            margin: 24px 0;
            border-left: 4px solid #3498db;
        }
        
        .reset-button {
            display: inline-block;
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            margin: 16px 0;
            text-align: center;
            transition: all 0.3s ease;
        }
        
        .reset-button:hover {
            background: linear-gradient(135deg, #2980b9, #21618c);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
        }
        
        .reset-link {
            word-break: break-all;
            background: #e9ecef;
            padding: 12px;
            border-radius: 4px;
            font-size: 14px;
            color: #495057;
            margin: 12px 0;
        }
        
        .security-notice {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 16px;
            margin: 20px 0;
            font-size: 14px;
        }
        
        .contact-section {
            background: #e8f4fd;
            border-radius: 8px;
            padding: 24px;
            margin: 24px 0;
        }
        
        .contact-section h3 {
            color: #2c3e50;
            margin-bottom: 16px;
            font-size: 18px;
            text-align: center;
        }
        
        .contact-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .contact-item {
            text-align: center;
            padding: 20px;
            background: transparent;
            border: 2px solid #3498db;
            border-radius: 8px;
            transition: all 0.3s ease;
        }
        
        .contact-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(52, 152, 219, 0.2);
        }
        
        .contact-icon {
            font-size: 32px;
            margin-bottom: 12px;
            display: block;
        }
        
        .contact-details h4 {
            color: #2c3e50;
            margin-bottom: 8px;
            font-size: 16px;
            font-weight: 600;
        }
        
        .contact-details p {
            color: #666;
            font-size: 14px;
            margin-bottom: 4px;
            line-height: 1.4;
        }
        
        .contact-description {
            color: #888;
            font-size: 12px;
            margin-top: 8px;
            font-style: italic;
        }
        
        .support-hours-item {
            grid-column: 1 / -1;
            text-align: center;
            padding: 20px;
            background: transparent;
            border: 2px solid #2c3e50;
            border-radius: 8px;
            margin-top: 10px;
        }
        
        .support-hours-item .contact-icon {
            font-size: 32px;
            margin-bottom: 12px;
        }
        
        .email-footer {
            background: #2c3e50;
            color: white;
            padding: 24px 40px;
            text-align: center;
        }
        
        .footer-links {
            margin: 16px 0;
        }
        
        .footer-links a {
            color: #3498db;
            text-decoration: none;
            margin: 0 12px;
            font-size: 14px;
        }
        
        .copyright {
            font-size: 12px;
            opacity: 0.8;
            margin-top: 16px;
        }
        
        .no-reply-notice {
            background: #e9ecef;
            padding: 12px;
            border-radius: 4px;
            text-align: center;
            font-size: 12px;
            color: #666;
            margin-top: 20px;
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, #3498db, transparent);
            margin: 24px 0;
        }
        
        .contact-intro {
            text-align: center;
            color: #666;
            margin-bottom: 20px;
            font-size: 14px;
        }
        
        @media (max-width: 600px) {
            .email-body {
                padding: 24px;
            }
            
            .contact-grid {
                grid-template-columns: 1fr;
                gap: 15px;
            }
            
            .email-header {
                padding: 24px;
            }
            
            .email-header h1 {
                font-size: 24px;
            }
            
            .contact-item {
                padding: 15px;
            }
            
            .contact-icon {
                font-size: 28px;
            }
        }
        
        @media (max-width: 400px) {
            .email-body {
                padding: 16px;
            }
            
            .reset-section {
                padding: 16px;
            }
            
            .contact-section {
                padding: 16px;
            }
            
            .contact-item {
                padding: 12px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Secure Family Financial Management</p>
        </div>
        
        <!-- Body -->
        <div class="email-body">
            <p class="welcome-text">Hello,</p>
            
            <p class="welcome-text">We received a request to reset your password for your FamilyFund account. If you didn't make this request, please ignore this email.</p>
            
            <div class="reset-section">
                <h3>Reset Your Password</h3>
                <p>To reset your password, click the button below:</p>
                
                <div style="text-align: center;">
                    <a href="${resetLink}" class="reset-button">Reset Password</a>
                </div>
                
                <p><strong>This link will expire in 1 hour.</strong></p>
                
                <p style="margin-top: 16px; font-size: 14px; color: #666;">
                    If the button doesn't work, copy and paste this link into your browser:
                </p>
                <div class="reset-link">${resetLink}</div>
            </div>
            
            <div class="security-notice">
                <strong>🔒 Security Notice:</strong> For your protection, never share your password or this reset link with anyone. FamilyFund staff will never ask for your password.
            </div>

            <div class="divider"></div>
            
            <!-- Contact Information -->
            <div class="contact-section">
                <h3>📞 Need Help? Contact Our Support Team</h3>
                <p class="contact-intro">We're here to help you with any questions or issues</p>
                
                <div class="contact-grid">
                    <!-- Email Support -->
                    <div class="contact-item">
                        <div class="contact-icon">📧</div>
                        <div class="contact-details">
                            <h4>Email Support</h4>
                            <p>itzfamilyfund@mail.com</p>
                            <p class="contact-description">General inquiries & technical support</p>
                        </div>
                    </div>
                    
                    <!-- WhatsApp Support -->
                    <div class="contact-item">
                        <div class="contact-icon">💬</div>
                        <div class="contact-details">
                            <h4>WhatsApp Business</h4>
                            <p>+255 782 702 502</p>
                            <p class="contact-description">Quick responses & file sharing</p>
                        </div>
                    </div>
                    
                    <!-- Phone Support -->
                    <div class="contact-item">
                        <div class="contact-icon">📞</div>
                        <div class="contact-details">
                            <h4>Phone & SMS</h4>
                            <p>+255 763 724 710</p>
                            <p class="contact-description">Voice calls & text messages</p>
                        </div>
                    </div>
                </div>
                
                <!-- Support Hours -->
                <div class="support-hours-item">
                    <div class="contact-icon">🕒</div>
                    <div class="contact-details">
                        <h4>Support Hours</h4>
                        <p>Monday - Friday: 8:00 AM - 6:00 PM EAT</p>
                        <p class="contact-description">Response within 2 business hours</p>
                    </div>
                </div>
            </div>
            
            <div class="no-reply-notice">
                ⚠️ This is an automated message. Please do not reply to this email.
            </div>
        </div>
        
        <!-- Footer -->
        <div class="email-footer">
            <div class="footer-links">
                <a href="https://familyfund.onrender.com/privacy" style="color: #3498db;">Privacy Policy</a>
                <a href="https://familyfund.onrender.com/terms" style="color: #3498db;">Terms of Service</a>
                <a href="https://familyfund.onrender.com/contact" style="color: #3498db;">Help Center</a>
            </div>
            <p class="copyright">
                © 2024 FamilyFund System. All rights reserved.<br>
                Building stronger families through better financial management.
            </p>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent to:', email);
    console.log('📧 Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending reset email:', error);
    throw new Error('Failed to send reset email');
  }
};

// Send Fund Request Status Notification
const sendFundRequestStatusEmail = async (email, fundRequestData) => {
  const { 
    memberName, 
    requestId, 
    amount, 
    requestType, 
    status, 
    officerName, 
    actionDate, 
    rejectionReason,
    transactionNumber 
  } = fundRequestData;

  const statusColor = status === 'Approved' ? '#27ae60' : '#e74c3c';
  const statusIcon = status === 'Approved' ? '✅' : '❌';
  const statusTitle = status === 'Approved' ? 'Request Approved' : 'Request Rejected';

  const mailOptions = {
    from: process.env.SMTP_FROM || 'FamilyFund System <itzfamilyfund@gmail.com>',
    to: email,
    subject: `Fund Request ${status} - Family Fund Management System`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fund Request ${status}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; }
        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .email-header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 40px; text-align: center; }
        .status-banner { background: ${statusColor}; color: white; padding: 20px; text-align: center; margin: 20px 0; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .details-table td:first-child { font-weight: 600; color: #2c3e50; width: 40%; }
        .rejection-reason { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .support-section { background: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .support-contact { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Fund Request Update</p>
        </div>
        
        <div style="padding: 40px;">
            <p>Dear ${memberName},</p>
            
            <div class="status-banner">
                <h2 style="margin: 0; font-size: 24px;">${statusIcon} ${statusTitle}</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Your fund request has been ${status.toLowerCase()}</p>
            </div>

            <table class="details-table">
                <tr><td>Request ID:</td><td>${requestId}</td></tr>
                ${transactionNumber ? `<tr><td>Transaction Number (TRN):</td><td><strong>${transactionNumber}</strong></td></tr>` : ''}
                <tr><td>Request Type:</td><td>${requestType}</td></tr>
                <tr><td>Amount:</td><td>TSh ${Number(amount).toLocaleString()}</td></tr>
                <tr><td>Date Submitted:</td><td>${new Date(fundRequestData.dateSubmitted).toLocaleString()}</td></tr>
                <tr><td>Date ${status}:</td><td>${new Date(actionDate).toLocaleString()}</td></tr>
                <tr><td>Officer:</td><td>${officerName}</td></tr>
            </table>

            ${status === 'Rejected' && rejectionReason ? `
            <div class="rejection-reason">
                <strong>Rejection Reason:</strong><br>
                ${rejectionReason}
            </div>
            ` : ''}

            ${status === 'Approved' ? `
            <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 15px; margin: 15px 0;">
                <strong>✅ Next Steps:</strong><br>
                Your funds will be processed and transferred to your bank account within 2-3 business days.
            </div>
            ` : ''}

            <!-- Support Contact Section -->
            <div class="support-section">
                <h3 style="margin-top: 0; color: #2c3e50;">📞 Need Help?</h3>
                
                ${status === 'Rejected' ? `
                <p><strong>If you have questions about this rejection or need clarification:</strong></p>
                ` : ''}
                
                ${status === 'Approved' ? `
                <p><strong>If you don't recognize this request or have any concerns:</strong></p>
                ` : ''}
                
                <div class="support-contact">
                    <span style="font-weight: 600;">📧 Email:</span>
                    <span>itzfamilyfund@mail.com</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">💬 WhatsApp:</span>
                    <span>+255 782 702 502</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">📞 Phone:</span>
                    <span>+255 763 724 710</span>
                </div>
                
                <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">
                    Please mention your Request ID (<strong>${requestId}</strong>) when contacting support.
                </p>
            </div>

            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                    This is an automated notification. Please do not reply to this email.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Fund request ${status} email sent to:`, email);
    return info;
  } catch (error) {
    console.error(`❌ Error sending fund request ${status} email:`, error);
    throw new Error(`Failed to send ${status.toLowerCase()} notification email`);
  }
};

// Send Payment Status Notification
const sendPaymentStatusEmail = async (email, paymentData) => {
  const { 
    memberName, 
    transactionId, 
    amount, 
    status, 
    officerName, 
    actionDate, 
    rejectionReason 
  } = paymentData;

  const statusColor = status === 'Paid' ? '#27ae60' : '#e74c3c';
  const statusIcon = status === 'Paid' ? '✅' : '❌';
  const statusTitle = status === 'Paid' ? 'Payment Completed' : 'Payment Rejected';

  const mailOptions = {
    from: process.env.SMTP_FROM || 'FamilyFund System <itzfamilyfund@gmail.com>',
    to: email,
    subject: `Payment ${status} - Family Fund Management System`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment ${status}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; }
        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .email-header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 40px; text-align: center; }
        .status-banner { background: ${statusColor}; color: white; padding: 20px; text-align: center; margin: 20px 0; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .details-table td:first-child { font-weight: 600; color: #2c3e50; width: 40%; }
        .rejection-reason { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .support-section { background: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .support-contact { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Payment Status Update</p>
        </div>
        
        <div style="padding: 40px;">
            <p>Dear ${memberName},</p>
            
            <div class="status-banner">
                <h2 style="margin: 0; font-size: 24px;">${statusIcon} ${statusTitle}</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Your payment has been ${status.toLowerCase()}</p>
            </div>

            <table class="details-table">
                <tr><td>Transaction ID:</td><td>${transactionId}</td></tr>
                <tr><td>Amount:</td><td>TSh ${Number(amount).toLocaleString()}</td></tr>
                <tr><td>Payment Method:</td><td>Azam Lipia</td></tr>
                <tr><td>Date Paid:</td><td>${new Date(paymentData.datePaid).toLocaleString()}</td></tr>
                <tr><td>Date ${status}:</td><td>${new Date(actionDate).toLocaleString()}</td></tr>
                ${officerName ? `<tr><td>Officer:</td><td>${officerName}</td></tr>` : ''}
            </table>

            ${status === 'Rejected' && rejectionReason ? `
            <div class="rejection-reason">
                <strong>Rejection Reason:</strong><br>
                ${rejectionReason}
            </div>
            ` : ''}

            ${status === 'Paid' ? `
            <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 15px; margin: 15px 0;">
                <strong>✅ Payment Confirmed:</strong><br>
                Your contribution has been successfully recorded. Thank you for your payment!
            </div>
            ` : ''}

            <!-- Support Contact Section -->
            <div class="support-section">
                <h3 style="margin-top: 0; color: #2c3e50;">📞 Need Help?</h3>
                
                ${status === 'Rejected' ? `
                <p><strong>If you have questions about this payment rejection:</strong></p>
                ` : ''}
                
                ${status === 'Paid' ? `
                <p><strong>If you don't recognize this payment or have any concerns:</strong></p>
                ` : ''}
                
                <div class="support-contact">
                    <span style="font-weight: 600;">📧 Email:</span>
                    <span>itzfamilyfund@mail.com</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">💬 WhatsApp:</span>
                    <span>+255 782 702 502</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">📞 Phone:</span>
                    <span>+255 763 724 710</span>
                </div>
                
                <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">
                    Please mention your Transaction ID (<strong>${transactionId}</strong>) when contacting support.
                </p>
            </div>

            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                    This is an automated notification. Please do not reply to this email.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Payment ${status} email sent to:`, email);
    return info;
  } catch (error) {
    console.error(`❌ Error sending payment ${status} email:`, error);
    throw new Error(`Failed to send payment ${status.toLowerCase()} notification email`);
  }
};

// Send Member Registration Success Email
const sendMemberRegistrationEmail = async (email, memberData) => {
  const { 
    memberName, 
    memberId,
    registrationDate
  } = memberData;

  const mailOptions = {
    from: process.env.SMTP_FROM || 'FamilyFund System <itzfamilyfund@gmail.com>',
    to: email,
    subject: 'Welcome to Family Fund Management System',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to FamilyFund</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; }
        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .email-header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 40px; text-align: center; }
        .welcome-banner { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 20px; margin: 20px 0; text-align: center; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .details-table td:first-child { font-weight: 600; color: #2c3e50; width: 40%; }
        .action-section { background: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .support-section { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .support-contact { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
        .btn-primary { display: inline-block; background: #3498db; color: white; padding: 12px 24px; border-radius: 5px; text-decoration: none; font-weight: 600; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Member Registration Successful</p>
        </div>
        
        <div style="padding: 40px;">
            <p>Dear ${memberName},</p>
            
            <div class="welcome-banner">
                <h2 style="margin: 0; font-size: 24px; color: #155724;">🎉 Welcome to FamilyFund!</h2>
                <p style="margin: 10px 0 0 0; color: #155724;">Your registration was successful</p>
            </div>

            <table class="details-table">
                <tr><td>Member Name:</td><td>${memberName}</td></tr>
                <tr><td>Member ID:</td><td>${memberId}</td></tr>
                <tr><td>Registration Date:</td><td>${new Date(registrationDate).toLocaleString()}</td></tr>
                <tr><td>Email:</td><td>${email}</td></tr>
            </table>

            <div class="action-section">
                <h3 style="margin-top: 0; color: #2c3e50;">📝 Complete Your Account Setup</h3>
                <p>To access your account and manage your contributions, please complete your user account setup:</p>
                
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${process.env.BASE_URL || 'https://familyfund.onrender.com'||'http://localhost:3000'}/auth" class="btn-primary">
                        Sign Up for User Account
                    </a>
                </div>
                
                <p><strong>Steps to complete:</strong></p>
                <ol style="margin: 10px 0; padding-left: 20px;">
                    <li>Click the "Sign Up for User Account" button above</li>
                    <li>Use your email: <strong>${email}</strong></li>
                    <li>Create a secure password</li>
                    <li>Select your appropriate role</li>
                    <li>Complete the email verification process</li>
                </ol>
            </div>

            <div class="support-section">
                <h4 style="margin-top: 0; color: #856404;">📞 Need Help?</h4>
                <p>If you encounter any issues during sign-up or have questions:</p>
                
                <div class="support-contact">
                    <span style="font-weight: 600;">📧 Email:</span>
                    <span>itzfamilyfund@mail.com</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">💬 WhatsApp:</span>
                    <span>+255 782 702 502</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">📞 Phone:</span>
                    <span>+255 763 724 710</span>
                </div>
            </div>

            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                    This is an automated notification. Please do not reply to this email.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Member registration email sent to:`, email);
    return info;
  } catch (error) {
    console.error(`❌ Error sending member registration email:`, error);
    throw new Error('Failed to send registration notification email');
  }
};

// Send Member Update Notification Email
const sendMemberUpdateEmail = async (email, memberData) => {
  const { 
    memberName, 
    memberId,
    updateDate,
    updatedBy
  } = memberData;

  const mailOptions = {
    from: process.env.SMTP_FROM || 'FamilyFund System <itzfamilyfund@gmail.com>',
    to: email,
    subject: 'Member Profile Updated - Family Fund Management System',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profile Updated</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; }
        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .email-header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 40px; text-align: center; }
        .update-banner { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 20px; margin: 20px 0; text-align: center; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .details-table td:first-child { font-weight: 600; color: #2c3e50; width: 40%; }
        .support-section { background: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .support-contact { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Profile Update Notification</p>
        </div>
        
        <div style="padding: 40px;">
            <p>Dear ${memberName},</p>
            
            <div class="update-banner">
                <h2 style="margin: 0; font-size: 24px; color: #856404;">📋 Profile Updated</h2>
                <p style="margin: 10px 0 0 0; color: #856404;">Your member profile has been successfully updated</p>
            </div>

            <table class="details-table">
                <tr><td>Member Name:</td><td>${memberName}</td></tr>
                <tr><td>Member ID:</td><td>${memberId}</td></tr>
                <tr><td>Update Date:</td><td>${new Date(updateDate).toLocaleString()}</td></tr>
                <tr><td>Updated By:</td><td>${updatedBy}</td></tr>
                <tr><td>Email:</td><td>${email}</td></tr>
            </table>

            <div class="support-section">
                <h3 style="margin-top: 0; color: #2c3e50;">📞 Need Help?</h3>
                <p><strong>If you did not request this update or need clarification:</strong></p>
                
                <div class="support-contact">
                    <span style="font-weight: 600;">📧 Email:</span>
                    <span>itzfamilyfund@mail.com</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">💬 WhatsApp:</span>
                    <span>+255 782 702 502</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">📞 Phone:</span>
                    <span>+255 763 724 710</span>
                </div>
                
                <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">
                    Please mention your Member ID (<strong>${memberId}</strong>) when contacting support.
                </p>
            </div>

            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                    This is an automated notification. Please do not reply to this email.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Member update email sent to:`, email);
    return info;
  } catch (error) {
    console.error(`❌ Error sending member update email:`, error);
    throw new Error('Failed to send update notification email');
  }
};

// Send Member Deletion Notification Email
const sendMemberDeletionEmail = async (email, memberData) => {
  const { 
    memberName, 
    memberId,
    deletionDate,
    deletedBy
  } = memberData;

  const mailOptions = {
    from: process.env.SMTP_FROM || 'FamilyFund System <itzfamilyfund@gmail.com>',
    to: email,
    subject: 'Member Account Deleted - Family Fund Management System',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Deleted</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; }
        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .email-header { background: linear-gradient(135deg, #2c3e50, #3498db); color: white; padding: 30px 40px; text-align: center; }
        .deletion-banner { background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 20px; margin: 20px 0; text-align: center; }
        .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .details-table td { padding: 12px; border-bottom: 1px solid #eee; }
        .details-table td:first-child { font-weight: 600; color: #2c3e50; width: 40%; }
        .support-section { background: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .support-contact { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Account Deletion Notification</p>
        </div>
        
        <div style="padding: 40px;">
            <p>Dear ${memberName},</p>
            
            <div class="deletion-banner">
                <h2 style="margin: 0; font-size: 24px; color: #721c24;">🗑️ Account Deleted</h2>
                <p style="margin: 10px 0 0 0; color: #721c24;">Your member account has been deleted from the system</p>
            </div>

            <table class="details-table">
                <tr><td>Member Name:</td><td>${memberName}</td></tr>
                <tr><td>Member ID:</td><td>${memberId}</td></tr>
                <tr><td>Deletion Date:</td><td>${new Date(deletionDate).toLocaleString()}</td></tr>
                <tr><td>Deleted By:</td><td>${deletedBy}</td></tr>
                <tr><td>Email:</td><td>${email}</td></tr>
            </table>

            <div class="support-section">
                <h3 style="margin-top: 0; color: #2c3e50;">📞 Need Help?</h3>
                <p><strong>If this deletion was made in error or you need clarification:</strong></p>
                
                <div class="support-contact">
                    <span style="font-weight: 600;">📧 Email:</span>
                    <span>itzfamilyfund@mail.com</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">💬 WhatsApp:</span>
                    <span>+255 782 702 502</span>
                </div>
                <div class="support-contact">
                    <span style="font-weight: 600;">📞 Phone:</span>
                    <span>+255 763 724 710</span>
                </div>
                
                <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">
                    Please mention your Member ID (<strong>${memberId}</strong>) when contacting support.
                </p>
            </div>

            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                    This is an automated notification. Please do not reply to this email.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Member deletion email sent to:`, email);
    return info;
  } catch (error) {
    console.error(`❌ Error sending member deletion email:`, error);
    throw new Error('Failed to send deletion notification email');
  }
};


// Send Support Notification Email to Officers
const sendSupportNotificationEmail = async (supportData) => {
  const { 
    messageId, 
    name, 
    email: userEmail, 
    subject, 
    urgency = 'medium', 
    message, 
    createdAt,
    toEmail,
    memberId,
    userId
  } = supportData;

  // Get recipient name from email
  const recipientName = toEmail ? toEmail.split('@')[0] : 'Officer';
  
  const urgencyColors = {
    critical: '#dc3545',
    high: '#fd7e14', 
    medium: '#ffc107',
    low: '#28a745'
  };

  const urgencyLabels = {
    critical: 'CRITICAL',
    high: 'HIGH',
    medium: 'MEDIUM', 
    low: 'LOW'
  };

  const urgencyColor = urgencyColors[urgency] || '#6c757d';
  const urgencyLabel = urgencyLabels[urgency] || 'STANDARD';

  // Determine response time based on urgency
  let responseTime = '2-4 hours';
  let responseColor = '#28a745';
  
  if (urgency === 'critical') {
    responseTime = '1 hour or less';
    responseColor = '#dc3545';
  } else if (urgency === 'high') {
    responseTime = '1-2 hours';
    responseColor = '#fd7e14';
  } else if (urgency === 'low') {
    responseTime = '24 hours';
    responseColor = '#6c757d';
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || `FamilyFund Support <${process.env.SUPPORT_EMAIL || 'itzfamilyfund@gmail.com'}>`,
    to: toEmail || process.env.ADMIN_EMAIL || 'itzfamilyfund@gmail.com',
    subject: `📧 [${urgencyLabel}] Support Request: ${subject} - Ticket #${messageId}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Support Message - FamilyFund</title>
    <style>
        * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
        }
        
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background-color: #f8f9fa; 
        }
        
        .email-container { 
            max-width: 700px; 
            margin: 0 auto; 
            background: #ffffff; 
            border-radius: 12px; 
            overflow: hidden; 
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); 
        }
        
        .email-header { 
            background: linear-gradient(135deg, #2c3e50, #3498db); 
            color: white; 
            padding: 30px 40px; 
            text-align: center; 
        }
        
        .email-header h1 {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .email-header p {
            font-size: 16px;
            opacity: 0.9;
        }
        
        .recipient-info {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 10px;
            margin-top: 15px;
            font-size: 14px;
        }
        
        .email-body { 
            padding: 40px; 
        }
        
        .urgency-banner {
            background: ${urgencyColor};
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
        }
        
        .ticket-info {
            display: flex;
            justify-content: space-between;
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            font-size: 14px;
        }
        
        .ticket-info div {
            text-align: center;
            flex: 1;
        }
        
        .ticket-info .label {
            font-weight: 600;
            color: #6c757d;
            margin-bottom: 5px;
        }
        
        .ticket-info .value {
            font-size: 16px;
            color: #2c3e50;
        }
        
        .user-details {
            background: #e8f4fd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .user-details h3 {
            margin-top: 0;
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        
        .details-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0; 
        }
        
        .details-table td { 
            padding: 12px 16px; 
            border-bottom: 1px solid #dee2e6; 
        }
        
        .details-table td:first-child { 
            font-weight: 600; 
            color: #2c3e50; 
            width: 30%; 
            background: #f8f9fa;
        }
        
        .message-box { 
            background: white; 
            padding: 25px; 
            border-left: 4px solid #3498db; 
            margin: 25px 0; 
            border-radius: 0 8px 8px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .message-content {
            white-space: pre-wrap;
            line-height: 1.8;
            color: #495057;
            font-size: 15px;
        }
        
        .action-buttons {
            display: flex;
            gap: 15px;
            margin: 30px 0;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .action-button {
            display: inline-block;
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 15px;
            text-align: center;
            transition: all 0.3s ease;
            min-width: 180px;
        }
        
        .action-button:hover {
            background: linear-gradient(135deg, #2980b9, #21618c);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
        }
        
        .action-button.resolve {
            background: linear-gradient(135deg, #28a745, #20c997);
        }
        
        .action-button.resolve:hover {
            background: linear-gradient(135deg, #20c997, #198754);
        }
        
        .response-time {
            background: ${responseColor}15;
            border: 2px solid ${responseColor};
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
            text-align: center;
        }
        
        .response-time h3 {
            color: ${responseColor};
            margin: 0 0 10px 0;
        }
        
        .assignment-info {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 20px;
            margin: 25px 0;
        }
        
        .assignment-info h3 {
            color: #856404;
            margin-top: 0;
        }
        
        .security-notice { 
            background: #f8d7da; 
            border: 1px solid #f5c6cb; 
            border-radius: 6px; 
            padding: 16px; 
            margin: 20px 0; 
            font-size: 14px; 
        }
        
        .no-reply-notice { 
            background: #e9ecef; 
            padding: 15px; 
            border-radius: 4px; 
            text-align: center; 
            font-size: 13px; 
            color: #666; 
            margin-top: 30px; 
        }
        
        .timestamp {
            color: #6c757d;
            font-size: 13px;
            margin-top: 8px;
            text-align: right;
        }
        
        @media (max-width: 600px) {
            .email-body {
                padding: 24px;
            }
            
            .email-header {
                padding: 24px;
            }
            
            .email-header h1 {
                font-size: 24px;
            }
            
            .ticket-info {
                flex-direction: column;
                gap: 10px;
            }
            
            .action-buttons {
                flex-direction: column;
            }
            
            .action-button {
                width: 100%;
            }
            
            .details-table td {
                padding: 10px 12px;
                font-size: 14px;
                display: block;
                width: 100%;
            }
            
            .details-table td:first-child {
                background: #f8f9fa;
                border-bottom: none;
                padding-bottom: 5px;
            }
            
            .details-table td:last-child {
                padding-top: 5px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>New Support Message Requires Attention</p>
            <div class="recipient-info">
                Assigned to: ${recipientName}
            </div>
        </div>
        
        <!-- Body -->
        <div class="email-body">
            <div class="urgency-banner">
                <h2 style="margin: 0; font-size: 24px;">${urgencyLabel} PRIORITY</h2>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                    ${subject}
                </p>
            </div>
            
            <!-- Ticket Information -->
            <div class="ticket-info">
                <div>
                    <div class="label">Ticket ID</div>
                    <div class="value"><strong>#${messageId}</strong></div>
                </div>
                <div>
                    <div class="label">Category</div>
                    <div class="value">${subject}</div>
                </div>
                <div>
                    <div class="label">Submitted</div>
                    <div class="value">${new Date(createdAt).toLocaleString()}</div>
                </div>
            </div>
            
            <!-- User Details -->
            <div class="user-details">
                <h3>👤 User Information</h3>
                <table class="details-table">
                    <tr>
                        <td>Name:</td>
                        <td>${name}</td>
                    </tr>
                    <tr>
                        <td>Email:</td>
                        <td>${userEmail}</td>
                    </tr>
                    ${memberId ? `
                    <tr>
                        <td>Member ID:</td>
                        <td>${memberId}</td>
                    </tr>
                    ` : ''}
                    ${userId ? `
                    <tr>
                        <td>User ID:</td>
                        <td>${userId}</td>
                    </tr>
                    ` : ''}
                </table>
            </div>
            
            <!-- Message Content -->
            <h3 style="color: #2c3e50; margin: 24px 0 12px 0;">📝 Message Content:</h3>
            <div class="message-box">
                <div class="message-content">${message.replace(/\n/g, '<br>')}</div>
                <div class="timestamp">
                    Received: ${new Date(createdAt).toLocaleString()}
                </div>
            </div>
            
            <!-- Response Time -->
            <div class="response-time">
                <h3>⏰ Response Time Target</h3>
                <p style="font-size: 18px; font-weight: 600; margin: 0;">
                    Please respond within <strong style="color: ${responseColor};">${responseTime}</strong>
                </p>
            </div>
            
            <!-- Action Buttons -->
            <div class="action-buttons">
                <a href="${process.env.BASE_URL || 'http://localhost:3000'}/admin/support/${messageId}" 
                   class="action-button">
                   📋 View & Respond
                </a>
                
                <a href="${process.env.BASE_URL || 'http://localhost:3000'}/admin/support/${messageId}?action=resolve" 
                   class="action-button resolve">
                   ✅ Mark as Resolved
                </a>
            </div>
            
            <!-- Assignment Info -->
            <div class="assignment-info">
                <h3>🎯 Why You Received This Notification</h3>
                <p>You are receiving this notification because:</p>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>You have the appropriate role to handle <strong>${subject}</strong> requests</li>
                    <li>Based on the subject category, you are one of the designated officers</li>
                    <li>This is a <strong>${urgency}</strong> priority request</li>
                </ul>
            </div>

            <!-- Security Notice -->
            <div class="security-notice">
                <strong>🔒 Security & Privacy Guidelines:</strong><br>
                • Always verify user identity before sharing sensitive information<br>
                • Never share login credentials or personal data via email<br>
                • Use the admin panel for all official communications<br>
                • Document all interactions in the support ticket
            </div>

            <div class="no-reply-notice">
                ⚠️ This is an automated notification. Please do not reply to this email.<br>
                Use the admin panel to respond to this support request.
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Support notification email sent to: ${toEmail} for ticket #${messageId}`);
    console.log(`📧 Message ID:`, info.messageId);
    return info;
  } catch (error) {
    console.error(`❌ Error sending support notification email to ${toEmail}:`, error.message);
    console.error('Error details:', error);
    throw new Error(`Failed to send support notification email: ${error.message}`);
  }
};

// Send Support Response Notification to User
const sendSupportResponseEmail = async (userEmail, supportData) => {
  const { 
    messageId, 
    subject, 
    adminName,
    response,
    status,
    responseDate,
    userMessage
  } = supportData;

  const statusColors = {
    new: '#17a2b8',
    in_progress: '#007bff',
    resolved: '#28a745',
    closed: '#6c757d',
    cancelled: '#dc3545'
  };

  const statusLabels = {
    new: 'New',
    in_progress: 'In Progress',
    resolved: 'Resolved', 
    closed: 'Closed',
    cancelled: 'Cancelled'
  };

  const statusColor = statusColors[status] || '#6c757d';
  const statusLabel = statusLabels[status] || 'Updated';

  const mailOptions = {
    from: process.env.SMTP_FROM || `FamilyFund Support <${process.env.SUPPORT_EMAIL || 'itzfamilyfund@gmail.com'}>`,
    to: userEmail,
    subject: `📋 Update on Your Support Request: ${subject} - Ticket #${messageId}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support Request Update - FamilyFund</title>
    <style>
        * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
        }
        
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background-color: #f8f9fa; 
        }
        
        .email-container { 
            max-width: 650px; 
            margin: 0 auto; 
            background: #ffffff; 
            border-radius: 12px; 
            overflow: hidden; 
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); 
        }
        
        .email-header { 
            background: linear-gradient(135deg, #2c3e50, #3498db); 
            color: white; 
            padding: 30px 40px; 
            text-align: center; 
        }
        
        .email-header h1 {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .email-body { 
            padding: 40px; 
        }
        
        .status-banner {
            background: ${statusColor};
            color: white;
            padding: 25px;
            text-align: center;
            margin: 20px 0;
            border-radius: 8px;
        }
        
        .ticket-summary {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 15px;
        }
        
        .summary-item {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 6px;
            border: 1px solid #dee2e6;
        }
        
        .summary-label {
            font-size: 12px;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
        }
        
        .summary-value {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .original-message {
            background: #e8f4fd;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
            border-left: 4px solid #3498db;
        }
        
        .response-box { 
            background: white; 
            padding: 25px; 
            border-left: 4px solid ${statusColor}; 
            margin: 25px 0; 
            border-radius: 0 8px 8px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .response-content {
            white-space: pre-wrap;
            line-height: 1.8;
            color: #495057;
            font-size: 15px;
        }
        
        .next-steps {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            border-radius: 8px;
            padding: 20px;
            margin: 25px 0;
        }
        
        .support-contact { 
            background: #e8f4fd; 
            border-radius: 8px; 
            padding: 25px; 
            margin: 25px 0; 
        }
        
        .contact-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 15px;
        }
        
        .contact-item {
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 6px;
            border: 1px solid #dee2e6;
        }
        
        .contact-icon {
            font-size: 24px;
            margin-bottom: 10px;
            display: block;
        }
        
        .no-reply-notice { 
            background: #e9ecef; 
            padding: 15px; 
            border-radius: 4px; 
            text-align: center; 
            font-size: 13px; 
            color: #666; 
            margin-top: 30px; 
        }
        
        .timestamp {
            color: #6c757d;
            font-size: 13px;
            margin-top: 10px;
            text-align: right;
        }
        
        .responder-info {
            display: flex;
            align-items: center;
            gap: 15px;
            margin: 15px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        
        .responder-avatar {
            width: 50px;
            height: 50px;
            background: ${statusColor};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 18px;
        }
        
        @media (max-width: 600px) {
            .email-body {
                padding: 24px;
            }
            
            .email-header {
                padding: 24px;
            }
            
            .email-header h1 {
                font-size: 24px;
            }
            
            .summary-grid {
                grid-template-columns: 1fr;
            }
            
            .contact-grid {
                grid-template-columns: 1fr;
            }
            
            .response-box {
                padding: 16px;
            }
            
            .original-message {
                padding: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Support Request Update</p>
        </div>
        
        <!-- Body -->
        <div class="email-body">
            <div class="status-banner">
                <h2 style="margin: 0; font-size: 24px;">${statusLabel}</h2>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                    Your support request has been updated
                </p>
            </div>
            
            <!-- Ticket Summary -->
            <div class="ticket-summary">
                <h3 style="margin-top: 0; color: #2c3e50;">📋 Ticket Summary</h3>
                <div class="summary-grid">
                    <div class="summary-item">
                        <div class="summary-label">Ticket ID</div>
                        <div class="summary-value">#${messageId}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Subject</div>
                        <div class="summary-value">${subject}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Status</div>
                        <div class="summary-value" style="color: ${statusColor};">${statusLabel}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Updated</div>
                        <div class="summary-value">${new Date(responseDate).toLocaleDateString()}</div>
                    </div>
                </div>
            </div>
            
            <!-- Responder Info -->
            <div class="responder-info">
                <div class="responder-avatar">
                    ${adminName.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div style="font-weight: 600; color: #2c3e50;">${adminName}</div>
                    <div style="color: #6c757d; font-size: 14px;">FamilyFund Support Team</div>
                    <div style="color: #6c757d; font-size: 12px; margin-top: 5px;">
                        Responded on ${new Date(responseDate).toLocaleString()}
                    </div>
                </div>
            </div>
            
            <!-- Original Message (if provided) -->
            ${userMessage ? `
            <div class="original-message">
                <h4 style="margin-top: 0; color: #2c3e50; margin-bottom: 10px;">📝 Your Original Message:</h4>
                <p style="margin: 0; color: #495057; font-style: italic;">
                    "${userMessage.length > 150 ? userMessage.substring(0, 150) + '...' : userMessage}"
                </p>
            </div>
            ` : ''}
            
            <!-- Support Response -->
            <h3 style="color: #2c3e50; margin: 24px 0 12px 0;">📨 Support Response:</h3>
            <div class="response-box">
                <div class="response-content">${response.replace(/\n/g, '<br>')}</div>
                <div class="timestamp">
                    Response sent: ${new Date(responseDate).toLocaleString()}
                </div>
            </div>

            <!-- Next Steps -->
            ${status === 'resolved' ? `
            <div class="next-steps">
                <h4 style="margin-top: 0; color: #155724;">✅ Next Steps:</h4>
                <p style="margin: 10px 0 0 0; color: #155724;">
                    Your issue has been marked as resolved. If you need further assistance, 
                    please reply to this ticket within 7 days.
                </p>
            </div>
            ` : ''}
            
            ${status === 'in_progress' ? `
            <div class="next-steps">
                <h4 style="margin-top: 0; color: #004085;">🔄 Next Steps:</h4>
                <p style="margin: 10px 0 0 0; color: #004085;">
                    Our team is actively working on your request. We'll provide another 
                    update within 24 hours or sooner.
                </p>
            </div>
            ` : ''}

            <!-- Support Contact -->
            <div class="support-contact">
                <h3 style="margin-top: 0; color: #2c3e50;">📞 Need Further Assistance?</h3>
                <p>If you have additional questions or need clarification:</p>
                
                <div class="contact-grid">
                    <div class="contact-item">
                        <div class="contact-icon">📧</div>
                        <div>
                            <div style="font-weight: 600; margin-bottom: 5px;">Email Support</div>
                            <div style="font-size: 14px; color: #6c757d;">
                                ${process.env.SUPPORT_EMAIL || 'itzfamilyfund@gmail.com'}
                            </div>
                        </div>
                    </div>
                    
                    <div class="contact-item">
                        <div class="contact-icon">💬</div>
                        <div>
                            <div style="font-weight: 600; margin-bottom: 5px;">WhatsApp</div>
                            <div style="font-size: 14px; color: #6c757d;">
                                +255 782 702 502
                            </div>
                        </div>
                    </div>
                </div>
                
                <p style="margin: 20px 0 0 0; font-size: 14px; color: #666; text-align: center;">
                    Please mention your Ticket ID (<strong>#${messageId}</strong>) when contacting support.
                </p>
            </div>

            <div class="no-reply-notice">
                ⚠️ This is an automated notification. Please do not reply to this email.<br>
                To respond to this update, please use the support portal or contact details above.
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Support response email sent to: ${userEmail} for ticket #${messageId}`);
    console.log(`📧 Message ID:`, info.messageId);
    return info;
  } catch (error) {
    console.error(`❌ Error sending support response email to ${userEmail}:`, error.message);
    console.error('Error details:', error);
    throw new Error(`Failed to send support response email: ${error.message}`);
  }
};


// Send Monthly Contribution Reminder Email
const sendMonthlyContributionReminder = async (email, memberData) => {
  const { 
    memberName, 
    memberId,
    currentMonthTotal,
    requiredAmount,
    remainingAmount,
    currentMonth,
    currentYear,
    dueDate
  } = memberData;

  const mailOptions = {
    from: process.env.SMTP_FROM || 'FamilyFund System <itzfamilyfund@gmail.com>',
    to: email,
    subject: `📅 Monthly Contribution Reminder - ${currentMonth} ${currentYear}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monthly Contribution Reminder</title>
    <style>
        * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
        }
        
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background-color: #f8f9fa; 
        }
        
        .email-container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: #ffffff; 
            border-radius: 12px; 
            overflow: hidden; 
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); 
        }
        
        .email-header { 
            background: linear-gradient(135deg, #2c3e50, #3498db); 
            color: white; 
            padding: 30px 40px; 
            text-align: center; 
        }
        
        .email-header h1 {
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .reminder-banner {
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 8px;
            padding: 25px;
            margin: 25px 0;
            text-align: center;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin: 25px 0;
        }
        
        .stat-card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            border: 1px solid #dee2e6;
        }
        
        .stat-value {
            font-size: 28px;
            font-weight: 700;
            color: #2c3e50;
            margin: 10px 0;
        }
        
        .stat-label {
            font-size: 14px;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .progress-container {
            background: #e9ecef;
            border-radius: 10px;
            height: 20px;
            margin: 20px 0;
            overflow: hidden;
        }
        
        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #28a745, #20c997);
            border-radius: 10px;
            transition: width 0.5s ease;
        }
        
        .payment-options {
            background: #e8f4fd;
            border-radius: 8px;
            padding: 25px;
            margin: 25px 0;
        }
        
        .payment-method {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 15px;
            background: white;
            border-radius: 6px;
            margin: 10px 0;
            border: 1px solid #dee2e6;
        }
        
        .payment-icon {
            font-size: 24px;
            width: 40px;
            text-align: center;
        }
        
        .due-date-notice {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
        }
        
        .btn-primary {
            display: inline-block;
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            margin: 16px 0;
            text-align: center;
            transition: all 0.3s ease;
        }
        
        .btn-primary:hover {
            background: linear-gradient(135deg, #2980b9, #21618c);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
        }
        
        .contact-support {
            background: #fff3cd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .support-item {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
        }
        
        .important-dates {
            background: #e8f4fd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .date-item {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #dee2e6;
        }
        
        .date-item:last-child {
            border-bottom: none;
        }
        
        @media (max-width: 600px) {
            .email-body {
                padding: 24px;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .email-header {
                padding: 24px;
            }
            
            .email-header h1 {
                font-size: 24px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="email-header">
            <h1>Family Fund Management System</h1>
            <p>Monthly Contribution Reminder</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 40px;">
            <p>Dear ${memberName},</p>
            
            <div class="reminder-banner">
                <h2 style="margin: 0; font-size: 24px; color: #856404;">📅 Monthly Contribution Due</h2>
                <p style="margin: 10px 0 0 0; color: #856404;">
                    Please complete your contribution for ${currentMonth} ${currentYear}
                </p>
            </div>
            
            <!-- Contribution Statistics -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Paid This Month</div>
                    <div class="stat-value">TSh ${Number(currentMonthTotal).toLocaleString()}</div>
                </div>
                
                <div class="stat-card">
                    <div class="stat-label">Remaining Balance</div>
                    <div class="stat-value" style="color: #dc3545;">TSh ${Number(remainingAmount).toLocaleString()}</div>
                </div>
            </div>
            
            <!-- Progress Bar -->
            <div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span>Progress: ${Math.round((currentMonthTotal / requiredAmount) * 100)}%</span>
                    <span>Target: TSh ${Number(requiredAmount).toLocaleString()}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${(currentMonthTotal / requiredAmount) * 100}%;"></div>
                </div>
            </div>
            
            <!-- Due Date Notice -->
            <div class="due-date-notice">
                <h3 style="margin: 0 0 10px 0; color: #721c24;">⚠️ Important Notice</h3>
                <p style="margin: 0; color: #721c24;">
                    <strong>Monthly contributions are due by the end of each month.</strong><br>
                    Late payments may affect your benefits and services.
                </p>
            </div>
            
            <!-- Payment Options -->
            <div class="payment-options">
                <h3 style="margin-top: 0; color: #2c3e50;">💳 Payment Methods</h3>
                
                <div class="payment-method">
                    <div class="payment-icon">📱</div>
                    <div>
                        <strong>Azam Lipia</strong><br>
                        <span>Use your registered phone number</span>
                    </div>
                </div>
                
                <div class="payment-method">
                    <div class="payment-icon">🏦</div>
                    <div>
                        <strong>Bank Transfer</strong><br>
                        <span>Contact support for bank details</span>
                    </div>
                </div>
                
                <div class="payment-method">
                    <div class="payment-icon">👥</div>
                    <div>
                        <strong>Office Payment</strong><br>
                        <span>Visit our office during working hours</span>
                    </div>
                </div>
                
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${process.env.BASE_URL || 'https://familyfund.onrender.com'}/payments" 
                       class="btn-primary">
                       💰 Make Payment Now
                    </a>
                </div>
            </div>
            
            <!-- Important Dates -->
            <div class="important-dates">
                <h3 style="margin-top: 0; color: #2c3e50;">📅 Important Dates</h3>
                <div class="date-item">
                    <span>Current Month:</span>
                    <span><strong>${currentMonth} ${currentYear}</strong></span>
                </div>
                <div class="date-item">
                    <span>Monthly Target:</span>
                    <span><strong>TSh ${Number(requiredAmount).toLocaleString()}</strong></span>
                </div>
                <div class="date-item">
                    <span>Due Date:</span>
                    <span><strong>End of ${currentMonth}</strong></span>
                </div>
                <div class="date-item">
                    <span>Today's Date:</span>
                    <span><strong>${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
                </div>
            </div>
            
            <!-- Support Contact -->
            <div class="contact-support">
                <h3 style="margin-top: 0; color: #2c3e50;">📞 Need Assistance?</h3>
                <p>If you have any questions about your contribution:</p>
                
                <div class="support-item">
                    <span style="font-weight: 600;">📧 Email:</span>
                    <span>itzfamilyfund@mail.com</span>
                </div>
                <div class="support-item">
                    <span style="font-weight: 600;">💬 WhatsApp:</span>
                    <span>+255 782 702 502</span>
                </div>
                <div class="support-item">
                    <span style="font-weight: 600;">📞 Phone:</span>
                    <span>+255 763 724 710</span>
                </div>
                
                <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">
                    Please mention your Member ID (<strong>${memberId}</strong>) when contacting support.
                </p>
            </div>
            
            <!-- Automated Notice -->
            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa; border-radius: 6px; text-align: center;">
                <p style="margin: 0; color: #666; font-size: 12px;">
                    🔄 This is an automated monthly reminder. You'll receive updates on the 20th, 24th, 28th, and 30th until your contribution is complete.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Monthly contribution reminder sent to ${memberName} (${email})`);
    console.log(`📊 Current contribution: TSh ${currentMonthTotal}, Remaining: TSh ${remainingAmount}`);
    return info;
  } catch (error) {
    console.error(`❌ Error sending monthly contribution reminder:`, error);
    throw new Error('Failed to send contribution reminder email');
  }
};

// Module Exports
module.exports = { 
  sendResetEmail, 
  sendVerificationEmail,
  sendFundRequestStatusEmail,
  sendPaymentStatusEmail,
  sendMemberRegistrationEmail,
  sendMemberUpdateEmail,
  sendMemberDeletionEmail,
  sendSupportNotificationEmail,
  sendSupportResponseEmail,
  sendMonthlyContributionReminder
};


