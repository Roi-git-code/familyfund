
// routes/omaRoutes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const omaModel = require('../models/omaModel');
const memberModel = require('../models/memberModel');
const fs = require("fs");
const path = require("path");

// ---------------- Middleware ----------------
function requireOmaAuth(req, res, next) {
  console.log('[DEBUG] requireOmaAuth, session:', req.session);
  if (!req.session.omaUser) {
    req.flash('error', 'Please login to access that page.');
    return res.redirect('/oma/auth');
  }
  next();
}

function requireChairman(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'chairman') {
    req.flash('error', 'Access denied');
    return res.redirect('/');
  }
  next();
}

// --- Middleware to attach latest application ---
async function attachLatestApplication(req, res, next) {
  if (req.session.omaUser) {
    try {
      const latestApp = await omaModel.getLatestApplicationByUserId(req.session.omaUser.id);
      res.locals.omaApplication = latestApp || null;
    } catch (err) {
      console.error('[DEBUG] attachLatestApplication error:', err);
      res.locals.omaApplication = null;
    }
  } else {
    res.locals.omaApplication = null;
  }
  next();
}

router.use(attachLatestApplication);

// ---------------- Pages ----------------
router.get("/home", (req, res) => {
  console.log('[DEBUG] GET /oma/home, session:', req.session);
  res.render("oma-home", {
    title: 'Home',
    omaUser: req.session.omaUser || null
  });
});

router.get('/auth', (req, res) => {
  console.log('[DEBUG] GET /oma/auth, session:', req.session);
  res.render('oma-auth', {
    title: 'User authentication',
    omaUser: req.session.omaUser || null
  });
});

// ---------------- Signup ----------------
router.post('/signup',
  body('first_name').trim().notEmpty().withMessage('First name required'),
  body('sur_name').trim().notEmpty().withMessage('Surname required'),
  body('phone').trim().notEmpty().withMessage('Phone required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  async (req, res) => {
    console.log('[DEBUG] Signup POST data:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[DEBUG] Signup validation errors:', errors.array());
      req.flash('error', errors.array().map(e => e.msg).join(', '));
      return res.redirect('/oma/auth#signupPane');
    }

    const { first_name, middle_name, sur_name, phone, password, email } = req.body;
    try {
      const existingOmaUser = await omaModel.findOmaUserByPhone(phone);
      
      if (existingOmaUser) {
        req.flash('error', 'Phone number already registered in OMA system.');
        return res.redirect('/oma/auth#signupPane');
      }

      const hashed = await bcrypt.hash(password, 10);
      const newUser = await omaModel.createOmaUser({ first_name, middle_name, sur_name, phone, passwordHash: hashed, email });
      console.log('[DEBUG] New OMA user created:', newUser);

      req.session.omaUser = { id: newUser.id, phone: newUser.phone, first_name: newUser.first_name };
      console.log('[DEBUG] Session after signup:', req.session);

      req.flash('success', 'Signup successful. Please continue to application.');
      return res.redirect('/oma/guide');
    } catch (err) {
      console.error('[DEBUG] OMA signup error:', err);
      req.flash('error', 'Signup failed, try again.');
      return res.redirect('/oma/auth#signupPane');
    }
  }
);

