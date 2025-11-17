
const { createSupportMessage, checkSupportTable } = require('./supportModel');

(async () => {
  try {
    const msg = await createSupportMessage({
      userId: 27,               // replace with a valid user ID in your DB
      memberId: 19,             // replace with a valid member ID, or null if optional
      name: 'Guess Maxwell',
      email: 'guessmaxwel@gmail.com',
      subject: 'Test Insert',
      urgency: 'medium',
      message: 'This is a test message'
    });
    console.log('Inserted message ID:', msg.id);

    const recent = await checkSupportTable();
    console.log('Recent messages:', recent);
  } catch (err) {
    console.error('❌ Error running test:', err);
  }
})();
