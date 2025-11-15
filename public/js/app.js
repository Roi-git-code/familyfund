// Main application JavaScript
document.addEventListener('DOMContentLoaded', function() {
  initializeSidebar();
  initializeModals();
  initializeForms();
  initializeAlerts();
  checkAdminAccess();
});

// NEW FUNCTION: Check if user is admin and restrict content access
function checkAdminAccess() {
  const userRole = document.body.getAttribute('data-user-role');
  const currentPath = window.location.pathname;
  
  // If user is admin and trying to access non-admin routes, redirect
  if (userRole === 'admin' && !currentPath.startsWith('/admin')) {
    // Show restricted access message
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

// NEW FUNCTION: Sidebar functionality with collapsible groups
function initializeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mainContent = document.querySelector('.content') || document.querySelector('main');
  
  if (!sidebar || !sidebarToggle) return;
  
  // Toggle sidebar on button click
  sidebarToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    sidebar.classList.toggle('show');
    if (mainContent) {
      mainContent.classList.toggle('shift');
    }
  });
  
  // Initialize sidebar groups
  initializeSidebarGroups();
  
  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', function(event) {
    if (window.innerWidth <= 768) {
      const isClickInsideSidebar = sidebar.contains(event.target);
      const isClickOnToggle = sidebarToggle.contains(event.target);
      
      if (!isClickInsideSidebar && !isClickOnToggle && sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
        if (mainContent) {
          mainContent.classList.remove('shift');
        }
      }
    }
  });
  
  // Handle window resize
  window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
      sidebar.classList.add('show');
      if (mainContent) {
        mainContent.classList.add('shift');
      }
    } else {
      sidebar.classList.remove('show');
      if (mainContent) {
        mainContent.classList.remove('shift');
      }
    }
  });
  
  // Initialize desktop sidebar state
  if (window.innerWidth > 768) {
    sidebar.classList.add('show');
    if (mainContent) {
      mainContent.classList.add('shift');
    }
  }
}

// NEW FUNCTION: Initialize collapsible sidebar groups with toggling
function initializeSidebarGroups() {
  const sidebarGroups = document.querySelectorAll('.sidebar-group');
  
  sidebarGroups.forEach(group => {
    const header = group.querySelector('.sidebar-group-header');
    const content = group.querySelector('.sidebar-group-content');
    const arrow = group.querySelector('.arrow');
    
    if (header && content && arrow) {
      // Check if this group should be initially expanded
      const currentPath = window.location.pathname;
      const links = content.querySelectorAll('a');
      let shouldExpand = false;
      
      links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
          shouldExpand = true;
        }
      });
      
      // Expand group if current page is in this group
      if (shouldExpand) {
        group.classList.add('active');
        content.style.maxHeight = content.scrollHeight + 'px';
      }
      
      // Toggle group on header click
      header.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleSidebarGroup(group);
      });
    }
  });
  
  // Load saved sidebar state
  loadSidebarState();
}

// NEW FUNCTION: Toggle individual sidebar group
function toggleSidebarGroup(group) {
  const content = group.querySelector('.sidebar-group-content');
  const isActive = group.classList.contains('active');
  
  if (isActive) {
    // Close the group
    group.classList.remove('active');
    content.style.maxHeight = '0';
  } else {
    // Open the group
    group.classList.add('active');
    content.style.maxHeight = content.scrollHeight + 'px';
    
    // Optional: Close other groups (uncomment if you want accordion behavior)
    // closeOtherSidebarGroups(group);
  }
  
  // Save sidebar state
  saveSidebarState();
}

// NEW FUNCTION: Close all other sidebar groups (accordion behavior)
function closeOtherSidebarGroups(activeGroup) {
  const sidebarGroups = document.querySelectorAll('.sidebar-group');
  
  sidebarGroups.forEach(group => {
    if (group !== activeGroup) {
      group.classList.remove('active');
      const content = group.querySelector('.sidebar-group-content');
      if (content) {
        content.style.maxHeight = '0';
      }
    }
  });
}

// NEW FUNCTION: Save sidebar state to localStorage
function saveSidebarState() {
  const sidebarGroups = document.querySelectorAll('.sidebar-group');
  const state = {};
  
  sidebarGroups.forEach((group, index) => {
    state[`group-${index}`] = group.classList.contains('active');
  });
  
  localStorage.setItem('sidebarState', JSON.stringify(state));
}

// NEW FUNCTION: Load sidebar state from localStorage
function loadSidebarState() {
  const savedState = localStorage.getItem('sidebarState');
  if (savedState) {
    const state = JSON.parse(savedState);
    const sidebarGroups = document.querySelectorAll('.sidebar-group');
    
    sidebarGroups.forEach((group, index) => {
      const groupKey = `group-${index}`;
      if (state[groupKey]) {
        group.classList.add('active');
        const content = group.querySelector('.sidebar-group-content');
        if (content) {
          content.style.maxHeight = content.scrollHeight + 'px';
        }
      }
    });
  }
}

