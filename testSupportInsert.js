
// testSupportInsert.js
const { createSupportMessage } = require('./models/supportModel');

async function testInsert() {
  try {
    const newMessage = await createSupportMessage({
      userId: 27, // use an existing user ID
      name: 'Guess Maxwell',
      email: 'guessmaxwel@gmail.com',
      subject: 'Billing Issue',
      urgency: 'medium',
      message: 'It has been four days since I made a payment and it is not reflected.'
    });

    console.log('✅ Inserted support message:', newMessage);
  } catch (error) {
    console.error('❌ Error running test:', error);
  }
}

testInsert();