// ---------------- Apply ----------------
router.post('/apply',
  requireOmaAuth,
  body('first_name').trim().notEmpty().withMessage('First name required'),
  body('sur_name').trim().notEmpty().withMessage('Surname required'),
  body('date_of_birth').isDate().withMessage('Date of birth required'),
  body('address').trim().notEmpty().withMessage('Address required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('phone').trim().notEmpty().withMessage('Phone required'),
  body('gender').notEmpty().withMessage('Gender required'),
  async (req, res) => {
    console.log('[DEBUG] Apply POST data:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map(e => e.msg).join(', '));
      req.session.formData = req.body;
      return res.redirect('/oma/apply');
    }

    const userId = req.session.omaUser?.id;
    const { email, phone } = req.body;
    try {
      const existingMembers = await omaModel.findExistingMember(email, phone);
      if (existingMembers && existingMembers.length > 0) {
        req.flash('error', 'A member already exists with this email or phone number.');
        req.session.formData = req.body;
        return res.redirect('/oma/apply');
      }

      const pendingApps = await omaModel.findPendingApplicationsByUserId(userId);
      if (pendingApps && pendingApps.length > 0) {
        req.flash('error', 'You already have a pending application. Please wait for review.');
        return res.redirect('/oma/guide');
      }

      const app = await omaModel.createApplication(req.body, userId);
      console.log('[DEBUG] New application created:', app);

      if (req.body.kin1_first_name && req.body.kin1_sur_name) {
        await omaModel.createNextOfKinForApplication(app.id, {
          first_name: req.body.kin1_first_name,
          middle_name: req.body.kin1_middle_name,
          sur_name: req.body.kin1_sur_name,
          gender: req.body.kin1_gender,
          email: req.body.kin1_email,
          phone: req.body.kin1_phone,
          address: req.body.kin1_address,
          relationship: req.body.kin1_relationship
        });
      }
      
      if (req.body.kin2_first_name && req.body.kin2_sur_name) {
        await omaModel.createNextOfKinForApplication(app.id, {
          first_name: req.body.kin2_first_name,
          middle_name: req.body.kin2_middle_name,
          sur_name: req.body.kin2_sur_name,
          gender: req.body.kin2_gender,
          email: req.body.kin2_email,
          phone: req.body.kin2_phone,
          address: req.body.kin2_address,
          relationship: req.body.kin2_relationship
        });
      }

      req.flash('success', 'Application submitted successfully. You will be notified about the application status via email');
      return res.redirect(`/oma/application/${app.id}/success`);
    } catch (err) {
      console.error('[DEBUG] OMA apply error:', err);
      req.flash('error', 'Failed to submit application. Please try again.');
      req.session.formData = req.body;
      return res.redirect('/oma/apply');
    }
  }
);

// ---------------- Clear Form Data ----------------
router.post('/clear-form-data', requireOmaAuth, (req, res) => {
  req.session.formData = null;
  res.status(200).json({ success: true });
});

// ---------------- Login ----------------
router.post('/login', async (req, res) => {
  console.log('[DEBUG] Login POST data:', req.body);
  const { phone, password } = req.body;

  try {
    const user = await omaModel.findOmaUserByPhone(phone);
    console.log('[DEBUG] OMA user found:', user);

    if (!user) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/oma/auth');
    }

    const ok = await bcrypt.compare(password, user.password);
    console.log('[DEBUG] Password match result:', ok);

    if (!ok) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/oma/auth');
    }

    req.session.omaUser = { id: user.id, phone: user.phone, first_name: user.first_name };
    console.log('[DEBUG] Session after login:', req.session);

    req.flash('success', 'Logged in successfully.');
    return res.redirect('/oma/guide');
  } catch (err) {
    console.error('[DEBUG] OMA login error:', err);
    req.flash('error', 'Login failed');
    return res.redirect('/oma/auth');
  }
});

// ---------------- Guide & Apply ----------------
router.get('/guide', requireOmaAuth, (req, res) => {
  res.render('oma-guide', {
    title: 'Application Guide',
    user: req.session.omaUser,
    omaUser: req.session.omaUser
  });
});

router.get('/apply', requireOmaAuth, (req, res) => {
  res.render('oma-apply', {
    title: 'Application window',
    formData: {},
    omaUser: req.session.omaUser
  });
});

// List all applications for a given user
router.get('/applications/user/:userId', requireOmaAuth, async (req, res) => {
  const { userId } = req.params;
  const sessionUserId = String(req.session.omaUser.id);

  console.log('[DEBUG] GET /oma/applications/user/:userId', { userId, sessionUserId });

  if (String(userId) !== sessionUserId) {
    req.flash('error', 'You can only view your own applications.');
    return res.redirect('/oma/guide');
  }

  try {
    const app = await omaModel.getLatestApplicationByUserId(parseInt(req.params.userId, 10));
    const apps = await omaModel.getApplicationsByUserId(parseInt(req.params.userId, 10));
    if (!apps || apps.length === 0) {
      req.flash('info', 'No applications found. Please create one.');
      return res.redirect('/oma/apply');
    }
    res.render('oma-application-success', {
      app,
      id: app.id,
      apps,
      omaUser: req.session.omaUser
    });
  } catch (err) {
    console.error('[DEBUG] getApplicationsByUserId error:', err);
    req.flash('error', 'Failed to load applications.');
    res.redirect('/oma/guide');
  }
});

