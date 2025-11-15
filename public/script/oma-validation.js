

// oma-validation.js - Enhanced with Next of Kin validation

// ✅ Regex patterns
const regex = {
  name: /^[A-Za-z\s]{1,50}$/,        // letters and spaces
  middleName: /^[A-Za-z\s]{0,50}$/,  // allow letters and spaces for middle name
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^(?:\+?255|0)?[67]\d{8}$/, // Tanzanian phone format
  address: /^(P\.O\.BOX|S\.L\.P|P\.O\. BOX)\s\d{1,6},?\s*[A-Za-z\s,.-]{2,}$/i,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/
};

// ✅ Set feedback under input
function setFeedback(input, message, isValid) {
  let feedback = input.parentNode.querySelector(".input-feedback");
  if (!feedback) {
    feedback = document.createElement("small");
    feedback.className = "input-feedback";
    input.parentNode.appendChild(feedback);
  }
  feedback.textContent = message;
  feedback.style.color = isValid ? "green" : "red";
  
  // Update Bootstrap validation classes
  if (isValid) {
    input.classList.remove('is-invalid');
    input.classList.add('is-valid');
  } else {
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
  }
  
  return isValid;
}

// ✅ Clear feedback
function clearFeedback(input) {
  const feedback = input.parentNode.querySelector(".input-feedback");
  if (feedback) {
    feedback.remove();
  }
  input.classList.remove('is-invalid', 'is-valid');
}

// ✅ Name validation
function validateName(input, isMiddle = false) {
  const value = input.value.trim();
  if (!value && input.hasAttribute('required')) {
    return setFeedback(input, "This field is required.", false);
  }
  if (!value) {
    clearFeedback(input);
    return true; // Optional field
  }
  if (isMiddle && regex.middleName.test(value)) {
    return setFeedback(input, "✓ Middle name accepted.", true);
  }
  if (!regex.name.test(value)) {
    return setFeedback(input, "Only letters and spaces allowed (max 50 characters).", false);
  }
  return setFeedback(input, "✓ Looks good.", true);
}

// ✅ Email validation
function validateEmail(input) {
  const value = input.value.trim();
  if (!value && input.hasAttribute('required')) {
    return setFeedback(input, "This field is required.", false);
  }
  if (!value) {
    clearFeedback(input);
    return true; // Optional field
  }
  if (!regex.email.test(value)) {
    return setFeedback(input, "Enter a valid email address (e.g., name@example.com).", false);
  }
  return setFeedback(input, "✓ Valid email.", true);
}

// ✅ Phone validation (Tanzanian format)
function validatePhone(input) {
  const value = input.value.trim();
  if (!value && input.hasAttribute('required')) {
    return setFeedback(input, "This field is required.", false);
  }
  if (!value) {
    clearFeedback(input);
    return true; // Optional field
  }
  
  // Clean phone number (remove spaces, dashes, etc.)
  const cleanPhone = value.replace(/[\s\-\(\)]/g, '');
  
  if (!regex.phone.test(cleanPhone)) {
    return setFeedback(input, "Enter a valid Tanzanian phone number (e.g., 255712345678 or 0712345678).", false);
  }
  return setFeedback(input, "✓ Valid phone number.", true);
}

// ✅ Address validation
function validateAddress(input) {
  const value = input.value.trim();
  if (!value && input.hasAttribute('required')) {
    return setFeedback(input, "This field is required.", false);
  }
  if (!value) {
    clearFeedback(input);
    return true; // Optional field
  }
  if (!regex.address.test(value)) {
    return setFeedback(input, "Address must follow format: P.O.BOX 12345, CITY NAME or S.L.P 12345, CITY NAME", false);
  }
  return setFeedback(input, "✓ Valid address.", true);
}

// ✅ Password strength
function getPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[@$!%*?#&]/.test(password)) score++;
  return score;
}

