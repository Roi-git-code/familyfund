
const pool = require('../db');
const { sendMonthlyContributionReminder } = require('../utils/mail');

class ReminderService {
  // Check if today is a reminder day
static isReminderDay() {
  // Create date in Tanzania timezone (UTC+3)
  const now = new Date();
  const tanzaniaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Dar_es_Salaam' }));
  
  const currentDay = tanzaniaTime.getDate();
  const currentHour = tanzaniaTime.getHours();
  const currentMinute = tanzaniaTime.getMinutes();
  
  console.log(`🌍 Tanzania Time: Day ${currentDay}, Hour ${currentHour}:${currentMinute}`);
  
  // Check if it's 10:00 AM Tanzania time
  if (currentHour !== 10 || currentMinute !== 0) {
    console.log(`⏰ Not 10:00 AM Tanzania time (it's ${currentHour}:${currentMinute})`);
    return false;
  }
  
  // Check if today is reminder day
  const reminderDays = [20, 24, 28, 30];
  const isDay = reminderDays.includes(currentDay);
  
  console.log(`📅 Day ${currentDay} is reminder day? ${isDay}`);
  return isDay;
}
  
  // Get all active members with email
  static async getActiveMembers() {
    try {
      const result = await pool.query(`
        SELECT 
          m.id as member_id,
          m.first_name,
          m.middle_name,
          m.sur_name,
          m.email,
          COALESCE(SUM(ct.amount), 0) as total_contributions
        FROM member m
        LEFT JOIN contribution_transactions ct ON m.id = ct.member_id
        WHERE m.email IS NOT NULL AND m.email != 'unknown@example.com'
        GROUP BY m.id, m.first_name, m.middle_name, m.sur_name, m.email
        ORDER BY m.id
      `);
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching active members:', error);
      return [];
    }
  }
  
  // Calculate current month's contribution for a member
  static async getCurrentMonthContribution(memberId) {
    try {
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1; // January is 0 in JavaScript
      
      const result = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as monthly_total
         FROM contribution_transactions
         WHERE member_id = $1
           AND EXTRACT(YEAR FROM transaction_date) = $2
           AND EXTRACT(MONTH FROM transaction_date) = $3`,
        [memberId, currentYear, currentMonth]
      );
      
      return parseFloat(result.rows[0].monthly_total);
    } catch (error) {
      console.error(`Error calculating monthly contribution for member ${memberId}:`, error);
      return 0;
    }
  }
  
  // Send monthly contribution reminders
  static async sendMonthlyReminders(force = false) {
  // Check if today is a reminder day UNLESS force=true
  if (!force && !this.isReminderDay()) {
    console.log('ℹ️ Today is not a reminder day and not forced');
    return { sent: 0, skipped: 0, errors: 0 };
  }
  
  console.log('🚀 Starting monthly contribution reminders...' + (force ? ' (FORCED)' : ''));
  
  const activeMembers = await this.getActiveMembers();
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleString('en-US', { month: 'long' });
  const currentYear = currentDate.getFullYear();
  const requiredAmount = 20000; // TSh 20,000 monthly target
  
  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  for (const member of activeMembers) {
    try {
      // Get current month's contribution
      const currentMonthTotal = await this.getCurrentMonthContribution(member.member_id);
      
      // Calculate remaining amount
      const remainingAmount = Math.max(0, requiredAmount - currentMonthTotal);
      
      // Only send reminder if contribution is less than 20,000
      if (currentMonthTotal < requiredAmount) {
        console.log(`📧 Preparing reminder for ${member.first_name} ${member.sur_name}`);
        console.log(`   Current contribution: TSh ${currentMonthTotal}, Remaining: TSh ${remainingAmount}`);
        
        const memberData = {
          memberName: `${member.first_name} ${member.middle_name || ''} ${member.sur_name}`.replace(/\s+/g, ' ').trim(),
          memberId: member.member_id,
          currentMonthTotal: currentMonthTotal,
          requiredAmount: requiredAmount,
          remainingAmount: remainingAmount,
          currentMonth: currentMonth,
          currentYear: currentYear,
          dueDate: `End of ${currentMonth}`
        };
        
        // Send the reminder email
        await sendMonthlyContributionReminder(member.email, memberData);
        sentCount++;
        
        // Log success
        console.log(`✅ Reminder sent to ${member.email}`);
        
        // Small delay to avoid overwhelming the email server
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.log(`⏭️ Skipping ${member.first_name} ${member.sur_name} - Already paid TSh ${currentMonthTotal}`);
        skippedCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing member ${member.member_id}:`, error.message);
      errorCount++;
    }
  }
  
  const summary = {
    date: new Date().toISOString(),
    sent: sentCount,
    skipped: skippedCount,
    errors: errorCount,
    totalMembers: activeMembers.length,
    forced: force
  };
  
  console.log('📊 Reminder Summary:', summary);
  return summary;
}
  
}

module.exports = ReminderService;


