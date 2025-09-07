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
      const existingApps = await omaModel.findByEmailOrPhone(email || '', phone || '');
      console.log('[DEBUG] findByEmailOrPhone result:', existingApps);

      if (existingOmaUser || (existingApps && existingApps.length > 0)) {
        req.flash('error', 'Phone or email already registered or applied.');
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

router.post('/apply',
  requireOmaAuth,
  body('first_name').trim().notEmpty().withMessage('First name required'),
  body('sur_name').trim().notEmpty().withMessage('Surname required'),
  body('date_of_birth').isDate().withMessage('Date of birth required'),
  body('address').trim().notEmpty().withMessage('Address required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('phone').trim().notEmpty().withMessage('Phone required'),
  async (req, res) => {
    console.log('[DEBUG] Apply POST data:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map(e => e.msg).join(', '));
      return res.redirect('/oma/apply');
    }

    const userId = req.session.omaUser?.id;
    const { email, phone } = req.body;
    try {
      const existingApps = await omaModel.findByEmailOrPhone(email, phone);
      if (existingApps && existingApps.length > 0) {
        req.flash('error', 'An application with this email or phone already exists.');
        return res.redirect('/oma/apply');
      }

      const members = await memberModel.getAllMembers();
      if (members.some(m => m.email === email || m.phone === phone)) {
        req.flash('error', 'A member already exists with this email or phone.');
        return res.redirect('/oma/apply');
      }

      const app = await omaModel.createApplication(req.body,userId);
      console.log('[DEBUG] New application created:', app);

      req.flash('success', 'Application submitted successfully.');
      return res.redirect(`/oma/application/${app.id}/success`);
    } catch (err) {
      console.error('[DEBUG] OMA apply error:', err);
      req.flash('error', 'Failed to submit application.');
      return res.redirect('/oma/apply');
    }
  }
);

// ---------------- Application success ----------------
router.get('/application/:id/success', requireOmaAuth, async (req, res) => {

   const { id } = req.params;
  const userId = req.session.omaUser.id;

  try {

    const app = await omaModel.getApplicationById(id);

    // Fetch all applications for this user
    const apps = await omaModel.getApplicationsByUserId(userId);

    console.log('[DEBUG] Application fetched:', app);
    if (!app) {
      req.flash('error', 'Application not found');
      return res.redirect('/oma/guide');
    }
    res.render('oma-application-success', {
      title: 'Application status',
      app,
      apps,
      omaUser: req.session.omaUser
       });
  } catch (err) {
    console.error('[DEBUG] application success error:', err);
    req.flash('error', 'Something went wrong, Failed to load applications');
    res.redirect('/oma/guide');
  }
});


// List all applications for a given user
router.get('/applications/user/:userId', requireOmaAuth, async (req, res) => {
  const { userId } = req.params;
  const sessionUserId = String(req.session.omaUser.id);

  console.log('[DEBUG] GET /oma/applications/user/:userId', { userId, sessionUserId });

  // Prevent users from seeing others' applications
  if (String(userId) !== sessionUserId) {
    req.flash('error', 'You can only view your own applications.');
    return res.redirect('/oma/guide');
  }

  try {
 
    const app = await omaModel. getLatestApplicationByUserId(parseInt(req.params.userId, 10));
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

// Purple line separator above footer
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

// Draw section box with purple border + title
function drawSectionBox(doc, title, y, height) {
  const startX = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.lineWidth(1.2).strokeColor('#800080').rect(startX, y, width, height).stroke();
  doc.fontSize(12).fillColor('#800080').font('Helvetica-Bold')
    .text(title, startX + 10, y - 12);
}

// Draw one field (label bold, value normal)
function drawField(doc, label, value, x, y, maxWidth = 200) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#333')
    .text(`${label}: `, x, y, { continued: true });
  doc.font('Helvetica').fontSize(11).fillColor('#000')
    .text(value || '—', { width: maxWidth });
}

// === PDF Route ===
router.get('/application/:id/pdf', requireOmaAuth, async (req, res) => {
  try {
    const app = await omaModel.getApplicationById(req.params.id);
    if (!app) return res.status(404).send('Not found');

    res.setHeader('Content-Disposition', `attachment; filename=application-${app.id}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');

    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: 70, bottom: 60, left: 50, right: 50 }
    });
    doc.pipe(res);

    // ---- Header ----
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
    let y = 230;
    drawSectionBox(doc, "Personal Information", y, 100);
    let leftX = 65;
    let rightX = 300;
    let rowY = y + 20;

    drawField(doc, 'First Name', app.first_name, leftX, rowY); 
    drawField(doc, 'Date of Birth', new Date(app.date_of_birth).toLocaleDateString(), rightX, rowY);

    rowY += 25;
    drawField(doc, 'Middle Name', app.middle_name, leftX, rowY);
    drawField(doc, 'Marital Status', app.marital_status, rightX, rowY);

    rowY += 25;
    drawField(doc, 'Surname', app.sur_name, leftX, rowY);
    drawField(doc, 'Children', app.number_of_children?.toString() || '0', rightX, rowY);

    // === Contact Information Box ===
    y += 120;
    drawSectionBox(doc, "Contact Information", y, 80);
    rowY = y + 20;

    drawField(doc, 'Address', app.address, leftX, rowY, 200);
    drawField(doc, 'Email', app.email, rightX, rowY, 200);

    rowY += 25;
    drawField(doc, 'Phone', app.phone, leftX, rowY);

    // === Family Background Box ===
    y += 100;
    drawSectionBox(doc, "Family Background", y, 70);
    rowY = y + 20;

    drawField(doc, 'Father Alive', app.father_alive ? 'Yes' : 'No', leftX, rowY);
    drawField(doc, 'Mother Alive', app.mother_alive ? 'Yes' : 'No', rightX, rowY);

    // === Application Status Box ===
    y += 90;
    drawSectionBox(doc, "Application Status", y, 80);
    rowY = y + 20;

    drawField(doc, 'Status', app.status, leftX, rowY);
    rowY += 25;
    drawField(doc, 'Reviewer Note', app.reviewer_note || 'Not yet Reviewed', rightX, rowY, 200);

    // Signature area
    y += 100;
   leftX -= 25;
    rightX += 60;
   doc.fontSize(11).fillColor('#000');
    doc.text(`Applicant's Name: ________________________________`, leftX, y);
   doc.text(`Signature: ______________________`, rightX, y);

   // Footer with username + generated date + page numbers
   const username = req.session.omaUser?.first_name || "User";
    addFooter(doc, username);

      doc.end();

  } catch (err) {
    console.error('[DEBUG] PDF error:', err);
    res.status(500).send('PDF generation failed');
  }
});


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
  try {
    if (action === 'reject') {
      const reason = req.body.reason || 'Rejected';
      await omaModel.updateApplicationStatus(id, 'Rejected', req.session.user?.id || null, reason);
      req.flash('success', 'Application rejected.');
    } else if (action === 'approve') {
      await omaModel.updateApplicationStatus(id, 'Approved', req.session.user?.id || null, null);
      req.flash('success', 'Application approved.');
    } else if (action === 'register') {
      const app = await omaModel.getApplicationById(id);
      if (!app) throw new Error('Application not found');

      req.session.formData = {
        first_name: app.first_name,
        middle_name: app.middle_name,
        sur_name: app.sur_name,
        date_of_birth: app.date_of_birth,
        address: app.address,
        email: app.email,
        phone: app.phone,
        marital_status: app.marital_status,
        number_of_children: app.number_of_children,
        father_alive: app.father_alive ? 'on' : undefined,
        mother_alive: app.mother_alive ? 'on' : undefined
      };

      await omaModel.updateApplicationStatus(id, 'Registered', req.session.user?.id || null, 'Registered by chairman');
      return res.redirect('/member/form');
    }

    res.redirect('/oma/admin/list');
  } catch (err) {
    console.error('[DEBUG] Admin action error:', err);
    req.flash('error', err.message || 'Action failed');
    res.redirect('/oma/admin/list');
  }
});

module.exports = router;
