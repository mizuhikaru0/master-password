// js/db.js - Modul untuk operasi IndexedDB

const DB_NAME = 'SecurePasswordManager';
const DB_VERSION = 1;
const STORE_NAME = 'accounts';

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Gunakan keyPath 'id' untuk setiap record
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('website', 'website', { unique: false });
      }
    };

    request.onsuccess = function(event) {
      resolve(event.target.result);
    };

    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

export function saveAccount(db, encryptedData) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add({ data: encryptedData });
    request.onsuccess = function(event) {
      // event.target.result adalah id yang dihasilkan
      resolve(event.target.result);
    };
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

export function getAccounts(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = function(event) {
      resolve(event.target.result);
    };
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

export function updateAccount(db, id, encryptedData) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    // Pastikan id dikirim sebagai angka
    const request = store.put({ id: Number(id), data: encryptedData });
    request.onsuccess = function() {
      resolve();
    };
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

export function deleteAccount(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    // Pastikan id adalah angka
    const request = store.delete(Number(id));
    request.onsuccess = function() {
      resolve();
    };
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}