function showPasswordStrength(input) {
  let meter = input.parentNode.querySelector(".strength-meter");
  if (!meter) return;
  const bar = meter.querySelector(".bar");
  const label = meter.querySelector(".label");

  const strength = getPasswordStrength(input.value);
  let width = (strength / 5) * 100;
  let color = "red";
  let text = "Weak";

  if (strength >= 4) { color = "green"; text = "Strong"; }
  else if (strength === 3) { color = "orange"; text = "Medium"; }

  bar.style.width = width + "%";
  bar.style.background = color;
  label.textContent = text;
}

// ✅ Password validation
function validatePassword(input) {
  showPasswordStrength(input);
  if (!regex.password.test(input.value)) {
    return setFeedback(input, "Password must be 8+ characters with uppercase, lowercase, number & special character.", false);
  }
  return setFeedback(input, "✓ Strong password.", true);
}

function validateConfirmPassword(password, confirm) {
  if (password.value !== confirm.value) {
    return setFeedback(confirm, "Passwords do not match.", false);
  }
  return setFeedback(confirm, "✓ Passwords match.", true);
}

// ✅ Next of Kin conditional validation
function setupNextOfKinValidation() {
  const kin2FirstName = document.querySelector('input[name="kin2_first_name"]');
  const kin2Fields = document.querySelectorAll('.kin2-conditional');
  
  function validateKin2Field(field) {
    const kin2FirstNameValue = kin2FirstName.value.trim();
    const fieldValue = field.value.trim();
    
    if (kin2FirstNameValue && !fieldValue && field.hasAttribute('required')) {
      return setFeedback(field, "This field is required when Next of Kin 2 first name is provided.", false);
    }
    
    if (!fieldValue) {
      clearFeedback(field);
      return true;
    }
    
    // Field-specific validation
    switch (field.type) {
      case 'email':
        return validateEmail(field);
      case 'tel':
        return validatePhone(field);
      case 'text':
        if (field.name.includes('first_name') || field.name.includes('sur_name')) {
          return validateName(field);
        }
        break;
      case 'textarea':
        return validateAddress(field);
    }
    
    // For select elements
    if (field.tagName === 'SELECT' && fieldValue === '') {
      return setFeedback(field, "Please select a value.", false);
    }
    
    clearFeedback(field);
    return true;
  }
  
  function toggleKin2Validation() {
    const hasFirstName = kin2FirstName.value.trim() !== '';
    
    kin2Fields.forEach(field => {
      if (hasFirstName) {
        field.setAttribute('required', 'required');
        validateKin2Field(field);
      } else {
        field.removeAttribute('required');
        clearFeedback(field);
      }
    });
  }
  
  // Add event listeners
  kin2FirstName.addEventListener('input', toggleKin2Validation);
  
  kin2Fields.forEach(field => {
    field.addEventListener('input', function() {
      validateKin2Field(this);
    });
    field.addEventListener('change', function() {
      validateKin2Field(this);
    });
  });
  
  // Initial validation
  toggleKin2Validation();
}

// ✅ Form validation helper
function validateFormField(field) {
  switch (field.type) {
    case 'text':
      if (field.name.includes('first_name') || field.name.includes('sur_name') || field.name.includes('middle_name')) {
        return validateName(field, field.name.includes('middle_name'));
      }
      break;
    case 'email':
      return validateEmail(field);
    case 'tel':
      return validatePhone(field);
    case 'textarea':
      if (field.name.includes('address')) {
        return validateAddress(field);
      }
      break;
  }
  
  // For select elements
  if (field.tagName === 'SELECT' && field.hasAttribute('required')) {
    const value = field.value.trim();
    if (!value) {
      return setFeedback(field, "Please select a value.", false);
    }
    return setFeedback(field, "✓ Selected.", true);
  }
  
  return true;
}

