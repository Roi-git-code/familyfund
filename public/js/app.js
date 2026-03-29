
// Main application JavaScript
document.addEventListener('DOMContentLoaded', function() {
  initializeSidebar();
  initializeModals();
  initializeForms();
  initializeAlerts();
  checkAdminAccess();
});

function checkAdminAccess() {
  const userRole = document.body.getAttribute('data-user-role');
  const currentPath = window.location.pathname;
  if (userRole === 'admin' && !currentPath.startsWith('/admin')) {
    const mainContent = document.querySelector('main');
    if (mainContent && !document.querySelector('.admin-restricted')) {
      mainContent.innerHTML = `
        <div class="admin-restricted">
          <div class="admin-restricted-content">
            <div class="admin-restricted-icon">🚫</div>
            <h2>Access Restricted</h2>
            <p>As an Administrator, you can only access the Admin Dashboard for system management tasks.</p>
            <p>Please use the Admin Dashboard to manage users and system settings.</p>
            <div class="mt-4">
              <a href="/admin" class="btn btn-primary">Go to Admin Dashboard</a>
            </div>
          </div>
        </div>
      `;
    }
  }
}

// ======================= SIDEBAR (foolproof toggle) =======================
function initializeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mainContent = document.querySelector('.main-content') || document.querySelector('main');
  
  if (!sidebar) return;
  
  // Mobile toggle
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      sidebar.classList.toggle('show');
      document.body.style.overflow = sidebar.classList.contains('show') ? 'hidden' : '';
    });
  }
  
  // Close on outside click (mobile)
  document.addEventListener('click', function(event) {
    if (window.innerWidth <= 768 && sidebar.classList.contains('show')) {
      const isClickInside = sidebar.contains(event.target);
      const isClickOnToggle = sidebarToggle && sidebarToggle.contains(event.target);
      if (!isClickInside && !isClickOnToggle) {
        sidebar.classList.remove('show');
        document.body.style.overflow = '';
      }
    }
  });
  
  // Reset on resize
  window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
      sidebar.classList.remove('show');
      document.body.style.overflow = '';
    }
  });
  
  // Initialize collapsible groups (using direct style toggling)
  initializeSidebarGroups();
  highlightCurrentPage();
}

function initializeSidebarGroups() {
  const groups = document.querySelectorAll('.sidebar-group');
  if (!groups.length) {
    console.warn('No sidebar groups found');
    return;
  }
  
  groups.forEach(group => {
    const header = group.querySelector('.sidebar-group-header');
    const content = group.querySelector('.sidebar-group-content');
    if (!header || !content) return;
    
    // Initially hide content if not active
    if (!group.classList.contains('active')) {
      content.style.display = 'none';
    } else {
      content.style.display = 'block';
    }
    
    // Auto-expand if current page is inside
    const currentPath = window.location.pathname;
    const links = content.querySelectorAll('a');
    let shouldExpand = false;
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href !== '#' && (currentPath === href || (href !== '/' && currentPath.startsWith(href)))) {
        shouldExpand = true;
      }
    });
    if (shouldExpand && !group.classList.contains('active')) {
      group.classList.add('active');
      content.style.display = 'block';
    }
    
    // Toggle on header click
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = group.classList.contains('active');
      if (isActive) {
        group.classList.remove('active');
        content.style.display = 'none';
      } else {
        group.classList.add('active');
        content.style.display = 'block';
      }
      saveSidebarState();
    });
  });
  
  loadSidebarState();
}

function saveSidebarState() {
  const groups = document.querySelectorAll('.sidebar-group');
  const state = {};
  groups.forEach((group, index) => {
    const groupId = group.getAttribute('data-group') || `group-${index}`;
    state[groupId] = group.classList.contains('active');
  });
  localStorage.setItem('sidebarGroupsState', JSON.stringify(state));
}

function loadSidebarState() {
  const saved = localStorage.getItem('sidebarGroupsState');
  if (!saved) return;
  try {
    const state = JSON.parse(saved);
    const groups = document.querySelectorAll('.sidebar-group');
    groups.forEach(group => {
      const groupId = group.getAttribute('data-group');
      if (groupId && state[groupId] === true && !group.classList.contains('active')) {
        group.classList.add('active');
        const content = group.querySelector('.sidebar-group-content');
        if (content) content.style.display = 'block';
      }
    });
  } catch(e) { console.warn('Failed to load sidebar state', e); }
}

