

// public/js/flash.js
class FlashSystem {
  constructor() {
    this.container = document.getElementById('flash-container');
    this.init();
  }

  init() {
    if (!this.container) return;

    // Show all flash messages on page load
    this.showAllMessages();
    
    // Add event listeners for close buttons
    this.container.addEventListener('click', (e) => {
      if (e.target.closest('.flash-close')) {
        this.closeMessage(e.target.closest('.flash-message'));
      }
    });
  }

  showAllMessages() {
    const messages = this.container.querySelectorAll('.flash-message');
    
    messages.forEach((message, index) => {
      // Stagger the appearance of messages
      setTimeout(() => {
        this.showMessage(message);
      }, index * 150);
    });
  }

  showMessage(message) {
    message.classList.add('show');
    
    const duration = parseInt(message.dataset.duration) || 5000;
    const progressBar = message.querySelector('.flash-progress-bar');
    
    // Set progress bar animation duration
    if (progressBar) {
      progressBar.style.animationDuration = duration + 'ms';
    }
    
    // Auto-remove after duration
    this.autoRemove(message, duration);
  }

  closeMessage(message) {
    if (!message) return;
    
    message.classList.add('hiding');
    
    setTimeout(() => {
      message.remove();
      this.checkEmptyContainer();
    }, 400);
  }

  autoRemove(message, duration) {
    setTimeout(() => {
      if (message.parentElement) {
        this.closeMessage(message);
      }
    }, duration);
  }

  checkEmptyContainer() {
    if (this.container.children.length === 0) {
      this.container.style.display = 'none';
    }
  }

  // Method to programmatically show new flash messages
  show(type, title, text, duration = 5000) {
    const message = this.createMessageElement(type, title, text, duration);
    this.container.appendChild(message);
    this.showMessage(message);
  }

  createMessageElement(type, title, text, duration) {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle',
      alert: 'fa-bell'
    };

    const message = document.createElement('div');
    message.className = `flash-message flash-${type}`;
    message.dataset.type = type;
    message.dataset.duration = duration;
    
    message.innerHTML = `
      <div class="flash-icon">
        <i class="fas ${icons[type]}"></i>
      </div>
      <div class="flash-content">
        <div class="flash-title">${title}</div>
        <div class="flash-text">${text}</div>
      </div>
      <div class="flash-progress">
        <div class="flash-progress-bar"></div>
      </div>
      <button class="flash-close" aria-label="Close message">
        <i class="fas fa-times"></i>
      </button>
    `;

    return message;
  }
}

// Initialize flash system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.flashSystem = new FlashSystem();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FlashSystem;
}