// NEW FUNCTION: Programmatically open a specific sidebar group
function openSidebarGroup(groupIndex) {
  const sidebarGroups = document.querySelectorAll('.sidebar-group');
  if (sidebarGroups[groupIndex]) {
    toggleSidebarGroup(sidebarGroups[groupIndex]);
  }
}

// NEW FUNCTION: Programmatically close a specific sidebar group
function closeSidebarGroup(groupIndex) {
  const sidebarGroups = document.querySelectorAll('.sidebar-group');
  if (sidebarGroups[groupIndex]) {
    const group = sidebarGroups[groupIndex];
    group.classList.remove('active');
    const content = group.querySelector('.sidebar-group-content');
    if (content) {
      content.style.maxHeight = '0';
    }
    saveSidebarState();
  }
}

// NEW FUNCTION: Toggle all sidebar groups
function toggleAllSidebarGroups(open) {
  const sidebarGroups = document.querySelectorAll('.sidebar-group');
  
  sidebarGroups.forEach(group => {
    const content = group.querySelector('.sidebar-group-content');
    if (open) {
      group.classList.add('active');
      content.style.maxHeight = content.scrollHeight + 'px';
    } else {
      group.classList.remove('active');
      content.style.maxHeight = '0';
    }
  });
  
  saveSidebarState();
}

// Modal functionality
function initializeModals() {
  // Password change modal
  const passwordModal = document.getElementById('passwordModal');
  const changePasswordBtn = document.getElementById('changePasswordBtn');
  
  if (changePasswordBtn && passwordModal) {
    changePasswordBtn.addEventListener('click', function(e) {
      e.preventDefault();
      const modal = new bootstrap.Modal(passwordModal);
      modal.show();
    });
  }
  
  // Initialize all modals with Bootstrap
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    new bootstrap.Modal(modal);
  });
}

// Form functionality
function initializeForms() {
  // Password validation
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
  
  // Enhanced form validation
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      const requiredFields = form.querySelectorAll('[required]');
      let isValid = true;
      
      requiredFields.forEach(field => {
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
        // Scroll to first invalid field
        const firstInvalid = form.querySelector('.is-invalid');
        if (firstInvalid) {
          firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstInvalid.focus();
        }
      }
    });
  });
}

// Alert functionality
function initializeAlerts() {
  // Auto-hide alerts after 5 seconds
  const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
  alerts.forEach(alert => {
    setTimeout(() => {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  });
  
  // Legacy flash messages
  const flashMessages = document.querySelectorAll('.flash-message');
  flashMessages.forEach(flash => {
    setTimeout(() => {
      flash.style.opacity = '0';
      flash.style.transform = 'translateX(100%)';
      setTimeout(() => flash.remove(), 300);
    }, 4000);
    
    const closeBtn = flash.querySelector('.close-flash');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        flash.style.opacity = '0';
        flash.style.transform = 'translateX(100%)';
        setTimeout(() => flash.remove(), 300);
      });
    }
  });
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency: 'TZS'
  }).format(amount);
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
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Export sidebar functions for use in other scripts
window.App = {
  formatCurrency,
  showLoading,
  hideLoading,
  debounce,
  // Sidebar functions
  toggleSidebarGroup,
  openSidebarGroup,
  closeSidebarGroup,
  toggleAllSidebarGroups
};

// Global error handler
window.addEventListener('error', function(e) {
  console.error('Global error:', e.error);
});

// Online/offline detection
window.addEventListener('online', function() {
  const alert = document.createElement('div');
  alert.className = 'alert alert-success alert-dismissible fade show';
  alert.innerHTML = `
    <i class="fas fa-wifi me-2"></i>
    Connection restored. You're back online.
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.querySelector('.main-content')?.prepend(alert) || document.querySelector('main')?.prepend(alert);
});

window.addEventListener('offline', function() {
  const alert = document.createElement('div');
  alert.className = 'alert alert-warning alert-dismissible fade show';
  alert.innerHTML = `
    <i class="fas fa-wifi-slash me-2"></i>
    You're currently offline. Some features may not work.
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.querySelector('.main-content')?.prepend(alert) || document.querySelector('main')?.prepend(alert);
});

// Keyboard shortcuts for sidebar (optional)
document.addEventListener('keydown', function(e) {
  // Ctrl + B to toggle sidebar
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault();
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebar && sidebarToggle) {
      sidebarToggle.click();
    }
  }
  
  // Ctrl + 1-9 to toggle specific sidebar groups
  if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const groupIndex = parseInt(e.key) - 1;
    openSidebarGroup(groupIndex);
  }
});