// ✅ Attach validation to forms
document.addEventListener("DOMContentLoaded", () => {
  // Setup Next of Kin validation
  setupNextOfKinValidation();

  // Member application form
  const applyForm = document.getElementById("omaApplyForm");
  if (applyForm) {
    const fields = applyForm.querySelectorAll('input, select, textarea');
    
    fields.forEach(field => {
      // Skip kin2 fields for now (handled by conditional validation)
      if (field.classList.contains('kin2-conditional')) return;
      
      field.addEventListener('blur', function() {
        validateFormField(this);
      });
      
      // Real-time validation for specific fields
      if (field.type === 'email' || field.type === 'tel' || 
          field.name.includes('first_name') || field.name.includes('sur_name')) {
        field.addEventListener('input', function() {
          validateFormField(this);
        });
      }
    });

    // Next of Kin 1 required fields
    const kin1RequiredFields = applyForm.querySelectorAll('.kin1-required');
    kin1RequiredFields.forEach(field => {
      field.addEventListener('blur', function() {
        validateFormField(this);
      });
    });

    applyForm.addEventListener("submit", function(e) {
      let valid = true;
      
      // Validate all required fields
      const requiredFields = applyForm.querySelectorAll('[required]');
      requiredFields.forEach(field => {
        if (!validateFormField(field)) {
          valid = false;
        }
      });
      
      if (!valid) {
        e.preventDefault();
        // Scroll to first error
        const firstError = applyForm.querySelector('.is-invalid');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstError.focus();
        }
      }
    });
  }

  // Signup form
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    const firstName = signupForm.querySelector("[name='first_name']");
    const middleName = signupForm.querySelector("[name='middle_name']");
    const surName = signupForm.querySelector("[name='sur_name']");
    const email = signupForm.querySelector("[name='email']");
    const phone = signupForm.querySelector("[name='phone']");
    const password = signupForm.querySelector("[name='password']");
    const confirmPassword = signupForm.querySelector("[name='confirmPassword']");

    if (firstName) firstName.addEventListener("blur", () => validateName(firstName));
    if (middleName) middleName.addEventListener("blur", () => validateName(middleName, true));
    if (surName) surName.addEventListener("blur", () => validateName(surName));
    if (email) email.addEventListener("blur", () => validateEmail(email));
    if (phone) phone.addEventListener("blur", () => validatePhone(phone));
    if (password) password.addEventListener("input", () => validatePassword(password));
    if (confirmPassword) confirmPassword.addEventListener("input", () => validateConfirmPassword(password, confirmPassword));

    signupForm.addEventListener("submit", e => {
      let valid = true;
      if (firstName && !validateName(firstName)) valid = false;
      if (middleName && !validateName(middleName, true)) valid = false;
      if (surName && !validateName(surName)) valid = false;
      if (email && !validateEmail(email)) valid = false;
      if (phone && !validatePhone(phone)) valid = false;
      if (password && !validatePassword(password)) valid = false;
      if (confirmPassword && !validateConfirmPassword(password, confirmPassword)) valid = false;
      
      if (!valid) {
        e.preventDefault();
        const firstError = signupForm.querySelector('.is-invalid');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstError.focus();
        }
      }
    });
  }

  // Login form
  const loginForm = document.querySelector("form[action='/oma/login']");
  if (loginForm) {
    const phone = loginForm.querySelector("[name='phone']");
    const password = loginForm.querySelector("[name='password']");

    if (phone) phone.addEventListener("blur", () => validatePhone(phone));
    if (password) password.addEventListener("blur", () => validatePassword(password));

    loginForm.addEventListener("submit", e => {
      let valid = true;
      if (phone && !validatePhone(phone)) valid = false;
      if (password && !validatePassword(password)) valid = false;
      
      if (!valid) {
        e.preventDefault();
        const firstError = loginForm.querySelector('.is-invalid');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstError.focus();
        }
      }
    });
  }
});

// ✅ Export for testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    regex,
    validateName,
    validateEmail,
    validatePhone,
    validateAddress,
    validatePassword,
    validateConfirmPassword
  };
}


