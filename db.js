// db.js - IndexedDB wrapper for Abogados Penal
const DB_NAME = 'AbogadosPenalDB';
const DB_VERSION = 1;

let dbInstance = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('cases')) {
        const caseStore = db.createObjectStore('cases', { keyPath: 'id', autoIncrement: true });
        caseStore.createIndex('clientId', 'clientId', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('payments')) {
        const paymentStore = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
        paymentStore.createIndex('clientId', 'clientId', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('receipts')) {
        const receiptStore = db.createObjectStore('receipts', { keyPath: 'id', autoIncrement: true });
        receiptStore.createIndex('paymentId', 'paymentId', { unique: false });
      }
      
      if (!db.objectStoreNames.contains('reminders')) {
        const reminderStore = db.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
        reminderStore.createIndex('fecha', 'fecha', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject('Error al abrir la base de datos: ' + event.target.error);
    };
  });
}

function getStore(storeName, mode = 'readonly') {
  return initDB().then((db) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return { store, transaction };
  });
}

const DB = {
  getAll(storeName) {
    return new Promise((resolve, reject) => {
      getStore(storeName).then(({ store }) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(reject);
    });
  },

  getById(storeName, id) {
    return new Promise((resolve, reject) => {
      getStore(storeName).then(({ store }) => {
        const request = store.get(Number(id));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(reject);
    });
  },

  add(storeName, item) {
    return new Promise((resolve, reject) => {
      getStore(storeName, 'readwrite').then(({ store }) => {
        const request = store.add(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(reject);
    });
  },

  update(storeName, item) {
    return new Promise((resolve, reject) => {
      getStore(storeName, 'readwrite').then(({ store }) => {
        const request = store.put(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(reject);
    });
  },

  delete(storeName, id) {
    return new Promise((resolve, reject) => {
      getStore(storeName, 'readwrite').then(({ store }) => {
        const request = store.delete(Number(id));
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      }).catch(reject);
    });
  },

  getByIndex(storeName, indexName, queryValue) {
    return new Promise((resolve, reject) => {
      getStore(storeName).then(({ store }) => {
        const index = store.index(indexName);
        const request = index.getAll(queryValue);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(reject);
    });
  },

  exportBackup() {
    const readStore = (storeName) => {
      return new Promise((resolve) => {
        getStore(storeName).then(({ store }) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve([]);
        }).catch(() => resolve([]));
      });
    };

    const readReceipts = () => {
      return new Promise((resolve) => {
        getStore('receipts').then(({ store }) => {
          const request = store.getAll();
          request.onsuccess = async () => {
            const list = request.result;
            const formatted = [];
            for (const item of list) {
              if (item.file instanceof Blob) {
                const base64 = await blobToBase64(item.file);
                formatted.push({
                  ...item,
                  file: base64
                });
              } else {
                formatted.push(item);
              }
            }
            resolve(formatted);
          };
          request.onerror = () => resolve([]);
        }).catch(() => resolve([]));
      });
    };

    return Promise.all([
      readStore('clients'),
      readStore('cases'),
      readStore('payments'),
      readStore('reminders'),
      readReceipts()
    ]).then(([clients, cases, payments, reminders, receipts]) => {
      return {
        clients,
        cases,
        payments,
        reminders,
        receipts,
        version: DB_VERSION,
        exportedAt: new Date().toISOString()
      };
    });
  },

  importBackup(backupData) {
    return new Promise(async (resolve, reject) => {
      try {
        const stores = ['clients', 'cases', 'payments', 'reminders', 'receipts'];
        
        for (const storeName of stores) {
          await new Promise((res, rej) => {
            getStore(storeName, 'readwrite').then(({ store }) => {
              const req = store.clear();
              req.onsuccess = () => res();
              req.onerror = () => rej(req.error);
            }).catch(rej);
          });
        }

        const restoreStore = (storeName, items) => {
          if (!items || !items.length) return Promise.resolve();
          return new Promise((res, rej) => {
            getStore(storeName, 'readwrite').then(({ store }) => {
              let count = 0;
              items.forEach((item) => {
                const req = store.add(item);
                req.onsuccess = () => {
                  count++;
                  if (count === items.length) res();
                };
                req.onerror = (e) => {
                  console.error(`Error importing to ${storeName}:`, e);
                  count++;
                  if (count === items.length) res();
                };
              });
            }).catch(rej);
          });
        };

        const receiptsToRestore = [];
        if (backupData.receipts) {
          for (const item of backupData.receipts) {
            if (typeof item.file === 'string' && item.file.startsWith('data:')) {
              const blob = base64ToBlob(item.file);
              receiptsToRestore.push({
                ...item,
                file: blob
              });
            } else {
              receiptsToRestore.push(item);
            }
          }
        }

        await restoreStore('clients', backupData.clients);
        await restoreStore('cases', backupData.cases);
        await restoreStore('payments', backupData.payments);
        await restoreStore('reminders', backupData.reminders);
        await restoreStore('receipts', receiptsToRestore);

        resolve(true);
      } catch (err) {
        reject(err);
      }
    });
  }
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64DataUrl) {
  const parts = base64DataUrl.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
}
