     
      document.addEventListener('DOMContentLoaded', function() {
      // Get all tab buttons and form sections
      const tabButtons = document.querySelectorAll('.tab-btn');
      const formSections = document.querySelectorAll('.form-section');
      const guideSteps = document.querySelectorAll('.guide-step');
      
      // Function to switch tabs
      function switchTab(tabId) {
        // Update active tab button
        tabButtons.forEach(btn => {
          btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        // Show corresponding form section
        formSections.forEach(section => {
          section.classList.toggle('active', section.id === `${tabId}-form`);
        });
        
        // Update visual guide
        guideSteps.forEach(step => {
          step.classList.toggle('active', step.dataset.tab === tabId);
        });
      }
      
      // Add click event to tab buttons
      tabButtons.forEach(button => {
        button.addEventListener('click', () => {
          switchTab(button.dataset.tab);
        });
      });
      
      // Add click event to visual guide steps
      guideSteps.forEach(step => {
        step.addEventListener('click', () => {
          switchTab(step.dataset.tab);
        });
      });
      
      // Add animation to form inputs on focus
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        input.addEventListener('focus', function() {
          this.parentElement.style.transform = 'translateY(-5px)';
          this.parentElement.style.transition = 'transform 0.3s ease';
        });
        
        input.addEventListener('blur', function() {
          this.parentElement.style.transform = 'translateY(0)';
        });
      });
      
      // Form validation and submission would go here
      const submitButtons = document.querySelectorAll('.btn-submit');
      submitButtons.forEach(button => {
        button.addEventListener('click', function() {
          const formType = this.closest('.form-section').id;
          alert(`${formType === 'profile-form' ? 'Profile update' : 'Fund request'} submitted successfully!`);
          
          // Visual feedback
          this.textContent = '✓ Submitted!';
          this.style.background = 'linear-gradient(to right, #27ae60, #2ecc71)';
          setTimeout(() => {
            this.textContent = formType === 'profile-form' ? 'Submit Profile Update' : 'Submit Fund Request';
          }, 2000);
        });
      });
    });
