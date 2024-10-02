// Initialize IndexedDB
let db;
const request = indexedDB.open('fitnessTrackerDB', 1); // This is where 'request' is defined
let calorieGoal = 1500;
let totalCalories = 0;
let totalWater = 0;
let totalExercise = 0;

request.onupgradeneeded = function(event) {
    db = event.target.result;

    // Create the fitnessData store to hold user settings like waterIncrement, exerciseIncrement, calorieGoal, waterGoal, and exerciseGoal
    if (!db.objectStoreNames.contains('fitnessData')) {
        const fitnessStore = db.createObjectStore('fitnessData', { keyPath: 'key' });
        // Set initial values for waterGoal and exerciseGoal, if necessary
        fitnessStore.add({ key: 'waterGoal', value: 2000 }); // default water goal of 2000ml
        fitnessStore.add({ key: 'exerciseGoal', value: 30 }); // default exercise goal of 30 mins
    }

    // Create the transactions store to hold all fitness transactions (calories, water, exercise, mood)
    if (!db.objectStoreNames.contains('transactions')) {
        const transactionStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });

        // Add indices for efficient querying
        transactionStore.createIndex('date', 'date', { unique: false });
        transactionStore.createIndex('type', 'type', { unique: false });
        transactionStore.createIndex('quantity', 'quantity', { unique: false });
    }
};


// On success - only proceed when db is initialized
request.onsuccess = function(event) {
    db = event.target.result;
    if (db) {
        initApp();
    } else {
        console.error('Error initializing IndexedDB');
    }
};

// On error
request.onerror = function(event) {
    console.error('Error opening IndexedDB:', event.target.errorCode);
};

setInterval(() => {
    removeOldTransactions();
}, 24 * 60 * 60 * 1000);  // Run once every 24 hours

// Initialize the app after IndexedDB is set up
async function initApp() { 
    try {
        // Fetch and set calorie goal
        let fitnessData = await getFromIndexedDB('fitnessData', 'calorieGoal');
        calorieGoal = fitnessData?.value || 1500;

        // Fetch and sum total calories consumed
        let caloriesData = await getAllCalories();
        totalCalories = caloriesData.length > 0 ? caloriesData.reduce((sum, entry) => sum + (entry.quantity || 0), 0) : 0;

        // Fetch and sum total water consumed
        let waterData = await getAllTransactionsByType('water');
        totalWater = waterData.length > 0 ? waterData.reduce((sum, entry) => sum + (entry.quantity || 0), 0) : 0;

        // Fetch and sum total exercise time
        let exerciseData = await getAllTransactionsByType('exercise');
        totalExercise = exerciseData.length > 0 ? exerciseData.reduce((sum, entry) => sum + (entry.quantity || 0), 0) : 0;

        // Update calorie, water, and exercise totals in the UI
        updateCalorieGoal(calorieGoal);
        updateTotalCalories(totalCalories);
        updateRemainingCalories();

        document.getElementById("total-water-intake").innerText = `${totalWater} ml`;
        document.getElementById("total-exercise-time").innerText = `${totalExercise} mins`;

        // Fetch and set water increment in the settings modal
        let waterIncrementData = await getFromIndexedDB('fitnessData', 'waterIncrement');
        let waterIncrement = (waterIncrementData && typeof waterIncrementData === 'object') ? waterIncrementData.value : 256;
        document.getElementById('water-increment-input').value = waterIncrement;

        // Fetch and set water goal in the settings modal
        let waterGoalData = await getFromIndexedDB('fitnessData', 'waterGoal');
        let waterGoal = (waterGoalData && typeof waterGoalData === 'object') ? waterGoalData.value : 2000; // default to 2000ml
        document.getElementById('water-goal-input').value = waterGoal;

        // Fetch and set exercise goal in the settings modal
        let exerciseGoalData = await getFromIndexedDB('fitnessData', 'exerciseGoal');
        let exerciseGoal = (exerciseGoalData && typeof exerciseGoalData === 'object') ? exerciseGoalData.value : 30; // default to 30 mins
        document.getElementById('exercise-goal-input').value = exerciseGoal;

        // Add event listeners for double-click functionality
        document.getElementById('total-calories').ondblclick = openTransactions;

        // Initialize slider values
        let minSliderValue = 25;
        let maxSliderValue = 500;
        document.getElementById("slider").min = minSliderValue;
        document.getElementById("slider").max = maxSliderValue;
        document.getElementById("slider").value = (minSliderValue + maxSliderValue) / 2;

        // Add event listeners for settings and graph buttons
        document.querySelector('.settings-icon').ondblclick = openSettings;
        document.querySelector('.graph-icon').ondblclick = openGraph;
        document.getElementById("slider").addEventListener("input", updateSliderAmount);

        // Attach mood event listeners
        attachMoodEventListeners();
        // Ensure daily values reset if needed
        await checkAndResetDailyValues();  

        // Remove old transactions
        await removeOldTransactions();
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Check and reset daily amounts
async function checkAndResetDailyValues() {
    const today = formatDateForStorage(new Date());
    
    // Get the last updated date from IndexedDB
    let lastUpdatedDateData = await getFromIndexedDB('fitnessData', 'lastUpdatedDate');
    let lastUpdatedDate = lastUpdatedDateData ? lastUpdatedDateData.value : null;
    
    if (lastUpdatedDate !== today) {
        // If the date has changed, reset daily totals
        totalCalories = 0;
        totalWater = 0;
        totalExercise = 0;
        document.getElementById('total-calories').innerText = totalCalories;
        document.getElementById('total-water-intake').innerText = `${totalWater} ml`;
        document.getElementById('total-exercise-time').innerText = `${totalExercise} mins`;
        
        // Save the new date to IndexedDB
        await saveToIndexedDB('fitnessData', { key: 'lastUpdatedDate', value: today });
        
        // Optionally, you can clear today's transactions as well (calories, water, exercise)
        // await clearTodayTransactions(); // This would require another function to remove today’s transactions
    }
}

// Function to remove data older than 12 months
async function removeOldTransactions() {
    const currentDate = new Date();
    
    // Calculate the date 12 months ago
    const cutoffDate = new Date();
    cutoffDate.setFullYear(currentDate.getFullYear() - 1); // Set date to exactly 12 months ago

    try {
        // Fetch all transactions
        const transactions = await getAllTransactions();
        
        // Filter transactions older than 12 months
        const oldTransactions = transactions.filter(transaction => {
            const entryDate = new Date(transaction.date);
            return entryDate < cutoffDate;  // Transactions older than cutoff date
        });

        if (oldTransactions.length > 0) {
            // Delete old transactions
            const dbTransaction = db.transaction(['transactions'], 'readwrite');
            const store = dbTransaction.objectStore('transactions');
            
            oldTransactions.forEach(transaction => {
                store.delete(transaction.id);  // Delete each old transaction by ID
            });

            dbTransaction.oncomplete = function() {
                console.log(`${oldTransactions.length} old transactions removed.`);
            };

            dbTransaction.onerror = function() {
                console.error("Error deleting old transactions.");
            };
        } else {
            console.log("No transactions older than 12 months.");
        }
    } catch (error) {
        console.error('Error removing old transactions:', error);
    }
}

// Ensure that IndexedDB is initialized before making database transactions
async function ensureDbInitialized() {
    if (!db) {
        return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                if (db) {
                    clearInterval(interval);
                    resolve();
                }
            }, 100); // Poll every 100ms to check if db is initialized
        });
    }
}

