
const ReminderService = require('../services/reminderService');
const cron = require('node-cron');

class ReminderJob {
  static start() {
    // Schedule job to run daily at 10:00 AM
    cron.schedule('0 10 * * *', async () => {
      console.log('⏰ Running scheduled monthly contribution reminder check...');
      
      try {
        const result = await ReminderService.sendMonthlyReminders();
        console.log('✅ Reminder job completed:', result);
      } catch (error) {
        console.error('❌ Error running reminder job:', error);
      }
    }, {
      scheduled: true,
      timezone: "Africa/Dar_es_Salaam" // Tanzania timezone
    });
    
    console.log('✅ Monthly reminder job scheduled to run daily at 10:00 AM (Tanzania time)');
  }
  
  // Manual trigger for testing
  static async triggerManually() {
    console.log('🔧 Manually triggering reminder job...');
    return await ReminderService.sendMonthlyReminders();
  }
  
  // Test function
  static async test() {
    console.log('🧪 Testing reminder service...');
    return await ReminderService.testSendReminders();
  }
}

module.exports = ReminderJob;


