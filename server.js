
// server.js
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const pgSession = require('connect-pg-simple')(session);
require('dotenv').config();
const pool = require('./db'); // Use your Postgres pool

const paymentService = require('./services/payment');
console.log('paymentService keys:', Object.keys(paymentService));
console.log('initiatePayment is function?', typeof paymentService.initiatePayment);

const staticRoutes = require('./routes/staticRoutes');
const adminRoutes = require('./routes/adminRoutes');
const memberRoutes = require('./routes/memberRoutes');
const contributionRoutes = require('./routes/contributionRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const fundRoutes = require('./routes/fundRoutes');
const omaRoutes = require('./routes/omaRoutes');
const fundSummaryRoutes = require('./routes/fundSummaryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const { requireAuth, requireRole, allowRoles, requireVerifiedEmail } = require('./middleware/auth');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------- Middleware -----------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ----------------- Session -----------------
// Use Postgres-backed session store for production
app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS in prod
      maxAge: 1000 * 60 * 30, // 30 minutes
      httpOnly: true,
    },
  })
);

// Flash messages
app.use(flash());

// Make session and flash available in views
app.use((req, res, next) => {
  res.locals.flash = req.flash();
  res.locals.user = req.session.user || null;
  res.locals.omaUser = req.session.omaUser || null;
  next();
});

// ----------------- Mailer (Production-ready) -----------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Example: test connection
transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP Connection Error:', err);
  } else {
    console.log('✅ SMTP Ready to send emails');
  }
});

// ----------------- Routes -----------------
app.get('/', (req, res) => res.render('home', { user: req.session.user }));

app.use(staticRoutes);
app.use('/admin', adminRoutes);
app.use(fundSummaryRoutes);
app.use('/oma', omaRoutes);
app.use('/auth', authRoutes);
app.use('/', authRoutes);
app.use('/', fundRoutes);
app.use('/payments', paymentRoutes);

// Protected routes with email verification
app.use('/member', requireAuth, requireVerifiedEmail, allowRoles('chairman', 'admin'), memberRoutes);
app.use('/contributions', requireAuth, requireVerifiedEmail, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), contributionRoutes);
app.use('/', requireAuth, requireVerifiedEmail, userRoutes);

// 404 fallback
app.use((req, res) => res.status(404).send('Page Not Found'));

// ----------------- Start server -----------------
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