// Utility function to get data from IndexedDB
function getFromIndexedDB(storeName, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = function() {
            resolve(request.result);
        };
        request.onerror = function() {
            reject(`Error getting data from IndexedDB: ${storeName}`);
        };
    });
}

// Utility function to save data to IndexedDB
function saveToIndexedDB(storeName, data) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = function() {
                resolve();
            };
            request.onerror = function() {
                reject(`Error saving data to IndexedDB: ${storeName}`);
            };
        } catch (error) {
            reject(`Transaction failed: ${error.message}`);
        }
    });
}


// Utility function to format the date as YYYY-MM-DD for storage in IndexedDB
function formatDateForStorage(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}


// Function to update slider amount
function updateSliderAmount() {
    let sliderValue = document.getElementById("slider").value;
    document.getElementById("slider-amount").value = sliderValue;
}

// Function to retrieve all calorie entries from the transactions store
function getAllCalories() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['transactions'], 'readonly');
        const store = transaction.objectStore('transactions');
        const index = store.index('type');
        const request = index.getAll('calories');

        request.onsuccess = function() {
            const result = request.result || [];
            resolve(result.map(item => ({
                ...item,
                quantity: item.quantity || 0  // Ensure quantity has a fallback value
            })));
        };
        request.onerror = function() {
            reject('Error retrieving calories from IndexedDB');
        };
    });
}

// Update UI functions
function updateCalorieGoal(goal) {
    document.getElementById('calorie-goal').innerText = goal;
}

function updateTotalCalories() {
    getAllTransactionsByType('calories').then(caloriesData => {
        totalCalories = caloriesData.length > 0 
            ? caloriesData.reduce((sum, entry) => sum + (entry.quantity || 0), 0) 
            : 0;  // Ensure total is 0 if there are no calorie transactions
        updateRemainingCalories(); // Also update the remaining calories based on the new total
        document.getElementById('total-calories').innerText = totalCalories || 0;  // Fallback to 0
    });
}


function updateRemainingCalories() {
    const remaining = (calorieGoal || 0) - (totalCalories || 0);  // Ensure safe values for both
    document.getElementById('remaining-calories').innerText = remaining >= 0 ? remaining : 0;
}

