

// config/paymentLinks.js
const PAYMENT_LINKS = {
  // Format: amount: { link: 'lipia_url', description: 'description' }
  1000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c402&language=en',
    description: '1,000 TSh Contribution'
  },
  5000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c403&language=en',
    description: '5,000 TSh Contribution'
  },
  10000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c404&language=en',
    description: '10,000 TSh Contribution'
  },
  20000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c405&language=en',
    description: '20,000 TSh Contribution'
  },
  25000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c406&language=en',
    description: '25,000 TSh Contribution'
  },
  50000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c407&language=en',
    description: '50,000 TSh Contribution'
  },
  100000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c408&language=en',
    description: '100,000 TSh Contribution'
  },
  500000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c409&language=en',
    description: '500,000 TSh Contribution'
  },
  1000000: {
    link: 'https://payments.azampay.co.tz/?id=0199ded3-82fc-7077-9207-9147e2b8c410&language=en',
    description: '1,000,000 TSh Contribution'
  }
};

// Helper function to get the appropriate Lipia link for an amount
function getLipiaLinkForAmount(amount) {
  const amountKey = parseInt(amount);
  
  // Check for exact match first
  if (PAYMENT_LINKS[amountKey]) {
    return PAYMENT_LINKS[amountKey];
  }
  
  // If no exact match, find the closest amount
  const availableAmounts = Object.keys(PAYMENT_LINKS).map(a => parseInt(a)).sort((a, b) => a - b);
  let closestAmount = availableAmounts[0]; // Default to smallest amount
  
  for (const availableAmount of availableAmounts) {
    if (availableAmount <= amountKey) {
      closestAmount = availableAmount;
    } else {
      break;
    }
  }
  
  console.log(`Using closest available amount: ${closestAmount} for requested amount: ${amountKey}`);
  return PAYMENT_LINKS[closestAmount];
}

// Get all available amounts for the UI
function getAvailableAmounts() {
  return Object.keys(PAYMENT_LINKS)
    .map(amount => ({
      amount: parseInt(amount),
      description: PAYMENT_LINKS[amount].description
    }))
    .sort((a, b) => a.amount - b.amount);
}

module.exports = {
  PAYMENT_LINKS,
  getLipiaLinkForAmount,
  getAvailableAmounts
};


