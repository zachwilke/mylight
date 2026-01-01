const cron = require('node-cron');

const scheduleResetTask = (timeStr) => {
    // timeStr format: "HH:MM", default "00:00"
    const time = timeStr || "00:00";
    const [hour, minute] = time.split(':');

    // Cron format: minute hour * * *
    const cronExpression = `${minute} ${hour} * * *`;
    console.log(`[Cron] Scheduling chore reset at ${time} (${cronExpression})`);

    const task = cron.schedule(cronExpression, () => {
        console.log(`[Cron] Running scheduled chore reset task at ${new Date().toISOString()}`);
    });

    return task;
};

// Test with current time + 1 minute
const now = new Date();
const nextMin = new Date(now.getTime() + 60000);
const hour = String(nextMin.getHours()).padStart(2, '0');
const min = String(nextMin.getMinutes()).padStart(2, '0');

const timeStr = `${hour}:${min}`;
console.log(`Current time: ${now.toISOString()}`);
console.log(`Scheduling for: ${timeStr}`);

scheduleResetTask(timeStr);

console.log("Waiting for cron...");

// Keep alive
setInterval(() => { }, 1000);
