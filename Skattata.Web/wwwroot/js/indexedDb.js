// IndexedDB wrapper for Skattata voucher storage
const DB_NAME = 'SkattataDB';
const DB_VERSION = 1;
const STORE_NAME = 'vouchers';

let db = null;

// Initialize the database
function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = db.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });

                objectStore.createIndex('series', 'series', { unique: false });
                objectStore.createIndex('date', 'date', { unique: false });
            }
        };
    });
}

// Add a voucher
window.addVoucher = async function(voucher) {
    try {
        await initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);

            // Remove id field if it's null or undefined to allow autoIncrement
            const voucherToAdd = { ...voucher };
            if (voucherToAdd.id === null || voucherToAdd.id === undefined) {
                delete voucherToAdd.id;
            }

            const request = objectStore.add(voucherToAdd);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error adding voucher:', error);
        throw error;
    }
};

// Get all vouchers
window.getAllVouchers = async function() {
    try {
        await initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const objectStore = transaction.objectStore(STORE_NAME);

            const request = objectStore.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error getting vouchers:', error);
        throw error;
    }
};

// Delete a voucher by ID
window.deleteVoucher = async function(id) {
    try {
        await initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);

            const request = objectStore.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error deleting voucher:', error);
        throw error;
    }
};

// Clear all vouchers
window.clearAllVouchers = async function() {
    try {
        await initDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const objectStore = transaction.objectStore(STORE_NAME);

            const request = objectStore.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error clearing vouchers:', error);
        throw error;
    }
};

// Initialize on load
initDB().catch(console.error);