// Function to handle adding calories as a transaction
async function addCalories() {
    const amountField = document.getElementById('slider-amount');
    const amount = parseInt(amountField.value);

    if (!amount || isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }

    const newEntry = { 
        date: new Date().toISOString(),
        type: 'calories',
        quantity: amount
    };

    try {
        await saveToIndexedDB('transactions', newEntry);

        // Re-fetch all calorie transactions after adding the new one
        let caloriesData = await getAllCalories();
        totalCalories = caloriesData.reduce((sum, entry) => sum + entry.quantity, 0);

        updateTotalCalories(totalCalories);
        updateRemainingCalories();

        // Reset the slider to its midpoint but keep the input amount field empty
        slider.value = (parseInt(slider.min) + parseInt(slider.max)) / 2; 
        // Reset fields
        document.getElementById("slider").value = slider.value;
        amountField.value = "";
        updateTransactionList(); // Refresh the transaction list
    } catch (error) {
        console.error('Error adding calories transaction:', error);
    }
}

// Function to handle incrementing water intake as a transaction
async function incrementWaterIntake() {
    try {
        // Fetch the water increment from IndexedDB settings
        let waterIncrementData = await getFromIndexedDB('fitnessData', 'waterIncrement');
        
        // Use the value from settings or default to 256 if not found
        let waterIncrement = (waterIncrementData && typeof waterIncrementData === 'object') ? waterIncrementData.value : 256;

        let today = new Date();
        let formattedDate = formatDateForStorage(today);

        // Fetch all transactions, sum up existing water intake for the current date
        let transactions = await getAllTransactions();
        let waterData = transactions.filter(transaction => transaction.type === 'water' && transaction.date.startsWith(formattedDate));

        // Sum up current day's total water intake and add the increment
        totalWater = waterData.reduce((sum, transaction) => sum + (transaction.quantity || 0), 0);
        totalWater += waterIncrement; // Increment water using the fetched value

        // Save updated water intake for the current day
        await saveToIndexedDB('transactions', {
            date: today.toISOString(),
            type: 'water',
            quantity: waterIncrement  // Ensure quantity is saved from the increment
        });

        document.getElementById("total-water-intake").innerText = `${totalWater} ml`;
        updateTransactionList();
    } catch (error) {
        console.error('Error incrementing water intake:', error);
    }
}

// Function to handle editing the calorie goal inline
// Function to edit calorie goal
function editCalorieGoal() {
    const goalElement = document.getElementById('calorie-goal');
    const currentGoal = calorieGoal;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentGoal;

    input.onblur = async function() {
        const newGoal = parseFloat(input.value);
        if (!isNaN(newGoal) && newGoal >= 0) {
            calorieGoal = newGoal;
            await saveToIndexedDB('fitnessData', { key: 'calorieGoal', value: newGoal });
            updateCalorieGoal(newGoal);
            updateRemainingCalories();
        } else {
            alert('Please enter a valid calorie goal.');
        }
    };

    input.onkeydown = function(event) {
        if (event.key === 'Enter') {
            input.blur();
        }
    };

    goalElement.innerHTML = '';
    goalElement.appendChild(input);
    input.focus();
}

// Function to save the new calorie goal
async function saveCalorieGoal() {
    const inputElement = document.getElementById('calorie-goal-input');
    const newGoal = parseInt(inputElement.value);

    // Validate the new calorie goal
    if (isNaN(newGoal) || newGoal <= 0) {
        alert("Please enter a valid calorie goal.");
        return;
    }

    // Update the calorie goal variable
    calorieGoal = newGoal;

    try {
        // Save the new calorie goal to IndexedDB
        await saveToIndexedDB('fitnessData', { key: 'calorieGoal', value: calorieGoal });

        // Update the UI to reflect the new calorie goal
        updateCalorieGoal(calorieGoal);
        updateRemainingCalories();
    } catch (error) {
        console.error('Error saving new calorie goal:', error);
    }
}

// Function to update the displayed calorie goal
function updateCalorieGoal(goal) {
    // Update the UI element and remove the input field, reverting back to text
    document.getElementById('calorie-goal').innerText = goal;
}

