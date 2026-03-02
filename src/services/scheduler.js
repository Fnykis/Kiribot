const logActivity = require('../core/logger');

function scheduleDailyTask(hour, minute, task) {
    // Calculate the delay until the next time the task should run
    const now = new Date();
    const targetTime = new Date();

    targetTime.setHours(hour);
    targetTime.setMinutes(minute);
    targetTime.setSeconds(0);
    targetTime.setMilliseconds(0);

    if (targetTime < now) {
        // If the target time has already passed today, schedule for tomorrow
        targetTime.setDate(targetTime.getDate() + 1);
    }

    const delay = targetTime - now;

    // Schedule the task to run at the target time
    setTimeout(() => {
        task();

        // Schedule the task to run every 24 hours
        setInterval(task, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    }, delay);
}

function scheduleHourlyTask(task) {
    // Calculate the delay until the next hour
    const now = new Date();
    const nextHour = new Date();

    // Set to the next hour (e.g., if it's 11:44, set to 12:00)
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);

    const delay = nextHour - now;

    // Schedule the task to run at the next hour
    setTimeout(() => {
        task(true); // Pass true for update mode

        // Schedule the task to run every hour
        setInterval(() => {
            task(true); // Pass true for update mode
        }, 60 * 60 * 1000); // 60 minutes in milliseconds
    }, delay);

    logActivity(`Scheduled hourly task "${task.name}" to run at ${nextHour.getHours() + 1}:00`);
}

function scheduleTwiceDailyTask(time1Hour, time1Minute, time2Hour, time2Minute, task) {
	// Schedule first time
	const now = new Date();
	const targetTime1 = new Date();
	targetTime1.setHours(time1Hour);
	targetTime1.setMinutes(time1Minute);
	targetTime1.setSeconds(0);
	targetTime1.setMilliseconds(0);

	if (targetTime1 < now) {
		targetTime1.setDate(targetTime1.getDate() + 1);
	}

	const delay1 = targetTime1 - now;

	setTimeout(() => {
		task();
		// Schedule to run every 24 hours
		setInterval(task, 24 * 60 * 60 * 1000);
	}, delay1);

	// Schedule second time
	const targetTime2 = new Date();
	targetTime2.setHours(time2Hour);
	targetTime2.setMinutes(time2Minute);
	targetTime2.setSeconds(0);
	targetTime2.setMilliseconds(0);

	if (targetTime2 < now) {
		targetTime2.setDate(targetTime2.getDate() + 1);
	}

	const delay2 = targetTime2 - now;

	setTimeout(() => {
		task();
		// Schedule to run every 24 hours
		setInterval(task, 24 * 60 * 60 * 1000);
	}, delay2);

}

module.exports = { scheduleDailyTask, scheduleHourlyTask, scheduleTwiceDailyTask };
