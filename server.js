
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
require('dotenv').config();
require('./db'); // Initialize DB

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
const paymentRoutes = require('./routes/paymentRoutes'); // NEW: Import payment routes
const supportRoutes = require('./routes/supportRoutes');
const roiRoutes = require('./routes/roiRoutes');
const refundRoutes = require('./routes/refundRoutes');

const { requireAuth, requireRole, allowRoles, requireVerifiedEmail } = require('./middleware/auth');

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

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 30, httpOnly: true }
}));

// Flash messages
app.use(flash());

// Make session and flash available in views
app.use((req, res, next) => {
  console.log('[DEBUG] Session object:', req.session);
  res.locals.flash = req.flash();
  res.locals.user = req.session.user || null;
  res.locals.omaUser = req.session.omaUser || null;
  next();
});

// ----------------- Routes -----------------
app.get('/', (req, res) => res.render('home', { user: req.session.user }));

app.use(staticRoutes);
app.use('/admin', adminRoutes);
app.use(fundSummaryRoutes);
app.use('/oma', omaRoutes);
app.use('/auth', authRoutes);
app.use('/', authRoutes);
//app.use('/', userRoutes);
app.use('/', fundRoutes);
app.use('/payments', paymentRoutes);
//app.use('/member', requireAuth, allowRoles('chairman','admin'), memberRoutes);
//app.use('/contributions', requireAuth, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), contributionRoutes);

// Protected routes with email verification
app.use('/member', requireAuth, requireVerifiedEmail, allowRoles('chairman','admin'), memberRoutes);
app.use('/contributions', requireAuth, requireVerifiedEmail, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), contributionRoutes);
app.use('/', requireAuth, requireVerifiedEmail, userRoutes);
app.use('/', requireVerifiedEmail,  supportRoutes);
app.use('/roi', roiRoutes);
app.use('/refunds', refundRoutes);

// 404 fallback
app.use((req, res) => res.status(404).send('Page Not Found'));

// Clean up expired temporary data every hour
setInterval(() => {
  const now = Date.now();
  const expired = 30 * 60 * 1000; // 30 minutes
  for (const [email, data] of tempUsers.entries()) {
    if (now - data.createdAt > expired) {
      tempUsers.delete(email);
    }
  }
}, 60 * 60 * 1000);

// Start server
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

