

function toggleForms() {
  const signupForm = document.getElementById("signupForm");
  const loginForm = document.getElementById("loginForm");
  const activeForm = signupForm.classList.contains("active") ? signupForm : loginForm;
  const otherForm = activeForm === signupForm ? loginForm : signupForm;

  // Fade out current
  activeForm.style.opacity = 1;
  activeForm.style.transition = "opacity 0.3s ease, transform 0.3s ease";
  activeForm.style.transform = "translateY(-15px)";
  activeForm.style.opacity = 0;

  setTimeout(() => {
    activeForm.classList.remove("active");
    activeForm.style.display = "none";

    // Fade in other form
    otherForm.style.display = "flex";
    otherForm.style.opacity = 0;
    otherForm.style.transform = "translateY(15px)";
    otherForm.classList.add("active");

    setTimeout(() => {
      otherForm.style.opacity = 1;
      otherForm.style.transform = "translateY(0)";
    }, 10);
  }, 300);
}

// ✅ Utility regex patterns
const regex = {
  name: /^[A-Za-z]{1,50}$/, // letters only
  middleName: /^[A-Za-z\s]{0,50}$/, // allow empty or up to 50 chars with spaces
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 
  phone: /^\+?[0-9]{9,15}$/, // international format
  address: /^(P\.O\.BOX|S\.L\.P)\s\d{3,6},\s[A-Za-z\s]{2,}$/i,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/
};

// ✅ Show feedback under input (UPDATED for auth page)
function setFeedback(input, message, isValid) {
  // Look for auth-specific feedback element
  let feedback = input.parentNode.querySelector(".auth-input-feedback");
  if (!feedback) {
    // Fallback: create one if it doesn't exist
    feedback = document.createElement("div");
    feedback.className = "auth-input-feedback";
    input.parentNode.appendChild(feedback);
  }

  feedback.textContent = message;
  feedback.style.color = isValid ? "green" : "red";
  return isValid;
}

// ✅ Updated Middle Name validation - allows empty, single letter, or full names
function validateMiddleName(input) {
  const value = input.value.trim();
  
  // If empty, it's valid (optional field)
  if (!value) {
    return setFeedback(input, "✓ Optional field", true);
  }
  
  // Check if it contains only letters and spaces
  const nameRegex = /^[A-Za-z\s]{1,50}$/;
  if (!nameRegex.test(value)) {
    return setFeedback(input, "Only letters and spaces allowed (max 50 characters).", false);
  }
  
  return setFeedback(input, "✓ Valid middle name", true);
}

// ✅ Validation functions
function validateName(input, isMiddle = false) {
  const value = input.value.trim();
  if (!value) return setFeedback(input, "This field is required.", false);
  
  if (isMiddle) {
    return validateMiddleName(input);
  }
  
  if (!regex.name.test(value)) 
    return setFeedback(input, "Only letters allowed (max 50).", false);
  return setFeedback(input, "✓ Looks good.", true);
}

function validateEmail(input) {
  const value = input.value.trim();
  if (!regex.email.test(value)) 
    return setFeedback(input, "Enter a valid email (e.g., name@example.com).", false);
  return setFeedback(input, "✓ Valid email.", true);
}

function validatePhone(input) {
  const value = input.value.trim();
  if (!regex.phone.test(value)) 
    return setFeedback(input, "Enter valid phone (e.g., +255712345678).", false);
  return setFeedback(input, "✓ Valid phone number.", true);
}

function validateAddress(input) {
  const value = input.value.trim();
  if (!regex.address.test(value)) 
    return setFeedback(input, "Address must be in format: P.O.BOX 12345, NAME or S.L.P 12345, NAME.", false);
  return setFeedback(input, "✓ Valid address.", true);
}

// ✅ Password strength calculation
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
  const meter = input.parentNode.querySelector(".auth-strength-meter");
  if (!meter) return;

  const bar = meter.querySelector(".bar");
  const label = meter.querySelector(".label");

  if (!bar || !label) return;

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
  const value = input.value.trim();
  showPasswordStrength(input);
  if (!regex.password.test(value)) {
    return setFeedback(input, "Password must be 8+ chars with uppercase, lowercase, number & special char.", false);
  }
  return setFeedback(input, "✓ Strong password.", true);
}

function validateConfirmPassword(password, confirm) {
  if (password.value !== confirm.value) {
    return setFeedback(confirm, "Passwords do not match.", false);
  }
  return setFeedback(confirm, "✓ Passwords match.", true);
}

// ✅ Clear validation feedback when switching forms
function clearFormValidation(form) {
  const feedbacks = form.querySelectorAll('.auth-input-feedback');
  feedbacks.forEach(feedback => {
    feedback.textContent = '';
    feedback.style.color = '';
  });
  
  // Clear strength meter
  const strengthMeter = form.querySelector('.auth-strength-meter .bar');
  if (strengthMeter) {
    strengthMeter.style.width = '0%';
    strengthMeter.style.background = 'red';
  }
  
  const strengthLabel = form.querySelector('.auth-strength-meter .label');
  if (strengthLabel) {
    strengthLabel.textContent = '';
  }
}