// Function to close modals
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Function to handle incrementing exercise time as a transaction
async function incrementExerciseTime() {
    try {
        let exerciseIncrementData = await getFromIndexedDB('fitnessData', 'exerciseIncrement');
        let exerciseIncrement = (exerciseIncrementData && typeof exerciseIncrementData === 'object') ? exerciseIncrementData.value : 30;

        let today = new Date();
        let formattedDate = formatDateForStorage(today);

        // Fetch all transactions, sum up existing exercise time for the current date
        let transactions = await getAllTransactions();
        let exerciseData = transactions.filter(transaction => transaction.type === 'exercise' && transaction.date.startsWith(formattedDate));

        // Sum up current day's total exercise time and add the increment
        totalExercise = exerciseData.reduce((sum, transaction) => sum + (transaction.quantity || 0), 0);
        totalExercise += exerciseIncrement; // Increment exercise

        // Save updated exercise time for the current day
        await saveToIndexedDB('transactions', {
            date: today.toISOString(),
            type: 'exercise',
            quantity: exerciseIncrement  // Ensure quantity is saved
        });

        document.getElementById("total-exercise-time").innerText = `${totalExercise} mins`;
        updateTransactionList();
    } catch (error) {
        console.error('Error incrementing exercise time:', error);
    }
}

// Function to handle clicking a mood icon and save as a transaction
function handleMoodClick(mood, clickedIcon) {
    if (!clickedIcon) return;

    saveToIndexedDB('transactions', {
        type: 'mood',
        mood: mood,
        date: new Date().toISOString()
    }).then(() => {
        // Provide visual feedback
        document.querySelectorAll('.mood-icon').forEach(icon => icon.classList.remove('selected-mood'));
        clickedIcon.classList.add('selected-mood');
        document.querySelectorAll('.mood-icon').forEach(icon => icon.classList.add('disabled-mood'));

        setTimeout(() => {
            // Re-enable the icons after 2 seconds
            document.querySelectorAll('.mood-icon').forEach(icon => {
                icon.classList.remove('disabled-mood');
                icon.classList.remove('selected-mood');
            });
        }, 2000);
        
        updateTransactionList();
    }).catch(error => {
        console.error('Error saving mood transaction:', error);
    });
}

// Attach event listeners to mood icons only once
function attachMoodEventListeners() {
    document.querySelectorAll('.mood-icon').forEach(icon => {
        icon.removeEventListener('click', handleMoodIconClick);
        icon.addEventListener('click', handleMoodIconClick);
    });
}

// Update event handler to pass the clicked icon as an argument
function handleMoodIconClick() {
    const mood = this.getAttribute('alt'); 
    handleMoodClick(mood, this);
}

// Function to update totals based on the transaction type (water, exercise, calories, etc.)
function updateTotals(transactionType, amount) {
    if (transactionType === 'water') {
        totalWater += amount;
        document.getElementById("total-water-intake").innerText = `${totalWater} ml`;
    } else if (transactionType === 'exercise') {
        totalExercise += amount;
        document.getElementById("total-exercise-time").innerText = `${totalExercise} mins`;
    } else if (transactionType === 'calories') {
        totalCalories += amount;
        updateTotalCalories(totalCalories);
        updateRemainingCalories();
    }
}

// Utility function to calculate mood percentages for the past `monthsBack` months
async function calculateMoodPercentagesForPastMonths(monthsBack) {
    const transactions = await getAllTransactionsByType('mood');

    const currentDate = new Date();
    const startDate = new Date();
    startDate.setMonth(currentDate.getMonth() - monthsBack);

    const moodCounts = {
        happy: 0,
        neutral: 0,
        sad: 0
    };

    transactions.forEach(entry => {
        const entryDate = new Date(entry.date);
        if (entryDate >= startDate && entryDate <= currentDate) {
            if (entry.mood === 'Happy') moodCounts.happy++;
            if (entry.mood === 'Neutral') moodCounts.neutral++;
            if (entry.mood === 'Sad') moodCounts.sad++;
        }
    });

    const totalMoods = moodCounts.happy + moodCounts.neutral + moodCounts.sad;
    const totalSlots = 5 * monthsBack; // Adjust for the number of months

    return {
        happyPercentage: (moodCounts.happy / totalSlots) * 100,
        neutralPercentage: (moodCounts.neutral / totalSlots) * 100,
        sadPercentage: (moodCounts.sad / totalSlots) * 100,
        unreportedPercentage: ((totalSlots - totalMoods) / totalSlots) * 100
    };
}

async function calculateTotalForPastMonths(type, monthsBack) {
    const currentDate = new Date();
    
    // Calculate the date 'monthsBack' months ago
    const startDate = new Date();
    startDate.setMonth(currentDate.getMonth() - monthsBack);
    
    // Fetch all transactions by type (calories, water, exercise, mood)
    let transactions = await getAllTransactionsByType(type);

    return transactions.reduce((sum, entry) => {
        const entryDate = new Date(entry.date);

        // Check if the transaction date is between 'startDate' and 'currentDate'
        if (entryDate >= startDate && entryDate <= currentDate) {
            return sum + (entry.quantity || 0); // Sum the quantity for valid entries
        }
        return sum;
    }, 0); // Initialize sum to 0
}

