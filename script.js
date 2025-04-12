// --- script.js (Corrected for Web Worker, using bell.wav) ---

// --- DOM Element References ---
// Ensure all these elements exist in your index.html with the correct IDs!
const timerDisplay = document.getElementById('timer-display');
const statusMessage = document.getElementById('status-message');
const startPauseButton = document.getElementById('start-pause-button');
const restartButton = document.getElementById('restart-button');
const progressBar = document.getElementById('progress-bar');
const taskInput = document.getElementById('task-input');
const addTaskButton = document.getElementById('add-task-button');
const taskListArea = document.getElementById('task-list-area');
const currentTimeDisplay = document.getElementById('current-time-display');
const timerCar = document.getElementById('timer-car');
const appContainer = document.querySelector('.app-container');
// Add reference for theme toggle later if needed: const themeToggle = document.getElementById('theme-toggle');


// --- Timer Configuration ---
const FOCUS_TIME_MINUTES = 30;
const BREAK_TIME_MINUTES = 5;
const SECONDS_IN_MINUTE = 60;

// --- Application State (Managed in Main Thread) ---
let currentMode = 'focus'; // 'focus' or 'break'
let isPaused = true; // Start in a paused state initially
let worker = null; // Variable to hold the timer worker instance
let currentSecondsRemaining = FOCUS_TIME_MINUTES * SECONDS_IN_MINUTE; // Track locally for display sync
let currentTotalSeconds = FOCUS_TIME_MINUTES * SECONDS_IN_MINUTE;

// --- Audio ---
// Create an Audio object for the focus completion sound
const focusCompleteSound = new Audio('bell.wav'); // *** Use the .wav file ***
focusCompleteSound.onerror = () => {
    // Log an error if the sound file can't be loaded
    console.error("Error loading the sound file ('bell.wav'). Make sure it's in the same folder as index.html."); // Updated error message
};
// Optional: You could preload the sound if you want
// focusCompleteSound.preload = 'auto';


// --- Utility Functions ---

// Function to format time (seconds) into MM:SS format
function formatTime(seconds) {
    // Ensure seconds is a non-negative number
    const nonNegativeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(nonNegativeSeconds / SECONDS_IN_MINUTE);
    const remainingSeconds = nonNegativeSeconds % SECONDS_IN_MINUTE;
    const displayMinutes = String(minutes).padStart(2, '0');
    const displaySeconds = String(remainingSeconds).padStart(2, '0');
    return `${displayMinutes}:${displaySeconds}`;
}

// Function to update the timer display, page title, progress bar, AND CAR
function updateDisplay(seconds, totalSecs) {
    // Defensive check for valid numbers
    if (typeof seconds !== 'number' || typeof totalSecs !== 'number') {
        console.warn("updateDisplay called with invalid time values:", seconds, totalSecs);
        seconds = currentSecondsRemaining; // Fallback to last known state
        totalSecs = currentTotalSeconds; // Fallback
    }

    const formattedTime = formatTime(seconds);
    timerDisplay.textContent = formattedTime;
    const modeText = currentMode === 'focus' ? 'Focus' : 'Break';
    document.title = `${formattedTime} - ${modeText} - FocusCycle`;

    // Calculate percentage elapsed (ensure totalSecs is not zero)
    let percentageElapsed = 0;
    if (totalSecs > 0) {
        percentageElapsed = Math.max(0, Math.min(100, ((totalSecs - seconds) / totalSecs) * 100));
    }

    // Update progress bar
    progressBar.style.width = `${percentageElapsed}%`;
    progressBar.style.backgroundColor = currentMode === 'focus' ? '#f39c12' : '#2ecc71'; // Orange for focus, Green for break

    // --- CAR MOVEMENT ---
    try { // Add error handling for car movement just in case
        if (currentMode === 'focus' && appContainer && timerCar) {
            const containerWidth = appContainer.offsetWidth;
            const carWidth = timerCar.getBoundingClientRect ? timerCar.getBoundingClientRect().width : (timerCar.offsetWidth || 40);
            const availableWidth = containerWidth - 30 - carWidth;

            if (availableWidth > 0) {
                const moveDistance = (percentageElapsed / 100) * availableWidth;
                timerCar.style.transform = `translateX(${moveDistance}px)`;
            } else {
                timerCar.style.transform = 'translateX(0px)';
            }
        } else if (timerCar) {
            timerCar.style.transform = 'translateX(0px)';
        }
    } catch (e) {
        console.error("Error calculating car position:", e);
        if(timerCar) timerCar.style.transform = 'translateX(0px)'; // Attempt reset on error
    }
    // --- END CAR MOVEMENT ---
}

// --- Timer Control Functions (Send messages to Worker) ---

