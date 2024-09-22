
// Initialize IndexedDB for fitness transactions
let db;
const request = indexedDB.open('fitnessTrackerDB', 1);

// Upgrade database with transaction store if it doesn't exist
request.onupgradeneeded = function(event) {
    db = event.target.result;

    if (!db.objectStoreNames.contains('transactions')) {
        db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
    }
};

// Open database
request.onsuccess = function(event) {
    db = event.target.result;
};

// Handle errors
request.onerror = function(event) {
    console.error('IndexedDB error:', event.target.errorCode);
};

// Add a transaction (e.g., workout session, meal)
function addTransaction(data) {
    const transaction = db.transaction(['transactions'], 'readwrite');
    const store = transaction.objectStore('transactions');
    store.add(data);
}

// Delete a transaction by ID
function deleteTransaction(id) {
    const transaction = db.transaction(['transactions'], 'readwrite');
    const store = transaction.objectStore('transactions');
    store.delete(id);
}

// Get all transactions
function getAllTransactions() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['transactions'], 'readonly');
        const store = transaction.objectStore('transactions');
        const request = store.getAll();

        request.onsuccess = function() {
            resolve(request.result);
        };

        request.onerror = function(event) {
            reject('Error fetching transactions:', event.target.errorCode);
        };
    });
}