// Function to retrieve all transactions by type and sum the quantities
async function calculateTotalForCurrentMonth(type) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    let transactions = await getAllTransactionsByType(type);
    
    if (type === 'mood') {
        // For mood, just count the occurrences, since no quantity is involved
        return transactions.filter(entry => {
            const entryDate = new Date(entry.date);
            const entryMonth = entryDate.getMonth() + 1;
            const entryYear = entryDate.getFullYear();
            return entryMonth === currentMonth && entryYear === currentYear;
        }).length;
    }

    return transactions.reduce((sum, entry) => {
        const entryDate = new Date(entry.date);
        const entryMonth = entryDate.getMonth() + 1;
        const entryYear = entryDate.getFullYear();

        if (entryMonth === currentMonth && entryYear === currentYear) {
            return sum + (entry.quantity || 0);
        }
        return sum;
    }, 0);  // Ensure fallback to 0 for quantity
}

// Function to calculate totals for the past 3 months
async function calculateTotalForPast3Months(type) {
    return calculateTotalForPastMonths(type, 3);
}

// Function to calculate totals for the year-to-date (past 12 months)
async function calculateTotalForYTD(type) {
    return calculateTotalForPastMonths(type, 12);
}

// Function to update total water after deletion or edits
// Function to update total water after deletion or edits
async function updateTotalWater() {
    try {
        let waterData = await getAllTransactionsByType('water');
        totalWater = waterData.length > 0 ? waterData.reduce((sum, entry) => sum + (entry.quantity || 0), 0) : 0;
        document.getElementById("total-water-intake").innerText = `${totalWater} ml`;
    } catch (error) {
        console.error('Error updating total water:', error);
    }
}

// Function to update total exercise after deletion or edits
async function updateTotalExercise() {
    try {
        let exerciseData = await getAllTransactionsByType('exercise');
        totalExercise = exerciseData.length > 0 ? exerciseData.reduce((sum, entry) => sum + (entry.quantity || 0), 0) : 0;
        document.getElementById("total-exercise-time").innerText = `${totalExercise} mins`;
    } catch (error) {
        console.error('Error updating total exercise:', error);
    }
}

// Ensure all database operations wait for db initialization
function getAllTransactionsByType(type) {
    return new Promise(async (resolve, reject) => {
        await ensureDbInitialized();  // Ensure db is initialized before making the transaction

        const transaction = db.transaction(['transactions'], 'readonly');
        const store = transaction.objectStore('transactions');
        const index = store.index('type');
        const request = index.getAll(type);

        request.onsuccess = function() {
            resolve(request.result || []);  // Ensure result is returned even if empty
        };
        request.onerror = function() {
            reject(`Error retrieving ${type} transactions from IndexedDB`);
        };
    });
}

// Ensure db is initialized before fetching all transactions
function getAllTransactions() {
    return new Promise(async (resolve, reject) => {
        await ensureDbInitialized();  // Ensure db is initialized before making the transaction

        if (!db.objectStoreNames.contains('transactions')) {
            reject('Object store "transactions" not found');
            return;
        }

        const transaction = db.transaction(['transactions'], 'readonly');
        const store = transaction.objectStore('transactions');
        const request = store.getAll();

        request.onsuccess = function() {
            resolve(request.result || []);  // Ensure result is returned even if empty
        };
        request.onerror = function() {
            reject('Error retrieving transactions from IndexedDB');
        };
    });
}