function startTimerAction() {
    if (!worker) {
         console.error("Worker not available."); return;
    }
    if (!isPaused) {
        console.warn("Timer already running, ignoring start command.");
        return;
    }

    console.log("Executing startTimerAction...");
    isPaused = false;
    statusMessage.textContent = currentMode === 'focus' ? "Focus Time" : "Break Time";
    startPauseButton.textContent = "Pause";

    currentTotalSeconds = (currentMode === 'focus' ? FOCUS_TIME_MINUTES : BREAK_TIME_MINUTES) * SECONDS_IN_MINUTE;
    const startSeconds = (currentSecondsRemaining > 0 && currentSecondsRemaining < currentTotalSeconds) ? currentSecondsRemaining : currentTotalSeconds;

    worker.postMessage({
        command: 'start',
        mode: currentMode,
        seconds: startSeconds,
        totalSeconds: currentTotalSeconds
    });
    console.log('Main sent: start', { mode: currentMode, seconds: startSeconds, total: currentTotalSeconds });
}

function pauseTimerAction() {
    if (!worker) {
         console.error("Worker not available."); return;
    }
     if (isPaused) {
        console.warn("Timer already paused, ignoring pause command.");
        return;
    }

    console.log("Executing pauseTimerAction...");
    isPaused = true;
    statusMessage.textContent = "Paused";
    startPauseButton.textContent = "Start";
    worker.postMessage({ command: 'pause' });
    console.log('Main sent: pause');
}

function resetTimerAction() {
    if (!worker) {
         console.error("Worker not available."); return;
    }

    console.log("Executing resetTimerAction...");
    isPaused = true;
    currentMode = 'focus';
    currentTotalSeconds = FOCUS_TIME_MINUTES * SECONDS_IN_MINUTE;
    currentSecondsRemaining = currentTotalSeconds;

    statusMessage.textContent = "Ready to Focus";
    startPauseButton.textContent = "Start";

    worker.postMessage({ command: 'reset', totalSeconds: currentTotalSeconds });
    console.log('Main sent: reset', { totalSeconds: currentTotalSeconds });

    updateDisplay(currentSecondsRemaining, currentTotalSeconds);
}

// --- Mode Switching and Completion ---

function handleTimerCompletion(completedMode) {
    console.log(`Handling completion of ${completedMode} mode.`);
    isPaused = true; // Timer stops when complete

    // --- Play Sound or Show Alert ---
    if (completedMode === 'focus') {
        // Try to play the bell sound
        focusCompleteSound.play().catch(error => {
            // Playback might fail if user hasn't interacted recently
            console.warn("Audio playback failed (might require user interaction first):", error);
            alert("Focus session complete! Time for a break."); // Fallback alert
        });
    } else { // Completed break mode
         alert("Break session complete! Time to focus.");
    }
    // --- End Sound/Alert ---


    // --- Switch Mode Logic ---
    if (completedMode === 'focus') {
        currentMode = 'break';
        currentTotalSeconds = BREAK_TIME_MINUTES * SECONDS_IN_MINUTE;
        currentSecondsRemaining = currentTotalSeconds;
        statusMessage.textContent = "Break Time";
    } else { // Completed break mode
        currentMode = 'focus';
        currentTotalSeconds = FOCUS_TIME_MINUTES * SECONDS_IN_MINUTE;
        currentSecondsRemaining = currentTotalSeconds;
        statusMessage.textContent = "Ready to Focus";
    }

    startPauseButton.textContent = "Start"; // Ensure button says "Start" for next phase
    updateDisplay(currentSecondsRemaining, currentTotalSeconds); // Update display for the new mode
}

// --- Task Management Functions ---

function addTaskToList(text) {
    try {
        const taskItem = document.createElement('div');
        taskItem.classList.add('task-item');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('task-checkbox');
        checkbox.addEventListener('change', handleTaskCompletion);

        const taskLabel = document.createElement('span');
        taskLabel.textContent = text;
        taskLabel.classList.add('task-label');

        const deleteButton = document.createElement('button');
        deleteButton.textContent = '✕';
        deleteButton.classList.add('task-delete-button');
        deleteButton.title = 'Delete Task';
        deleteButton.addEventListener('click', () => {
            taskItem.remove();
            console.log("Task removed:", text);
        });

        taskItem.appendChild(checkbox);
        taskItem.appendChild(taskLabel);
        taskItem.appendChild(deleteButton);

        if (taskListArea) {
             taskListArea.appendChild(taskItem);
             console.log("Task added:", text);
        } else {
             console.error("Task list area not found!");
        }

    } catch (e) {
        console.error("Error adding task to list:", e);
    }
}