// ==== Footer ====
function addFooter(doc, username) {
  const generatedOn = new Date().toLocaleString();
  const range = doc.bufferedPageRange();

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 40;
    const margin = doc.page.margins.left;
    const usableWidth = doc.page.width - margin * 2;

    const leftX = margin;
    const centerX = margin + usableWidth / 2;
    const rightX = margin + usableWidth;

    doc.strokeColor('#800080').moveTo(margin, bottom - 5).lineTo(rightX, bottom - 5).stroke();

    doc.fontSize(9).fillColor('gray');
    doc.text(`Generated: ${generatedOn}`, leftX, bottom, { lineBreak: false });

    const unameWidth = doc.widthOfString(username);
    doc.text(`Printed by ${username}`, centerX - unameWidth / 2, bottom, { lineBreak: false });

    const pageLabel = `Page ${i + 1} of ${range.count}`;
    const pageLabelWidth = doc.widthOfString(pageLabel);
    doc.text(pageLabel, rightX - pageLabelWidth, bottom, { lineBreak: false });
  }
}

// =================== PDF Layout ===================
function drawSectionBox(doc, title, y, height) {
  const startX = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.lineWidth(1.2).strokeColor('#800080').rect(startX, y, width, height).stroke();
  doc.fontSize(12).fillColor('#800080').font('Helvetica-Bold')
    .text(title, startX + 10, y - 12);
}

function drawField(doc, label, value, x, y, maxWidth = 200) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
    .text(`${label}: `, x, y, { continued: true });
  doc.font('Helvetica').fontSize(11).fillColor('#000')
    .text(value || '—', { width: maxWidth });
}

// ---------------- Admin (Chairman) ----------------
router.get('/admin/list', requireChairman, async (req, res) => {
  try {
    const apps = await omaModel.getAllApplications();
    res.render('oma-admin-list', {
      apps,
      flash: { error: req.flash('error') || [], success: req.flash('success') || [] },
      user: req.session.user || null
    });
  } catch (err) {
    console.error('[DEBUG] Admin list error:', err);
    req.flash('error', 'Failed to load applications');
    res.redirect('/');
  }
});

