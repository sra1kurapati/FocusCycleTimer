// --- timer-worker.js ---

let timerIntervalId = null;
let secondsRemaining = 0;
let totalSecondsForMode = 0; // Total seconds for the current mode (focus/break)
let currentMode = 'focus'; // Track mode within worker
let isRunning = false;

const SECONDS_IN_MINUTE = 60;

// Function called every second by the interval
function tick() {
    secondsRemaining--; // Decrement first

    if (secondsRemaining < 0) { // Check if timer reached zero or below
        // Timer finished
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        isRunning = false;
        // Send message back to main script that the current mode is complete
        self.postMessage({ type: 'complete', mode: currentMode });
    } else {
        // Send message back to main script with updated time
        self.postMessage({ type: 'tick', seconds: secondsRemaining, total: totalSecondsForMode });
    }
}

// Listen for messages from the main script
self.onmessage = function(event) {
    const data = event.data;
    console.log('Worker received command:', data.command, data); // Log commands received

    switch (data.command) {
        case 'start':
            // Only start if not already running to prevent multiple intervals
            if (!isRunning) {
                currentMode = data.mode;
                // If resuming, use provided secondsRemaining, otherwise use total time
                secondsRemaining = data.seconds !== undefined ? data.seconds : data.totalSeconds;
                totalSecondsForMode = data.totalSeconds;
                isRunning = true;

                console.log(`Worker starting ${currentMode}: ${secondsRemaining}/${totalSecondsForMode}s`);

                // Clear any residual interval just in case
                if (timerIntervalId) clearInterval(timerIntervalId);

                // Start the interval timer
                timerIntervalId = setInterval(tick, 1000);

                // Immediately send back the initial state for UI sync
                self.postMessage({ type: 'tick', seconds: secondsRemaining, total: totalSecondsForMode });
            } else {
                 console.log('Worker already running, ignoring start command.');
            }
            break;

        case 'pause':
            if (isRunning) {
                console.log('Worker pausing.');
                clearInterval(timerIntervalId);
                timerIntervalId = null;
                isRunning = false;
                // Send message back confirming pause with the exact remaining time
                 self.postMessage({ type: 'paused', seconds: secondsRemaining });
            }
            break;

        case 'reset':
             console.log('Worker resetting.');
             clearInterval(timerIntervalId);
             timerIntervalId = null;
             isRunning = false;
             currentMode = 'focus'; // Reset mode in worker
             secondsRemaining = data.totalSeconds; // Get initial focus time from main script
             totalSecondsForMode = data.totalSeconds;
             // Send message back confirming reset state for UI sync
              self.postMessage({ type: 'resetComplete', seconds: secondsRemaining, total: totalSecondsForMode });
            break;
    }
};

console.log('Timer worker successfully started and ready.'); // Log when the worker script initially loads