function handleTaskCompletion(event) {
    const checkbox = event.target;
    const taskItem = checkbox.closest('.task-item');
    if (taskItem) {
        if (checkbox.checked) {
            taskItem.classList.add('completed');
            console.log("Task marked complete");
        } else {
            taskItem.classList.remove('completed');
            console.log("Task marked incomplete");
        }
    } else {
        console.warn("Could not find parent task item for checkbox.");
    }
}

// --- Current Time Function ---
let currentTimeIntervalId = null;

function updateCurrentTime() {
    try {
        const now = new Date();
        const options = {
            timeZone: 'America/Chicago', // CST/CDT
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const formattedTime = formatter.format(now);
        if (currentTimeDisplay) {
             currentTimeDisplay.textContent = `Central Time: ${formattedTime}`;
        } else {
             console.error("Current time display element not found!");
             if (currentTimeIntervalId) clearInterval(currentTimeIntervalId);
        }
    } catch (error) {
        console.error("Error updating current time:", error);
        if (currentTimeDisplay) currentTimeDisplay.textContent = "Current time unavailable.";
        if (currentTimeIntervalId) clearInterval(currentTimeIntervalId);
    }
}

// --- Web Worker Setup & Initialization ---
function initializeApp() {
    console.log("Initializing App...");

    if (window.Worker) {
        console.log("Web Workers supported. Creating worker...");
        try {
            worker = new Worker('timer-worker.js');
            console.log("Worker instance created.");

            // --- Setup Worker Message Listener ---
            worker.onmessage = function(event) {
                const data = event.data;
                // console.log('Main received message:', data);

                switch (data.type) {
                    case 'tick':
                        currentSecondsRemaining = data.seconds;
                        currentTotalSeconds = data.total;
                        updateDisplay(currentSecondsRemaining, currentTotalSeconds);
                        break;
                    case 'complete':
                        console.log(`Worker reported ${data.mode} complete.`);
                        handleTimerCompletion(data.mode);
                        break;
                    case 'paused':
                        console.log('Worker confirmed pause at:', data.seconds);
                        currentSecondsRemaining = data.seconds;
                         updateDisplay(currentSecondsRemaining, currentTotalSeconds);
                        break;
                    case 'resetComplete':
                        console.log('Worker confirmed reset.');
                         currentSecondsRemaining = data.seconds;
                         currentTotalSeconds = data.total;
                        updateDisplay(currentSecondsRemaining, currentTotalSeconds);
                        break;
                    default:
                         console.warn("Main received unknown message type from worker:", data.type);
                }
            };

            // --- Setup Worker Error Listener ---
            worker.onerror = function(error) {
                console.error("!!! Error in timer worker:", error.message, error);
                statusMessage.textContent = "Timer Error!";
                startPauseButton.disabled = true;
                restartButton.disabled = true;
                startPauseButton.style.backgroundColor = '#aaa';
                restartButton.style.backgroundColor = '#aaa';
            };

            console.log("Worker message and error listeners attached.");

        } catch (e) {
             console.error("!!! Failed to create Web Worker:", e);
             statusMessage.textContent = "Timer Init Failed!";
             startPauseButton.disabled = true;
             restartButton.disabled = true;
        }

    } else {
        console.warn("Web Workers are not supported in this browser.");
        statusMessage.textContent = "Browser lacks worker support!";
        startPauseButton.style.display = 'none';
        restartButton.style.display = 'none';
    }

    // --- Attach Event Listeners ---
    if (startPauseButton) {
        startPauseButton.addEventListener('click', () => {
            console.log("Start/Pause button clicked. isPaused:", isPaused);
            if (isPaused) {
                startTimerAction();
            } else {
                pauseTimerAction();
            }
        });
    } else console.error("Start/Pause button not found!");

    if (restartButton) {
        restartButton.addEventListener('click', () => {
            console.log("Restart button clicked.");
            resetTimerAction();
        });
    } else console.error("Restart button not found!");

    if (addTaskButton && taskInput) {
        addTaskButton.addEventListener('click', () => {
            console.log("Add task button clicked.");
            const taskText = taskInput.value.trim();
            if (taskText) {
                addTaskToList(taskText);
                taskInput.value = "";
                taskInput.focus();
            } else {
                alert("Please enter a task name.");
            }
        });

        taskInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' || e.keyCode === 13) {
                console.log("Enter key pressed in task input.");
                e.preventDefault();
                addTaskButton.click();
            }
        });
    } else console.error("Task input or add button not found!");

    console.log("Event listeners attached.");

    // --- Initial UI State & Timers ---
    resetTimerAction();
    updateCurrentTime();
    if (currentTimeDisplay) {
        currentTimeIntervalId = setInterval(updateCurrentTime, 1000);
        console.log("Current time update interval started.");
    }

    console.log("FocusCycle App Initialized.");
}

// --- Run Initialization ---
document.addEventListener('DOMContentLoaded', initializeApp);