// Function to retrieve all transactions from IndexedDB
function updateTransactionList() {
    getAllTransactions().then(transactions => {
        const transactionList = document.getElementById('transaction-list');
        transactionList.innerHTML = ''; // Clear the list first

        transactions.forEach(transaction => {
            const listItem = document.createElement('div');
            listItem.classList.add('transaction-item');

            // Create a checkbox element
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.classList.add('transaction-checkbox');
            checkbox.setAttribute('data-id', transaction.id);

            // Format the date as MM/DD/YYYY (without time)
            const formattedDate = new Date(transaction.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            // Format the display string based on the transaction type
            let displayValue;
            if (transaction.type === 'mood') {
                displayValue = `Mood: ${transaction.mood}`;
            } else {
                displayValue = `${transaction.type}: ${transaction.quantity || 0}`;
            }

            // Append the checkbox and formatted transaction details
            listItem.appendChild(checkbox);
            listItem.appendChild(document.createTextNode(`${formattedDate} - ${displayValue}`));

            transactionList.appendChild(listItem);
        });
    });
}

// Function to delete selected transactions and update the totals
async function deleteSelectedTransactions() {
    let checkboxes = document.querySelectorAll('.transaction-checkbox:checked');
    if (checkboxes.length === 0) {
        alert("Please select transactions to delete.");
        return;
    }

    let transactionsData = await getAllTransactions();
    let idsToDelete = Array.from(checkboxes).map(checkbox => parseInt(checkbox.getAttribute('data-id')));
    
    transactionsData = transactionsData.filter(transaction => !idsToDelete.includes(transaction.id));

    // Clear and add remaining transactions back to the database
    const dbTransaction = db.transaction(['transactions'], 'readwrite');
    const store = dbTransaction.objectStore('transactions');
    const clearRequest = store.clear();

    clearRequest.onsuccess = async function() {
        const addTransaction = db.transaction(['transactions'], 'readwrite');
        const addStore = addTransaction.objectStore('transactions');
        transactionsData.forEach(transaction => {
            addStore.add(transaction);
        });

        // Recalculate totals using the utility function
        totalCalories = await getAllTransactionsByType('calories');
        totalWater = await getAllTransactionsByType('water');
        totalExercise = await getAllTransactionsByType('exercise');

        // Update the UI after deletion
        updateTransactionList();
        updateTotalCalories();
        updateRemainingCalories();
        updateTotalWater();    // Update water after deletion
        updateTotalExercise(); // Correctly update total exercise

        document.getElementById("total-water-intake").innerText = `${totalWater} ml`;
        document.getElementById("total-exercise-time").innerText = `${totalExercise} mins`;
    };

    clearRequest.onerror = function() {
        console.error("Error clearing transactions.");
    };
}

function openTransactions() {
    document.getElementById('transactions-modal').style.display = 'block';
    updateTransactionList();
}

// Function to close modals
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Open settings modal and load previous increments from IndexedDB or use defaults
async function openSettings() {
    document.getElementById('settings-modal').style.display = 'block';

    // Fetch water and exercise increment values from IndexedDB
    let waterIncrementData = await getFromIndexedDB('fitnessData', 'waterIncrement');
    let exerciseIncrementData = await getFromIndexedDB('fitnessData', 'exerciseIncrement');

    // Set the input fields in the settings modal with the retrieved or default values
    let waterIncrement = (waterIncrementData && 'value' in waterIncrementData) ? waterIncrementData.value : 256;
    let exerciseIncrement = (exerciseIncrementData && 'value' in exerciseIncrementData) ? exerciseIncrementData.value : 30;
    
    document.getElementById('water-increment-input').value = waterIncrement;
    document.getElementById('exercise-increment-input').value = exerciseIncrement;
}

// Save settings for water and exercise increments
async function saveSettings() {
    const waterGoal = parseInt(document.getElementById('water-goal-input').value);
    const exerciseGoal = parseInt(document.getElementById('exercise-goal-input').value);
    const waterIncrement = parseFloat(document.getElementById('water-increment-input').value);
    const exerciseIncrement = parseInt(document.getElementById('exercise-increment-input').value);

    if (isNaN(waterGoal) || waterGoal <= 0) {
        alert("Please enter a valid water goal.");
        return;
    }

    if (isNaN(exerciseGoal) || exerciseGoal <= 0) {
        alert("Please enter a valid exercise goal.");
        return;
    }

    if (isNaN(waterIncrement) || waterIncrement <= 0) {
        alert("Please enter a valid water increment value.");
        return;
    }

    if (isNaN(exerciseIncrement) || exerciseIncrement <= 0) {
        alert("Please enter a valid exercise increment value.");
        return;
    }

    // Save water and exercise goals to IndexedDB
    await saveToIndexedDB('fitnessData', { key: 'waterGoal', value: waterGoal });
    await saveToIndexedDB('fitnessData', { key: 'exerciseGoal', value: exerciseGoal });
    await saveToIndexedDB('fitnessData', { key: 'waterIncrement', value: waterIncrement });
    await saveToIndexedDB('fitnessData', { key: 'exerciseIncrement', value: exerciseIncrement });

    // Close the settings modal
    closeModal('settings-modal');
}

// Show the graph modal
// Show the graph modal
async function openGraph() {
    document.getElementById('graph-modal').style.display = 'block';
    
    // Ensure all graph rendering functions are called
    await displayBarGraphCurrentMonth(); // Current Month Graph
    await displayBarGraphPast3Months();  // Past 3 Months Graph
    await displayBarGraphYTD();          // Year to Date Graph
}

function closeGraph() {
    document.getElementById('graph-modal').style.display = 'none';
}

// Initial call to display all transactions on page load
document.addEventListener('DOMContentLoaded', updateTransactionList);

// Function to handle double-click on a transaction (edit/delete)
function handleTransactionDoubleClick(id) {
    // Fetch the transaction details from IndexedDB
    const transaction = db.transaction(['transactions'], 'readonly');
    const store = transaction.objectStore('transactions');
    const request = store.get(id);

    request.onsuccess = function(event) {
        const data = event.target.result;
        if (data) {
            // Prompt the user to edit or delete
            const action = confirm('Do you want to edit this transaction? Click OK to edit, Cancel to delete.');
            
            if (action) {
                // Populate the form with transaction details for editing
                document.getElementById('transaction-type').value = data.type;
                document.getElementById('transaction-description').value = data.description;
                document.getElementById('transaction-calories').value = data.calories;

                // When the form is resubmitted, it will update the existing transaction
                document.getElementById('transaction-form').onsubmit = function(event) {
                    event.preventDefault();

                    const updatedData = {
                        id: data.id,
                        type: document.getElementById('transaction-type').value,
                        description: document.getElementById('transaction-description').value,
                        calories: parseInt(document.getElementById('transaction-calories').value),
                        date: data.date
                    };

                    // Update the transaction in IndexedDB
                    editTransaction(updatedData);

                    // Clear the form and refresh the transaction list
                    document.getElementById('transaction-form').reset();
                    updateTransactionList();
                };

            } else {
                // Delete the transaction
                deleteTransaction(id);
                updateTransactionList();
            }
        }
    };
}

// Edit an existing transaction in IndexedDB
function editTransaction(data) {
    const transaction = db.transaction(['transactions'], 'readwrite');
    const store = transaction.objectStore('transactions');
    store.put(data); // Replace the existing transaction with the updated one
}

function clearFitnessDB() {
    const request = indexedDB.open('fitnessTrackerDB', 1);

    request.onsuccess = function(event) {
        const db = event.target.result;

        // Convert db.objectStoreNames (DOMStringList) to an array
        const objectStoreNames = Array.from(db.objectStoreNames);

        const transaction = db.transaction(objectStoreNames, 'readwrite'); // Open transaction with all existing stores

        // Loop through all object stores and clear them if they exist
        objectStoreNames.forEach(storeName => {
            const objectStore = transaction.objectStore(storeName);
            objectStore.clear();
        });

        transaction.oncomplete = function() {
            console.log('All existing object stores cleared successfully.');
            alert('Fitness tracker database cleared successfully.');
        };

        transaction.onerror = function() {
            console.error('Error clearing the object stores:', transaction.error);
        };
    };

    request.onerror = function(event) {
        console.error('Error opening IndexedDB:', event.target.errorCode);
    };
}

let currentMonthChart = null;
let past3MonthsChart = null;
let ytdChart = null;

// Function to calculate mood percentages for the current day
async function calculateMoodPercentagesForCurrentDay() {
    const today = formatDateForStorage(new Date());
    const transactions = await getAllTransactionsByType('mood');
    
    const moodsForToday = transactions.filter(entry => entry.date.startsWith(today));
    
    // Count occurrences of each mood
    const moodCounts = {
        happy: 0,
        neutral: 0,
        sad: 0
    };
    
    moodsForToday.forEach(entry => {
        if (entry.mood === 'Happy') moodCounts.happy++;
        if (entry.mood === 'Neutral') moodCounts.neutral++;
        if (entry.mood === 'Sad') moodCounts.sad++;
    });

    const totalMoods = moodCounts.happy + moodCounts.neutral + moodCounts.sad;
    const totalSlots = 5; // Adjust this value if needed

    // Calculate percentages
    const happyPercentage = (moodCounts.happy / totalSlots) * 100;
    const neutralPercentage = (moodCounts.neutral / totalSlots) * 100;
    const sadPercentage = (moodCounts.sad / totalSlots) * 100;
    const unreportedPercentage = ((totalSlots - totalMoods) / totalSlots) * 100;

    // Return mood percentages
    return { happyPercentage, neutralPercentage, sadPercentage, unreportedPercentage };
}

// Function to create a bar chart for the current month
async function displayBarGraphCurrentMonth() {
    const ctx = document.getElementById('current-month-chart').getContext('2d');

    if (currentMonthChart) {
        currentMonthChart.destroy();
    }

    // Get values from IndexedDB for current month's data
    let totalCalories = await calculateTotalForCurrentMonth('calories');
    let totalWater = await calculateTotalForCurrentMonth('water');
    let totalExercise = await calculateTotalForCurrentMonth('exercise');
    let moodCounts = await calculateMoodPercentagesForCurrentDay(); // Fetch mood percentages

    // Get user's goals for comparison
    let waterGoalData = await getFromIndexedDB('fitnessData', 'waterGoal');
    let exerciseGoalData = await getFromIndexedDB('fitnessData', 'exerciseGoal');
    let calorieGoalData = await getFromIndexedDB('fitnessData', 'calorieGoal');
    
    let waterGoal = waterGoalData?.value || 2000; // Default water goal if not set
    let exerciseGoal = exerciseGoalData?.value || 30; // Default exercise goal if not set
    let calorieGoal = calorieGoalData?.value || 1500; // Default calorie goal if not set

    // Calculate percentages
    let caloriesPercentage = (totalCalories / calorieGoal) * 100;
    let waterPercentage = (totalWater / waterGoal) * 100;
    let exercisePercentage = (totalExercise / exerciseGoal) * 100;

    // Prepare the data for the bar chart
    const data = {
        labels: ['Calories', 'Water', 'Exercise', 'Happy', 'Neutral', 'Sad'],
        datasets: [
            {
                label: 'Progress towards goal (%)',
                data: [
                    caloriesPercentage > 100 ? 100 : caloriesPercentage, // Cap at 100%
                    waterPercentage > 100 ? 100 : waterPercentage, // Cap at 100%
                    exercisePercentage > 100 ? 100 : exercisePercentage, // Cap at 100%
                    moodCounts.happyPercentage,
                    moodCounts.neutralPercentage,
                    moodCounts.sadPercentage
                ],
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#FF9F40', '#9966FF']
            }
        ]
    };

    // Create and store the chart instance
    currentMonthChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

// Function to create a bar chart for the past 3 months
async function displayBarGraphPast3Months() {
    const ctx = document.getElementById('past-3-months-chart').getContext('2d');

    if (past3MonthsChart) {
        past3MonthsChart.destroy();
    }

    // Calculate totals for the past 3 months
    let totalCalories = await calculateTotalForPast3Months('calories');
    let totalWater = await calculateTotalForPast3Months('water');
    let totalExercise = await calculateTotalForPast3Months('exercise');
    let moodCounts = await calculateMoodPercentagesForPastMonths(3); // Fetch mood percentages for past 3 months

    // Get user's goals for comparison
    let waterGoalData = await getFromIndexedDB('fitnessData', 'waterGoal');
    let exerciseGoalData = await getFromIndexedDB('fitnessData', 'exerciseGoal');
    let calorieGoalData = await getFromIndexedDB('fitnessData', 'calorieGoal');

    let waterGoal = waterGoalData?.value || 2000;
    let exerciseGoal = exerciseGoalData?.value || 30;
    let calorieGoal = calorieGoalData?.value || 1500;

    // Calculate percentages
    let caloriesPercentage = (totalCalories / (calorieGoal * 3)) * 100;  // Goal for 3 months
    let waterPercentage = (totalWater / (waterGoal * 3)) * 100;  // Goal for 3 months
    let exercisePercentage = (totalExercise / (exerciseGoal * 3)) * 100;  // Goal for 3 months

    // Prepare the data for the bar chart
    const data = {
        labels: ['Calories', 'Water', 'Exercise', 'Happy', 'Neutral', 'Sad'],
        datasets: [
            {
                label: 'Progress towards goal (%) - Last 3 Months',
                data: [
                    caloriesPercentage,  // No need to cap at 100%
                    waterPercentage,
                    exercisePercentage,
                    moodCounts.happyPercentage,
                    moodCounts.neutralPercentage,
                    moodCounts.sadPercentage
                ],
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#FF9F40', '#9966FF']
            }
        ]
    };

    past3MonthsChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

// Function to create a bar chart for the year-to-date (YTD)
async function displayBarGraphYTD() {
    const ctx = document.getElementById('ytd-chart').getContext('2d');

    if (ytdChart) {
        ytdChart.destroy();
    }

    // Calculate totals for the year-to-date (past 12 months)
    let totalCalories = await calculateTotalForYTD('calories');
    let totalWater = await calculateTotalForYTD('water');
    let totalExercise = await calculateTotalForYTD('exercise');
    let moodCounts = await calculateMoodPercentagesForPastMonths(12); // Fetch mood percentages for YTD

    // Get user's goals for comparison (same as current month)
    let waterGoalData = await getFromIndexedDB('fitnessData', 'waterGoal');
    let exerciseGoalData = await getFromIndexedDB('fitnessData', 'exerciseGoal');
    let calorieGoalData = await getFromIndexedDB('fitnessData', 'calorieGoal');

    let waterGoal = waterGoalData?.value || 2000;
    let exerciseGoal = exerciseGoalData?.value || 30;
    let calorieGoal = calorieGoalData?.value || 1500;

    // Calculate percentages
    let caloriesPercentage = (totalCalories / (calorieGoal * 12)) * 100;  // Goal for 12 months
    let waterPercentage = (totalWater / (waterGoal * 12)) * 100;  // Goal for 12 months
    let exercisePercentage = (totalExercise / (exerciseGoal * 12)) * 100;  // Goal for 12 months

    // Prepare the data for the bar chart
    const data = {
        labels: ['Calories', 'Water', 'Exercise', 'Happy', 'Neutral', 'Sad'],
        datasets: [
            {
                label: 'Progress towards goal (%) - Year to Date',
                data: [
                    caloriesPercentage,  // No need to cap at 100%
                    waterPercentage,
                    exercisePercentage,
                    moodCounts.happyPercentage,
                    moodCounts.neutralPercentage,
                    moodCounts.sadPercentage
                ],
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#FF9F40', '#9966FF']
            }
        ]
    };

    ytdChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