function highlightCurrentPage() {
  const currentPath = window.location.pathname;
  document.querySelectorAll('.sidebar a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href !== '#' && currentPath === href) {
      link.style.backgroundColor = '#34495e';
      link.style.fontWeight = 'bold';
    } else if (href && href !== '#' && currentPath.startsWith(href) && href !== '/') {
      link.style.backgroundColor = '#3a546d';
    }
  });
}

// ======================= MODALS (safe) =======================
function initializeModals() {
  const bootstrapModals = document.querySelectorAll('.modal');
  bootstrapModals.forEach(modal => {
    try {
      new bootstrap.Modal(modal);
    } catch(e) { console.warn('Could not initialize modal', modal, e); }
  });
  
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  const passwordModal = document.getElementById('passwordModal');
  if (changePasswordBtn && passwordModal) {
    changePasswordBtn.addEventListener('click', function(e) {
      e.preventDefault();
      try {
        const modal = new bootstrap.Modal(passwordModal);
        modal.show();
      } catch(e) { console.warn('Password modal error', e); }
    });
  }
}

// ======================= FORMS & VALIDATION =======================
function initializeForms() {
  const changePasswordForm = document.getElementById('changePasswordForm');
  if (changePasswordForm) {
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmNewPassword');
    const passwordMatchError = document.getElementById('passwordMatchError');
    function validatePasswordMatch() {
      if (newPassword.value !== confirmPassword.value) {
        passwordMatchError.style.display = 'block';
        confirmPassword.classList.add('is-invalid');
      } else {
        passwordMatchError.style.display = 'none';
        confirmPassword.classList.remove('is-invalid');
        confirmPassword.classList.add('is-valid');
      }
    }
    if (newPassword && confirmPassword) {
      newPassword.addEventListener('input', validatePasswordMatch);
      confirmPassword.addEventListener('input', validatePasswordMatch);
    }
    changePasswordForm.addEventListener('submit', function(e) {
      if (newPassword.value !== confirmPassword.value) {
        e.preventDefault();
        passwordMatchError.style.display = 'block';
        confirmPassword.focus();
        return false;
      }
      return true;
    });
  }
  
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      let isValid = true;
      form.querySelectorAll('[required]').forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          field.classList.add('is-invalid');
        } else {
          field.classList.remove('is-invalid');
          field.classList.add('is-valid');
        }
      });
      if (!isValid) {
        e.preventDefault();
        const firstInvalid = form.querySelector('.is-invalid');
        if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}

function initializeAlerts() {
  document.querySelectorAll('.alert:not(.alert-permanent)').forEach(alert => {
    setTimeout(() => {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alert);
      bsAlert.close();
    }, 5000);
  });
  document.querySelectorAll('.flash-message').forEach(flash => {
    setTimeout(() => {
      flash.style.opacity = '0';
      flash.style.transform = 'translateX(100%)';
      setTimeout(() => flash.remove(), 300);
    }, 4000);
    const closeBtn = flash.querySelector('.close-flash');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      flash.style.opacity = '0';
      flash.style.transform = 'translateX(100%)';
      setTimeout(() => flash.remove(), 300);
    });
  });
}

// ======================= UTILITIES =======================
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS' }).format(amount);
}
function showLoading(button) {
  const originalText = button.innerHTML;
  button.innerHTML = '<span class="loading-spinner me-2"></span> Processing...';
  button.disabled = true;
  return originalText;
}
function hideLoading(button, originalText) {
  button.innerHTML = originalText;
  button.disabled = false;
}
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

window.App = { formatCurrency, showLoading, hideLoading, debounce };

window.addEventListener('online', () => {
  const alert = document.createElement('div');
  alert.className = 'alert alert-success alert-dismissible fade show';
  alert.innerHTML = `<i class="fas fa-wifi me-2"></i> Connection restored.<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  document.querySelector('.main-content')?.prepend(alert) || document.querySelector('main')?.prepend(alert);
});
window.addEventListener('offline', () => {
  const alert = document.createElement('div');
  alert.className = 'alert alert-warning alert-dismissible fade show';
  alert.innerHTML = `<i class="fas fa-wifi-slash me-2"></i> You are offline. Some features may not work.<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  document.querySelector('.main-content')?.prepend(alert) || document.querySelector('main')?.prepend(alert);
});