// ✅ Enhanced toggleForms with validation clearing
function toggleFormsWithValidation() {
  const signupForm = document.getElementById("signupForm");
  const loginForm = document.getElementById("loginForm");
  const activeForm = signupForm.classList.contains("active") ? signupForm : loginForm;
  const otherForm = activeForm === signupForm ? loginForm : signupForm;

  // Clear validation from current form
  clearFormValidation(activeForm);

  // Fade out current
  activeForm.style.opacity = 1;
  activeForm.style.transition = "opacity 0.3s ease, transform 0.3s ease";
  activeForm.style.transform = "translateY(-15px)";
  activeForm.style.opacity = 0;

  setTimeout(() => {
    activeForm.classList.remove("active");
    activeForm.style.display = "none";

    // Fade in other form
    otherForm.style.display = "flex";
    otherForm.style.opacity = 0;
    otherForm.style.transform = "translateY(15px)";
    otherForm.classList.add("active");

    setTimeout(() => {
      otherForm.style.opacity = 1;
      otherForm.style.transform = "translateY(0)";
    }, 10);
  }, 300);
}

// ✅ Attach validation to forms (UPDATED for auth page)
document.addEventListener("DOMContentLoaded", () => {
  console.log("Auth.js loaded - attaching validation...");

  // Login Form Validation
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    console.log("Found login form");
    
    const email = loginForm.querySelector("[name='username']");
    const password = loginForm.querySelector("[name='password']");

    if (email) {
      email.addEventListener("input", () => validateEmail(email));
    }
    
    if (password) {
      password.addEventListener("input", () => {
        // For login, just basic password presence check
        const value = password.value.trim();
        if (!value) {
          setFeedback(password, "Password is required.", false);
        } else {
          setFeedback(password, "✓", true);
        }
      });
    }

    loginForm.addEventListener("submit", e => {
      let valid = true;
      if (email && !validateEmail(email)) valid = false;
      if (password && !password.value.trim()) {
        setFeedback(password, "Password is required.", false);
        valid = false;
      }
      if (!valid) {
        e.preventDefault();
        // Scroll to first error
        const firstError = loginForm.querySelector('.auth-input-feedback[style="color: red;"]');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }

  // Signup Form Validation
  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    console.log("Found signup form");
    
    const email = signupForm.querySelector("[name='username']");
    const password = signupForm.querySelector("[name='password']");
    const confirmPassword = signupForm.querySelector("[name='confirmPassword']");
    const role = signupForm.querySelector("[name='role']");

    if (email) {
      email.addEventListener("input", () => validateEmail(email));
    }
    
    if (password) {
      password.addEventListener("input", () => validatePassword(password));
    }
    
    if (confirmPassword) {
      confirmPassword.addEventListener("input", () => validateConfirmPassword(password, confirmPassword));
    }
    
    if (role) {
      role.addEventListener("change", function() {
        const value = this.value;
        if (!value) {
          setFeedback(this, "Please select a role.", false);
        } else {
          setFeedback(this, "✓ Role selected", true);
        }
      });
    }

    signupForm.addEventListener("submit", e => {
      let valid = true;
      
      if (email && !validateEmail(email)) valid = false;
      if (password && !validatePassword(password)) valid = false;
      if (confirmPassword && !validateConfirmPassword(password, confirmPassword)) valid = false;
      if (role && !role.value) {
        setFeedback(role, "Please select a role.", false);
        valid = false;
      }
      
      if (!valid) {
        e.preventDefault();
        // Scroll to first error
        const firstError = signupForm.querySelector('.auth-input-feedback[style="color: red;"]');
        if (firstError) {
          firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }

  // Update the toggle function to use the enhanced version
  const toggleLinks = document.querySelectorAll('.auth-toggle-link');
  toggleLinks.forEach(link => {
    link.addEventListener('click', toggleFormsWithValidation);
  });

  // Member Registration & Edit Form (for other pages)
  const memberForms = document.querySelectorAll("form[action^='/member']");
  memberForms.forEach(form => {
    const firstName = form.querySelector("[name='first_name']");
    const middleName = form.querySelector("[name='middle_name']");
    const surName = form.querySelector("[name='sur_name']");
    const email = form.querySelector("[name='email']");
    const phone = form.querySelector("[name='phone']");
    const address = form.querySelector("[name='address']");
    
    if(firstName) firstName.addEventListener("input", () => validateName(firstName));
    if(middleName) middleName.addEventListener("input", () => validateMiddleName(middleName));
    if(surName) surName.addEventListener("input", () => validateName(surName));
    if(email) email.addEventListener("input", () => validateEmail(email));
    if(phone) phone.addEventListener("input", () => validatePhone(phone));
    if(address) address.addEventListener("input", () => validateAddress(address));

    form.addEventListener("submit", e => {
      let valid = true;
      if(firstName && !validateName(firstName)) valid = false;
      if(middleName && middleName.value.trim() && !validateMiddleName(middleName)) valid = false;
      if(surName && !validateName(surName)) valid = false;
      if(email && !validateEmail(email)) valid = false;
      if(phone && !validatePhone(phone)) valid = false;
      if(address && !validateAddress(address)) valid = false;
      if(!valid) e.preventDefault();
    });
  });

  // Password Modal (Change Password)
  const changeForm = document.getElementById("changePasswordForm");
  if (changeForm) {
    const password = changeForm.querySelector("[name='newPassword']");
    const confirmPassword = changeForm.querySelector("[name='confirmNewPassword']");
    if(password) password.addEventListener("input", () => validatePassword(password));
    if(confirmPassword) confirmPassword.addEventListener("input", () => validateConfirmPassword(password, confirmPassword));

    changeForm.addEventListener("submit", e => {
      let valid = true;
      if(password && !validatePassword(password)) valid = false;
      if(confirmPassword && !validateConfirmPassword(password, confirmPassword)) valid = false;
      if(!valid) e.preventDefault();
    });
  }

  console.log("Auth validation attached successfully");
});


