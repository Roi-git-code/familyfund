
// utils/supportEmailConfig.js

// This function maps subjects to officer roles
const getOfficerRolesBySubject = (subject) => {
  const subjectMapping = {
    'technical': ['admin'],
    'billing': ['admin', 'chief_signatory', 'assistant_signatory', 'chairman'],
    'account': ['admin', 'chairman'],
    'feature': ['admin', 'chairman'],
    'bug': ['admin'],
    'general': ['admin', 'chairman']
  };

  return subjectMapping[subject] || ['admin'];
};

// This function converts subject value to key
const getSubjectKey = (subject) => {
  // Handle both form values and display text
  const subjectMap = {
    // Form values
    'technical': 'technical',
    'billing': 'billing', 
    'account': 'account',
    'feature': 'feature',
    'bug': 'bug',
    'general': 'general',
    
    // Display text
    'Technical Support': 'technical',
    'Billing & Payments': 'billing',
    'Billing and Payments': 'billing',
    'Account Issues': 'account',
    'Feature Request': 'feature',
    'Feature Requests': 'feature',
    'Bug Report': 'bug',
    'General Inquiry': 'general'
  };
  
  // Convert to lowercase and trim for matching
  const cleanSubject = subject.toString().toLowerCase().trim();
  
  // Try direct match first
  if (subjectMap[cleanSubject]) {
    return subjectMap[cleanSubject];
  }
  
  // Try partial matching
  for (const [key, value] of Object.entries(subjectMap)) {
    if (cleanSubject.includes(key.toLowerCase()) || key.toLowerCase().includes(cleanSubject)) {
      return value;
    }
  }
  
  // Default to general
  return 'general';
};

module.exports = {
  getOfficerRolesBySubject,
  getSubjectKey
};