router.post('/admin/action/:id', requireChairman, async (req, res) => {
  const action = req.body.action;
  const id = req.params.id;
  
  console.log('🚀 ========== ADMIN ACTION STARTED ==========');
  console.log('📋 Action Details:', { 
    action: action,
    applicationId: id,
    sessionUserId: req.session.user?.id,
    sessionUserRole: req.session.user?.role,
    hasReason: !!req.body.reason,
    reasonLength: req.body.reason?.length || 0
  });

  try {
    if (!action) {
      console.error('❌ No action specified in request');
      req.flash('error', 'No action specified');
      return res.redirect('/oma/admin/list');
    }

    console.log(`🔄 Processing action: ${action} for application: ${id}`);

    if (action === 'reject') {
      console.log('❌ REJECT ACTION TRIGGERED');
      const reason = req.body.reason || 'Rejected by administrator';
      console.log('📝 Rejection reason:', reason);
      
      const result = await omaModel.updateApplicationStatus(id, 'Rejected', req.session.user?.id || null, reason);
      console.log('✅ Application rejected successfully:', result);
      
      req.flash('success', 'Application rejected successfully.');
      
    } else if (action === 'approve') {
      console.log('✅ APPROVE ACTION TRIGGERED');
      
      const result = await omaModel.updateApplicationStatus(id, 'Approved', req.session.user?.id || null, null);
      console.log('✅ Application approved successfully:', result);
      
      req.flash('success', 'Application approved successfully.');
      
    } else if (action === 'register') {
      console.log('👤 REGISTER ACTION TRIGGERED');
      
      const app = await omaModel.getApplicationWithKins(id);
      
      if (!app) {
        console.error('❌ APPLICATION NOT FOUND:', id);
        throw new Error(`Application with ID ${id} not found`);
      }

      console.log('📄 Application data received:');
      console.log('   - ID:', app.id);
      console.log('   - Name:', `${app.first_name} ${app.middle_name || ''} ${app.sur_name}`);
      
      req.session.formData = {
        first_name: app.first_name,
        middle_name: app.middle_name,
        sur_name: app.sur_name,
        date_of_birth: app.date_of_birth,
        address: app.address,
        email: app.email,
        phone: app.phone,
        marital_status: app.marital_status,
        number_of_children: app.number_of_children || 0,
        father_alive: app.father_alive ? 'on' : undefined,
        mother_alive: app.mother_alive ? 'on' : undefined,
        gender: app.gender
      };

      console.log('✅ Main application data prepared');

      if (app.next_of_kins && Array.isArray(app.next_of_kins)) {
        console.log(`📞 Processing ${app.next_of_kins.length} next of kin records`);
        
        if (app.next_of_kins.length >= 1) {
          const kin1 = app.next_of_kins[0];
          console.log('   - Kin 1:', `${kin1.first_name} ${kin1.sur_name}`);
          
          req.session.formData.kin1_first_name = kin1.first_name;
          req.session.formData.kin1_middle_name = kin1.middle_name;
          req.session.formData.kin1_sur_name = kin1.sur_name;
          req.session.formData.kin1_gender = kin1.gender;
          req.session.formData.kin1_email = kin1.email;
          req.session.formData.kin1_phone = kin1.phone;
          req.session.formData.kin1_address = kin1.address;
          req.session.formData.kin1_relationship = kin1.relationship;
        }

        if (app.next_of_kins.length >= 2) {
          const kin2 = app.next_of_kins[1];
          console.log('   - Kin 2:', `${kin2.first_name} ${kin2.sur_name}`);
          
          req.session.formData.kin2_first_name = kin2.first_name;
          req.session.formData.kin2_middle_name = kin2.middle_name;
          req.session.formData.kin2_sur_name = kin2.sur_name;
          req.session.formData.kin2_gender = kin2.gender;
          req.session.formData.kin2_email = kin2.email;
          req.session.formData.kin2_phone = kin2.phone;
          req.session.formData.kin2_address = kin2.address;
          req.session.formData.kin2_relationship = kin2.relationship;
        }
      } else {
        console.log('⚠️  No next of kin data to process');
      }

      console.log('🔎 Final formData analysis:');
      console.log('   - Member:', `${req.session.formData.first_name} ${req.session.formData.sur_name}`);
      console.log('   - Has Kin 1?', !!req.session.formData.kin1_first_name);
      console.log('   - Has Kin 2?', !!req.session.formData.kin2_first_name);

      const statusResult = await omaModel.updateApplicationStatus(
        id, 
        'Registered', 
        req.session.user?.id || null, 
        'Registered by chairman'
      );
      console.log('✅ Application status updated:', statusResult);

      console.log('🔄 Redirecting to member registration form...');
      return res.redirect('/member/form');
      
    } else {
      console.error('❌ UNKNOWN ACTION:', action);
      req.flash('error', `Unknown action: ${action}`);
    }

    console.log('✅ Action completed successfully, redirecting to admin list');
    res.redirect('/oma/admin/list');
    
  } catch (err) {
    console.error('💥 ADMIN ACTION ERROR:', err);
    console.error('📌 Error details:', {
      message: err.message,
      stack: err.stack,
      applicationId: id,
      action: action
    });
    
    req.flash('error', `Action failed: ${err.message}`);
    res.redirect('/oma/admin/list');
  } finally {
    console.log('🏁 ========== ADMIN ACTION COMPLETED ==========');
  }
});

// ---------------- Get Next of Kin for Admin Modal ----------------
router.get('/admin/application/:id/next-of-kin', requireChairman, async (req, res) => {
  try {
    const { id } = req.params;
    const kins = await omaModel.getNextOfKinsByApplicationId(id);
    res.json(kins);
  } catch (err) {
    console.error('[DEBUG] Get next of kin error:', err);
    res.status(500).json({ error: 'Failed to load next of kin information' });
  }
});

// ---------------- View Any Application ----------------
router.get('/application/:id/view', requireOmaAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.omaUser.id;

  try {
    const app = await omaModel.getApplicationWithKins(id);
    
    if (!app || app.user_id !== userId) {
      req.flash('error', 'Application not found or access denied');
      return res.redirect('/oma/applications');
    }

    const apps = await omaModel.getApplicationsByUserId(userId);

    res.render('oma-application-success', {
      title: 'Application Details',
      app,
      apps,
      omaUser: req.session.omaUser,
      flash: req.flash()
    });
  } catch (err) {
    console.error('[DEBUG] Application view error:', err);
    req.flash('error', 'Failed to load application');
    res.redirect('/oma/applications');
  }
});

// ---------------- Applications List Page ----------------
router.get('/applications', requireOmaAuth, async (req, res) => {
  const userId = req.session.omaUser.id;

  try {
    const apps = await omaModel.getApplicationsByUserId(userId);
    
    res.render('oma-applications-list', {
      title: 'My Applications',
      apps,
      omaUser: req.session.omaUser,
      flash: req.flash()
    });
  } catch (err) {
    console.error('[DEBUG] Applications list error:', err);
    req.flash('error', 'Failed to load applications');
    res.redirect('/oma/guide');
  }
});

