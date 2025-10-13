// IndexedDB wrapper for Skattata voucher storage
const DB_NAME = 'SkattataDB';
const DB_VERSION = 2; // Incremented for PDF support
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

            // Create or upgrade the object store
            let objectStore;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                objectStore = db.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });

                objectStore.createIndex('series', 'series', { unique: false });
                objectStore.createIndex('date', 'date', { unique: false });
            } else {
                // Store already exists, get it from the transaction
                objectStore = event.target.transaction.objectStore(STORE_NAME);
            }

            // Add filename index if it doesn't exist (for version 2)
            if (!objectStore.indexNames.contains('hasAttachment')) {
                objectStore.createIndex('hasAttachment', 'pdfFileName', { unique: false });
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

// Helper function to read file as Base64
window.readFileAsBase64 = async function(fileInputId) {
    console.log('[readFileAsBase64] Starting file read for input:', fileInputId);

    return new Promise((resolve, reject) => {
        const fileInput = document.getElementById(fileInputId);
        if (!fileInput) {
            console.error('[readFileAsBase64] File input element not found:', fileInputId);
            reject(new Error('File input element not found'));
            return;
        }

        const file = fileInput.files[0];
        if (!file) {
            console.error('[readFileAsBase64] No file selected');
            reject(new Error('No file selected'));
            return;
        }

        console.log('[readFileAsBase64] File selected:', file.name, 'Size:', file.size, 'Type:', file.type);

        const reader = new FileReader();

        reader.onloadstart = () => {
            console.log('[readFileAsBase64] FileReader started loading...');
        };

        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                console.log('[readFileAsBase64] Progress:', percentComplete.toFixed(1), '%');
            }
        };

        reader.onload = () => {
            console.log('[readFileAsBase64] FileReader load complete');
            // Extract base64 data (remove data URL prefix)
            const base64 = reader.result.split(',')[1];
            console.log('[readFileAsBase64] Base64 data length:', base64.length);

            const result = {
                fileName: file.name,
                contentType: file.type,
                base64Data: base64,
                size: file.size
            };

            console.log('[readFileAsBase64] Resolving promise with result');
            resolve(result);
        };

        reader.onerror = () => {
            console.error('[readFileAsBase64] FileReader error:', reader.error);
            reject(reader.error);
        };

        console.log('[readFileAsBase64] Starting readAsDataURL...');
        reader.readAsDataURL(file);
    });
};

// Helper function to create a downloadable blob URL
window.createBlobUrl = function(base64Data, contentType) {
    try {
        // Convert base64 to blob
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: contentType });

        // Create object URL
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error('Error creating blob URL:', error);
        throw error;
    }
};

// Helper function to trigger file download
window.downloadPdf = function(base64Data, fileName, contentType) {
    try {
        const url = window.createBlobUrl(base64Data, contentType);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading PDF:', error);
        throw error;
    }
};

// Initialize on load
initDB().catch(console.error);