// ---------------- Secure PDF Download ----------------
router.get('/application/:id/pdf', requireOmaAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.omaUser.id;

    const app = await omaModel.getApplicationWithKins(id);
    if (!app || app.user_id !== userId) {
      req.flash('error', 'Application not found or access denied');
      return res.redirect('/oma/applications');
    }

    res.setHeader('Content-Disposition', `attachment; filename=application-${app.id}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');

    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: 70, bottom: 60, left: 50, right: 50 }
    });
    doc.pipe(res);

    // Track current Y position and page management
    let currentY = 0;
    const pageHeight = doc.page.height;
    const bottomMargin = 95; // Extra space for footer and next section

    // Function to check if we need a new page
    const needsNewPage = (requiredHeight) => {
      return (currentY + requiredHeight) > (pageHeight - bottomMargin);
    };

    // Function to add new page with header
    const addNewPage = () => {
      doc.addPage();
      currentY = doc.page.margins.top;
      
      // Add header to new page
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 35, { width: 60 });

      doc.fontSize(20).font('Helvetica-Bold').fillColor('#4B0082')
        .text('Online Member Application System', 120, 40, { align: 'center' });
      doc.fontSize(14).fillColor('#000')
        .text('OMAS - Member Application Form', { align: 'center' });
      
      doc.moveDown(2);
    };

    // Initial page setup
    currentY = doc.page.margins.top;

    // Header section
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 35, { width: 60 });

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#4B0082')
      .text('Online Member Application System', 120, 40, { align: 'center' });
    doc.fontSize(14).fillColor('#000')
      .text('OMAS - Member Application Form', { align: 'center' });

    doc.moveDown(2);
    
    // Passport photo placeholder
    doc.strokeColor('#800080').rect(410, 85, 138, 130).stroke();
    doc.fontSize(10).fillColor('gray').text("Member's", 455, 135);
    doc.fontSize(10).fillColor('gray').text("Passport Photo", 445, 150);

    // Application meta box
    doc.lineWidth(1).strokeColor('#800080').rect(50, 100, 180, 60).stroke();
    doc.fontSize(10).fillColor('black')
      .text(`Application ID: ${app.id}`, 55, 110)
      .text(`Submitted: ${new Date(app.created_at).toLocaleDateString()}`, 55, 125);

    // === Personal Information Box ===
    currentY = 230;
    if (needsNewPage(100)) {
      addNewPage();
      currentY = doc.page.margins.top + 25;
    }
    
    drawSectionBox(doc, "Personal Information", currentY, 100);
    let leftX = 65;
    let rightX = 300;
    let rowY = currentY + 18;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('First Name: ', leftX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.first_name);
    
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Date of Birth: ', rightX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(new Date(app.date_of_birth).toLocaleDateString());

    rowY += 20;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Middle Name: ', leftX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.middle_name || '—');
    
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Marital Status: ', rightX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.marital_status || '—');

    rowY += 20;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Surname: ', leftX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.sur_name);
    
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Children: ', rightX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.number_of_children?.toString() || '0');

    // === Contact Information Box ===
    currentY += 116;
    if (needsNewPage(75)) {
      addNewPage();
      currentY = doc.page.margins.top + 25;
    }
    
    drawSectionBox(doc, "Contact Information", currentY, 80);
    rowY = currentY + 18;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Address: ', leftX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.address);
    
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Email: ', rightX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.email);

    rowY += 18;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Phone: ', leftX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.phone);

    // === Family Background Box ===
    currentY += 95;
    if (needsNewPage(65)) {
      addNewPage();
      currentY = doc.page.margins.top + 25;
    }
    
    drawSectionBox(doc, "Family Background", currentY, 70);
    rowY = currentY + 18;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Father Alive: ', leftX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.father_alive ? 'Yes' : 'No');
    
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Mother Alive: ', rightX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.mother_alive ? 'Yes' : 'No');

    // === Next of Kin Information Box ===
    currentY += 85;
    const kins = app.next_of_kins || [];
    const kinBoxHeight = kins.length > 0 ? 40 + (kins.length * 90) : 80;
    
    // Check if we need new page for next of kin
    if (needsNewPage(kinBoxHeight)) {
      addNewPage();
      currentY = doc.page.margins.top + 25;
    }
    
    drawSectionBox(doc, "Next of Kin Information", currentY, kinBoxHeight);
    rowY = currentY + 18;

    if (kins.length > 0) {
      kins.forEach((kin, index) => {
        // Check if we need new page for each kin (in case of many kins)
        if (needsNewPage(70)) {
          addNewPage();
          currentY = doc.page.margins.top + 25;
          rowY = currentY + 18;
          
          // Redraw section box on new page
          const remainingKins = kins.slice(index);
          const remainingHeight = 60 + (remainingKins.length * 90);
          drawSectionBox(doc, "Next of Kin Information (Continued)", currentY, remainingHeight);
        }

        // Kin header
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#4B0082')
          .text(`Next of Kin ${index + 1}:`, leftX, rowY);
        
        rowY += 17;
        
        // Kin details
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
          .text('Full Name: ', leftX, rowY, { continued: true });
        doc.font('Helvetica').fontSize(11).fillColor('#000')
          .text(`${kin.first_name} ${kin.middle_name || ''} ${kin.sur_name}`.trim());
        
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
          .text('Relationship: ', rightX, rowY, { continued: true });
        doc.font('Helvetica').fontSize(11).fillColor('#000')
          .text(kin.relationship);

        rowY += 17;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
          .text('Gender: ', leftX, rowY, { continued: true });
        doc.font('Helvetica').fontSize(11).fillColor('#000')
          .text(kin.gender);
        
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
          .text('Phone: ', rightX, rowY, { continued: true });
        doc.font('Helvetica').fontSize(11).fillColor('#000')
          .text(kin.phone);

        rowY += 17;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
          .text('Email: ', leftX, rowY, { continued: true });
        doc.font('Helvetica').fontSize(11).fillColor('#000')
          .text(kin.email || 'N/A');
        
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
          .text('Address: ', rightX, rowY, { continued: true });
        doc.font('Helvetica').fontSize(11).fillColor('#000')
          .text(kin.address);

        rowY += 23; // Space between kins
        currentY = rowY; // Update currentY for page calculation
      });
    } else {
      doc.font('Helvetica').fontSize(11).fillColor('#666')
        .text('No next of kin information provided', leftX, rowY);
    }

    // === Application Status Box - ALWAYS ON SEPARATE PAGE ===
    
    addNewPage(); // Force new page for status
    currentY = doc.page.margins.top + 40;
    
    drawSectionBox(doc, "Application Status", currentY, 80);
    rowY = currentY + 20;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Status: ', leftX, rowY, { continued: true });
    
    // Color code the status
    const statusColor = app.status === 'Approved' ? 'green' : 
                       app.status === 'Rejected' ? 'red' : 
                       app.status === 'Registered' ? 'blue' : 'orange';
    doc.font('Helvetica-Bold').fontSize(11).fillColor(statusColor)
      .text(app.status);

    rowY += 20;
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
      .text('Reviewer Note: ', leftX, rowY, { continued: true });
    doc.font('Helvetica').fontSize(11).fillColor('#000')
      .text(app.reviewer_note || 'Not yet Reviewed');

    rowY += 20;
    if (app.reviewed_at) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
        .text('Reviewed At: ', leftX, rowY, { continued: true });
      doc.font('Helvetica').fontSize(11).fillColor('#000')
        .text(new Date(app.reviewed_at).toLocaleString());
    }

    // Signature area on the same page as status
    currentY += 120;
    if (needsNewPage(80)) {
      addNewPage();
      currentY = doc.page.margins.top + 25;
    }
    
    doc.fontSize(11).fillColor('#000');
    doc.text(`Applicant's Name: ___________________________________`, 50, currentY);
    doc.text(`Signature: _____________________`, 360, currentY);
    
    currentY += 30;
    doc.text(`Date: ________/________/___________`, 50, currentY);

    // Footer with username + generated date + page numbers
    const username = req.session.omaUser?.first_name || "User";
    addFooter(doc, username);

    doc.end();

  } catch (err) {
    console.error('[DEBUG] PDF error:', err);
    req.flash('error', 'PDF generation failed');
    res.redirect('/oma/applications');
  }
});


// Update the existing success route to redirect to view
router.get('/application/:id/success', requireOmaAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.session.omaUser.id;

  try {
    const app = await omaModel.getApplicationByIdAndUserId(id, userId);
    if (!app) {
      req.flash('error', 'Application not found');
      return res.redirect('/oma/applications');
    }

    res.redirect(`/oma/application/${id}/view`);
  } catch (err) {
    console.error('[DEBUG] Application success error:', err);
    req.flash('error', 'Failed to load application');
    res.redirect('/oma/applications');
  }
});

module.exports = router;


