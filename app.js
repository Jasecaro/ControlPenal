// app.js - Main Application Logic for Control Abogados Penal

// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Firebase Configuration (Reemplaza con tus propias credenciales de Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyB0yK2H-jCcpv-qZ_g2MJK0lL_cPwjcoG8",
  authDomain: "control-penal.firebaseapp.com",
  projectId: "control-penal",
  storageBucket: "control-penal.firebasestorage.app",
  messagingSenderId: "143567007010",
  appId: "1:143567007010:web:6bb844f6d866f6f4d4c97b"
};

// Initialize Firebase Variables
let firebaseApp, auth, dbFirestore, storage;
let currentUser = null;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "TU_API_KEY") {
    firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    dbFirestore = getFirestore(firebaseApp);
    storage = getStorage(firebaseApp);
  } else {
    console.warn("Firebase no ha sido configurado aún. Edita firebaseConfig en app.js.");
  }
} catch (error) {
  console.error("Error al inicializar Firebase:", error);
}

// State Management
const State = {
  currentView: 'dashboard',
  currentDate: new Date(), // For Calendar view
  activeClients: [],
  activeCases: [],
  activePayments: [],
  activeReminders: [],
  
  // Temp state for upload
  selectedUploadInstallment: null, // { paymentId, installmentIndex }
  selectedUploadFile: null, // File object
  
  // Google Drive Integration State
  googleDrive: {
    clientId: localStorage.getItem('drive_client_id') || '665270322245-qt1r4k5218b5hgh9hoevflddt1d9fdmo.apps.googleusercontent.com',
    rootFolderId: localStorage.getItem('drive_root_folder_id') || '1gFe8RTheSVXaAmLHQ17bxPcx8tMq5rTu',
    webAppUrl: localStorage.getItem('drive_web_app_url') || '',
    accessToken: localStorage.getItem('drive_access_token') || null,
    tokenExpiry: Number(localStorage.getItem('drive_token_expiry')) || null,
    tokenClient: null,
  },
  currentFilesCaseId: null, // Track which case is open in the files modal
};

// Redefine window.DB to use Firestore when authenticated
const LocalDB = window.DB;
let DB = LocalDB;
let authInitialized = false;

const FirestoreDB = {
  async getAll(storeName) {
    if (!currentUser) return [];
    const snap = await getDocs(collection(dbFirestore, "users", currentUser.uid, storeName));
    return snap.docs.map(doc => ({ id: isNaN(doc.id) ? doc.id : Number(doc.id), ...doc.data() }));
  },

  async getById(storeName, id) {
    if (!currentUser) return null;
    const docRef = doc(dbFirestore, "users", currentUser.uid, storeName, String(id));
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: isNaN(docSnap.id) ? docSnap.id : Number(docSnap.id), ...docSnap.data() };
    }
    return null;
  },

  async add(storeName, item) {
    if (!currentUser) throw new Error("No hay usuario autenticado.");
    const uid = currentUser.uid;
    if (!item.id) {
      item.id = Date.now();
    }
    const idStr = String(item.id);

    if (storeName === 'receipts' && item.file instanceof Blob) {
      const storageRef = ref(storage, `users/${uid}/receipts/${item.paymentId}_${item.cuotaNumero}_${item.fileName}`);
      const uploadSnap = await uploadBytes(storageRef, item.file);
      const downloadUrl = await getDownloadURL(uploadSnap.ref);
      item.file = downloadUrl;
    }

    const docRef = doc(dbFirestore, "users", uid, storeName, idStr);
    await setDoc(docRef, item);
    return item.id;
  },

  async update(storeName, item) {
    if (!currentUser) throw new Error("No hay usuario autenticado.");
    const uid = currentUser.uid;
    const idStr = String(item.id);

    if (storeName === 'receipts' && item.file instanceof Blob) {
      const storageRef = ref(storage, `users/${uid}/receipts/${item.paymentId}_${item.cuotaNumero}_${item.fileName}`);
      const uploadSnap = await uploadBytes(storageRef, item.file);
      const downloadUrl = await getDownloadURL(uploadSnap.ref);
      item.file = downloadUrl;
    }

    const docRef = doc(dbFirestore, "users", uid, storeName, idStr);
    await setDoc(docRef, item, { merge: true });
    return item.id;
  },

  async delete(storeName, id) {
    if (!currentUser) return false;
    const uid = currentUser.uid;
    const idStr = String(id);

    if (storeName === 'receipts') {
      try {
        const receipt = await this.getById(storeName, id);
        if (receipt && typeof receipt.file === 'string' && receipt.file.startsWith('http')) {
          const decodedUrl = decodeURIComponent(receipt.file);
          const matches = decodedUrl.match(/o\/(users\/.*?)\?/);
          if (matches && matches[1]) {
            const fileRef = ref(storage, matches[1]);
            await deleteObject(fileRef);
          }
        }
      } catch (err) {
          console.error("Error al eliminar archivo de Storage:", err);
      }
    }

    const docRef = doc(dbFirestore, "users", uid, storeName, idStr);
    await deleteDoc(docRef);
    return true;
  },

  async getByIndex(storeName, indexName, queryValue) {
    if (!currentUser) return [];
    const uid = currentUser.uid;
    const q = query(collection(dbFirestore, "users", uid, storeName), where(indexName, "==", queryValue));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: isNaN(doc.id) ? doc.id : Number(doc.id), ...doc.data() }));
  },

  async exportBackup() {
    const backup = {
      clients: await this.getAll('clients'),
      cases: await this.getAll('cases'),
      payments: await this.getAll('payments'),
      reminders: await this.getAll('reminders'),
      receipts: await this.getAll('receipts'),
      version: 1,
      exportedAt: new Date().toISOString()
    };
    return backup;
  },

  async importBackup(backupData) {
    if (!currentUser) return false;
    const uid = currentUser.uid;

    const restoreStore = async (storeName, items) => {
      if (!items || !items.length) return;
      const batch = writeBatch(dbFirestore);
      for (const item of items) {
        if (storeName === 'receipts' && typeof item.file === 'string' && item.file.startsWith('data:')) {
          const blob = base64ToBlob(item.file);
          const storageRef = ref(storage, `users/${uid}/receipts/${item.paymentId}_${item.cuotaNumero}_${item.fileName}`);
          const uploadSnap = await uploadBytes(storageRef, blob);
          const downloadUrl = await getDownloadURL(uploadSnap.ref);
          item.file = downloadUrl;
        }
        const docRef = doc(dbFirestore, "users", uid, storeName, String(item.id));
        batch.set(docRef, item);
      }
      await batch.commit();
    };

    if (backupData.clients) await restoreStore('clients', backupData.clients);
    if (backupData.cases) await restoreStore('cases', backupData.cases);
    if (backupData.payments) await restoreStore('payments', backupData.payments);
    if (backupData.reminders) await restoreStore('reminders', backupData.reminders);
    if (backupData.receipts) await restoreStore('receipts', backupData.receipts);
    return true;
  }
};

// Initialize DB and load initial data
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Setup Navigation Event Listeners
    setupNavigation();

    // 2. Setup CRUD Event Listeners (Clients, Cases, Payments, Reminders)
    setupClientsCRUD();
    setupCasesCRUD();
    setupPaymentsCRUD();
    setupRemindersCRUD();

    // 3. Setup File Uploader Event Listeners
    setupFileUploader();

    // 4. Setup Search and Backup System
    setupSettingsAndSearch();
    setupGoogleDriveAPI();

    // 5. Setup Firebase Authentication Gate
    setupAuthControls();

    console.log('Eventos de aplicación iniciados exitosamente.');
  } catch (error) {
    console.error('Error al inicializar la aplicación:', error);
  }
});

// Refresh State data from the active DB (Firestore when logged in)
async function refreshStateData() {
  State.activeClients = await DB.getAll('clients');
  State.activeCases = await DB.getAll('cases');
  State.activePayments = await DB.getAll('payments');
  State.activeReminders = await DB.getAll('reminders');
}

// Authentication and Migration Handlers
function setupAuthControls() {
  const loginForm = document.getElementById('login-form');
  const loginEmailInput = document.getElementById('login-email');
  const loginPasswordInput = document.getElementById('login-password');
  const loginErrorMsg = document.getElementById('login-error-msg');
  const logoutBtn = document.getElementById('btn-logout');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = loginEmailInput.value.trim();
      const password = loginPasswordInput.value;
      const submitBtn = document.getElementById('btn-login-submit');

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Iniciando...';
      loginErrorMsg.style.display = 'none';

      try {
        if (!auth) {
          throw new Error("Firebase no está configurado. Por favor edita la variable firebaseConfig en la parte superior de app.js.");
        }
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        console.error("Login error:", err);
        loginErrorMsg.textContent = "Error al iniciar sesión: " + (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' ? 'Correo o contraseña incorrectos.' : err.message);
        loginErrorMsg.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Iniciar Sesión';
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        try {
          if (auth) {
            await signOut(auth);
            window.location.reload();
          }
        } catch (err) {
          console.error("Logout error:", err);
        }
      }
    });
  }

  if (auth) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        DB = FirestoreDB;
        window.DB = FirestoreDB;

        // Update profile in sidebar
        document.getElementById('sidebar-user-profile').style.display = 'block';
        document.getElementById('user-display-email').textContent = user.email;
        
        const emailPart = user.email.split('@')[0];
        const initials = emailPart.slice(0, 2).toUpperCase();
        document.getElementById('user-avatar-initials').textContent = initials;

        // Hide login screen
        document.getElementById('login-overlay').style.display = 'none';

        // Check if we need to migrate local data
        if (!authInitialized) {
          authInitialized = true;
          await checkLocalDataForMigration();
          await loadSharedGoogleConfig();
        } else {
          await refreshStateData();
          await loadSharedGoogleConfig();
          renderView(State.currentView);
          updateDashboardStats();
          renderDashboardLists();
        }
      } else {
        currentUser = null;
        DB = LocalDB;
        window.DB = LocalDB;
        document.getElementById('sidebar-user-profile').style.display = 'none';
        document.getElementById('login-overlay').style.display = 'flex';
        
        const submitBtn = document.getElementById('btn-login-submit');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Iniciar Sesión';
        }
      }
    });
  } else {
    document.getElementById('login-overlay').style.display = 'flex';
    loginErrorMsg.innerHTML = '<strong>Error de configuración:</strong><br>El proyecto de Firebase no ha sido configurado en <code>app.js</code>. Edita la variable <code>firebaseConfig</code> al inicio del archivo para activarlo.';
    loginErrorMsg.style.display = 'block';
    const submitBtn = document.getElementById('btn-login-submit');
    if (submitBtn) submitBtn.disabled = true;
  }
}

async function checkLocalDataForMigration() {
  if (!LocalDB) return;
  try {
    const clients = await LocalDB.getAll('clients');
    const cases = await LocalDB.getAll('cases');
    const payments = await LocalDB.getAll('payments');
    const reminders = await LocalDB.getAll('reminders');
    const receipts = await LocalDB.getAll('receipts');
    
    const count = clients.length + cases.length + payments.length + reminders.length + receipts.length;
    if (count > 0) {
      document.getElementById('migration-count-clients').textContent = clients.length;
      document.getElementById('migration-count-cases').textContent = cases.length;
      document.getElementById('migration-count-payments').textContent = payments.length;
      document.getElementById('migration-count-reminders').textContent = reminders.length;
      document.getElementById('migration-count-receipts').textContent = receipts.length;
      
      showModal('modal-migration');
      
      document.getElementById('btn-start-migration').onclick = async () => {
        document.getElementById('btn-start-migration').disabled = true;
        document.getElementById('btn-skip-migration').disabled = true;
        document.getElementById('btn-start-migration').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Migrando...';
        
        try {
          for (const client of clients) {
            await FirestoreDB.add('clients', client);
          }
          for (const kase of cases) {
            await FirestoreDB.add('cases', kase);
          }
          for (const payment of payments) {
            await FirestoreDB.add('payments', payment);
          }
          for (const reminder of reminders) {
            await FirestoreDB.add('reminders', reminder);
          }
          for (const receipt of receipts) {
            await FirestoreDB.add('receipts', receipt);
          }
          
          await clearLocalIndexedDB();
          
          alert('¡Datos migrados exitosamente a la nube!');
          hideModal('modal-migration');
          
          await refreshStateData();
          renderView(State.currentView);
          updateDashboardStats();
          renderDashboardLists();
        } catch (err) {
          console.error("Migration error:", err);
          alert("Error al migrar algunos datos. Por favor inténtalo de nuevo.");
          document.getElementById('btn-start-migration').disabled = false;
          document.getElementById('btn-skip-migration').disabled = false;
          document.getElementById('btn-start-migration').innerHTML = '<i class="fa-solid fa-circle-check"></i> Sí, Migrar datos';
        }
      };
      
      document.getElementById('btn-skip-migration').onclick = async () => {
        if (confirm('¿Estás seguro de empezar de cero? Esto borrará tus datos locales para evitar conflictos.')) {
          await clearLocalIndexedDB();
          hideModal('modal-migration');
          
          await refreshStateData();
          renderView(State.currentView);
          updateDashboardStats();
          renderDashboardLists();
        }
      };
    } else {
      await refreshStateData();
      renderView(State.currentView);
      updateDashboardStats();
      renderDashboardLists();
    }
  } catch (err) {
    console.error("Error checking local data:", err);
    await refreshStateData();
    renderView(State.currentView);
    updateDashboardStats();
    renderDashboardLists();
  }
}

async function clearLocalIndexedDB() {
  try {
    const stores = ['clients', 'cases', 'payments', 'reminders', 'receipts'];
    for (const storeName of stores) {
      await new Promise((resolve, reject) => {
        initDB().then((db) => {
          const transaction = db.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          const req = store.clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        }).catch(reject);
      });
    }
  } catch (err) {
    console.error("Error clearing local IndexedDB:", err);
  }
}

// ================= MODAL HELPERS =================
function showModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('active'), 10);
  }
}

function hideModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.style.display = 'none', 300);
  }
}

// Close modals when clicking overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      hideModal(overlay.id);
    }
  });
});

// ================= ROUTING & NAVIGATION =================
function setupNavigation() {
  const navIds = {
    'btn-nav-dashboard': 'dashboard',
    'btn-nav-clients': 'clients',
    'btn-nav-cases': 'cases',
    'btn-nav-payments': 'payments',
    'btn-nav-calendar': 'calendar',
    'btn-nav-settings': 'settings'
  };

  Object.entries(navIds).forEach(([btnId, viewName]) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        // Update active class in list items
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        btn.closest('.nav-item').classList.add('active');

        // Switch active view
        renderView(viewName);
        
        // Close sidebar on mobile
        closeSidebarOnMobile();
      });
    }
  });

  // Header quick notification alert icon click
  document.getElementById('btn-alert-notifications').addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById('nav-dashboard-li').classList.add('active');
    renderView('dashboard');
    // Scroll to dashboard reminders
    document.getElementById('dashboard-reminders-list').scrollIntoView({ behavior: 'smooth' });
    
    // Close sidebar on mobile
    closeSidebarOnMobile();
  });

  // Mobile sidebar hamburger menu toggle
  const toggleBtn = document.getElementById('btn-menu-toggle');
  const sidebar = document.querySelector('aside');
  const overlay = document.getElementById('sidebar-overlay');

  if (toggleBtn && sidebar && overlay) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });
  }
}

function closeSidebarOnMobile() {
  const sidebar = document.querySelector('aside');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar && overlay && window.innerWidth <= 768) {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
  }
}

function renderView(viewName) {
  State.currentView = viewName;
  
  // Hide all panels
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
  
  // Show active panel
  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) activePanel.classList.add('active');

  // Update header titles
  const title = document.getElementById('page-title');
  const subtitle = document.getElementById('page-subtitle');
  
  switch(viewName) {
    case 'dashboard':
      title.innerText = 'Dashboard Bufete';
      subtitle.innerText = 'Resumen general, alertas y vencimientos de plazos.';
      updateDashboardStats();
      renderDashboardLists();
      break;
    case 'clients':
      title.innerText = 'Gestión de Clientes';
      subtitle.innerText = 'Registra, edita y revisa la ficha básica de tus representados.';
      renderClientsTable();
      break;
    case 'cases':
      title.innerText = 'Causas y Juicios';
      subtitle.innerText = 'Administración de causas penales vinculadas a carpetas de Google Drive.';
      renderCasesTable();
      break;
    case 'payments':
      title.innerText = 'Finanzas y Cuotas';
      subtitle.innerText = 'Control de honorarios en cuotas, morosidades y comprobantes de transferencia.';
      renderPaymentsTable();
      break;
    case 'calendar':
      title.innerText = 'Agenda y Calendario';
      subtitle.innerText = 'Hitos procesales, plazos legales y compromisos fijados.';
      renderCalendar();
      break;
    case 'settings':
      title.innerText = 'Configuración del Bufete';
      subtitle.innerText = 'Respalda la base de datos de tu oficina de forma segura.';
      break;
  }
}

// ================= CLIENTS MANAGEMENT =================
function setupClientsCRUD() {
  const modalId = 'modal-client';
  
  // Open Registrar Modal
  document.getElementById('btn-add-client-modal').addEventListener('click', () => {
    document.getElementById('modal-client-title').innerText = 'Registrar Cliente';
    document.getElementById('form-client').reset();
    document.getElementById('client-id-field').value = '';
    showModal(modalId);
  });

  // Cancel/Close
  document.getElementById('btn-close-client-modal').addEventListener('click', () => hideModal(modalId));
  document.getElementById('btn-cancel-client').addEventListener('click', () => hideModal(modalId));

  // Form Submit (Save / Edit)
  document.getElementById('form-client').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('client-id-field').value;
    const rut = document.getElementById('client-rut').value.trim();
    const nombre = document.getElementById('client-name').value.trim();
    const telefono = document.getElementById('client-phone').value.trim();
    const email = document.getElementById('client-email').value.trim();
    const estado = document.getElementById('client-status').value;

    const clientData = { rut, nombre, telefono, email, estado };

    try {
      if (id) {
        // Update
        clientData.id = Number(id);
        const oldClient = State.activeClients.find(c => c.id === clientData.id);
        clientData.fechaRegistro = oldClient ? oldClient.fechaRegistro : new Date().toLocaleDateString();
        await DB.update('clients', clientData);
      } else {
        // Insert new
        clientData.fechaRegistro = new Date().toLocaleDateString();
        await DB.add('clients', clientData);
      }

      await refreshStateData();
      hideModal(modalId);
      renderClientsTable();
      updateDashboardStats();
    } catch (err) {
      console.error(err);
      alert('Error al guardar el cliente.');
    }
  });
}

function renderClientsTable() {
  const tbody = document.getElementById('table-clients-body');
  tbody.innerHTML = '';

  if (State.activeClients.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fa-solid fa-users-slash" style="font-size: 32px; display: block; margin-bottom: 12px; color: var(--text-dark);"></i>
          No hay clientes registrados aún. Presiona "Registrar Cliente".
        </td>
      </tr>
    `;
    return;
  }

  State.activeClients.forEach(client => {
    const tr = document.createElement('tr');
    
    let statusClass = 'badge-success';
    if (client.estado === 'Suspendido') statusClass = 'badge-warning';
    if (client.estado === 'Finalizado') statusClass = 'badge-primary';

    tr.innerHTML = `
      <td style="font-weight: 600;">${client.rut}</td>
      <td style="font-family: var(--font-title); font-weight: 500;">${client.nombre}</td>
      <td>
        <div style="font-size: 13px;"><i class="fa-solid fa-phone" style="font-size: 11px; color: var(--text-muted); margin-right: 4px;"></i> ${client.telefono || '—'}</div>
        <div style="font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-envelope" style="font-size: 10px; margin-right: 4px;"></i> ${client.email || '—'}</div>
      </td>
      <td style="font-size: 13px;">${client.fechaRegistro}</td>
      <td><span class="badge ${statusClass}">${client.estado}</span></td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm view-client-summary-btn" data-id="${client.id}" title="Ficha / Resumen del Cliente"><i class="fa-solid fa-address-card"></i> Ficha</button>
          <button class="btn btn-secondary btn-sm edit-client-btn" data-id="${client.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm delete-client-btn" data-id="${client.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach button triggers
  document.querySelectorAll('.view-client-summary-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.getAttribute('data-id'));
      openClientSummaryModal(id);
    });
  });

  document.querySelectorAll('.edit-client-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      editClient(id);
    });
  });

  document.querySelectorAll('.delete-client-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      deleteClient(id);
    });
  });
}

function editClient(id) {
  const client = State.activeClients.find(c => c.id === Number(id));
  if (client) {
    document.getElementById('modal-client-title').innerText = 'Editar Cliente';
    document.getElementById('client-id-field').value = client.id;
    document.getElementById('client-rut').value = client.rut;
    document.getElementById('client-name').value = client.nombre;
    document.getElementById('client-phone').value = client.telefono || '';
    document.getElementById('client-email').value = client.email || '';
    document.getElementById('client-status').value = client.estado;
    showModal('modal-client');
  }
}

async function deleteClient(id) {
  // Confirm deletion
  const client = State.activeClients.find(c => c.id === Number(id));
  if (!client) return;

  const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar al cliente "${client.nombre}"? Esto también desvinculará sus causas y planes de pago.`);
  if (confirmDelete) {
    try {
      await DB.delete('clients', id);
      
      // Also delete cases and payments linked to this client (Cascading cleanup)
      const clientCases = State.activeCases.filter(c => c.clientId === Number(id));
      for (const c of clientCases) {
        await DB.delete('cases', c.id);
      }

      const clientPayments = State.activePayments.filter(p => p.clientId === Number(id));
      for (const p of clientPayments) {
        await DB.delete('payments', p.id);
        // Clean related receipts
        const receipts = await DB.getByIndex('receipts', 'paymentId', p.id);
        for (const r of receipts) {
          await DB.delete('receipts', r.id);
        }
        // Clean related reminders
        const reminders = await DB.getAll('reminders');
        const linkedReminders = reminders.filter(r => r.paymentPlanId === p.id);
        for (const rem of linkedReminders) {
          await DB.delete('reminders', rem.id);
        }
      }

      await refreshStateData();
      renderClientsTable();
      updateDashboardStats();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar cliente.');
    }
  }
}

// ================= CASES MANAGEMENT =================
function setupCasesCRUD() {
  const modalId = 'modal-case';

  // Open Nova Causa modal
  document.getElementById('btn-add-case-modal').addEventListener('click', () => {
    document.getElementById('modal-case-title').innerText = 'Registrar Causa Penal';
    document.getElementById('form-case').reset();
    document.getElementById('case-id-field').value = '';
    populateClientSelect('case-client-select');
    showModal(modalId);
  });

  // Cancel/Close
  document.getElementById('btn-close-case-modal').addEventListener('click', () => hideModal(modalId));
  document.getElementById('btn-cancel-case').addEventListener('click', () => hideModal(modalId));

  // Form Submit
  document.getElementById('form-case').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('case-id-field').value;
    const clientId = Number(document.getElementById('case-client-select').value);
    const rit = document.getElementById('case-rit').value.trim();
    const court = document.getElementById('case-court').value.trim();
    const crime = document.getElementById('case-crime').value.trim();
    const status = document.getElementById('case-status').value;
    const details = document.getElementById('case-details').value.trim();

    const caseData = { clientId, rit, court, crime, status, details };

    // Preserve existing driveLink if editing
    if (id) {
      const existingCase = State.activeCases.find(c => c.id === Number(id));
      if (existingCase) {
        caseData.driveLink = existingCase.driveLink || '';
      }
    } else {
      caseData.driveLink = '';
    }

    try {
      if (id) {
        caseData.id = Number(id);
        await DB.update('cases', caseData);
      } else {
        await DB.add('cases', caseData);
      }

      await refreshStateData();
      hideModal(modalId);
      renderCasesTable();
      updateDashboardStats();
    } catch (err) {
      console.error(err);
      alert('Error al guardar la causa.');
    }
  });
}

function populateClientSelect(selectId, selectedValue = '') {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Seleccione un cliente...</option>';
  
  State.activeClients.forEach(client => {
    const opt = document.createElement('option');
    opt.value = client.id;
    opt.innerText = `${client.nombre} (${client.rut})`;
    if (client.id === Number(selectedValue)) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function renderCasesTable() {
  const tbody = document.getElementById('table-cases-body');
  tbody.innerHTML = '';

  if (State.activeCases.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 32px; display: block; margin-bottom: 12px; color: var(--text-dark);"></i>
          No hay causas registradas aún. Presiona "Nueva Causa".
        </td>
      </tr>
    `;
    return;
  }

  State.activeCases.forEach(kase => {
    const tr = document.createElement('tr');
    const client = State.activeClients.find(c => c.id === kase.clientId);
    const clientName = client ? client.nombre : 'Cliente Desconocido';
    
    let statusClass = 'badge-primary'; // Investigacion
    if (kase.status === 'Juicio Oral') statusClass = 'badge-error';
    if (kase.status === 'Apelación') statusClass = 'badge-warning';
    if (kase.status === 'Cerrado') statusClass = 'badge-success';

    // Google Drive Link UI
    const driveUI = kase.driveLink 
      ? `<a href="${kase.driveLink}" target="_blank" class="drive-link-badge"><i class="fa-brands fa-google-drive"></i> Ir a Drive</a>`
      : `<span style="color: var(--text-dark); font-size: 12px;"><i class="fa-solid fa-link-slash"></i> Sin Link</span>`;

    tr.innerHTML = `
      <td style="font-family: var(--font-title); font-weight: 500;">${clientName}</td>
      <td style="font-weight: 600; color: var(--primary);">${kase.rit}</td>
      <td style="font-size: 13px;">${kase.court}</td>
      <td style="font-size: 13px;">${kase.crime}</td>
      <td>${driveUI}</td>
      <td><span class="badge ${statusClass}">${kase.status}</span></td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm view-files-btn" data-id="${kase.id}" title="Expediente Digital"><i class="fa-solid fa-folder-open"></i> Expediente</button>
          <button class="btn btn-secondary btn-sm view-case-summary-btn" data-id="${kase.id}" title="Ficha / Resumen Causa"><i class="fa-solid fa-circle-info"></i></button>
          <button class="btn btn-secondary btn-sm add-reminder-case-btn" data-id="${kase.id}" title="Programar Audiencia / Hito"><i class="fa-solid fa-calendar-plus"></i></button>
          <button class="btn btn-secondary btn-sm edit-case-btn" data-id="${kase.id}" title="Editar Causa"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm delete-case-btn" data-id="${kase.id}" title="Eliminar Causa"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach button triggers
  document.querySelectorAll('.view-files-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.getAttribute('data-id'));
      openCaseFilesModal(id);
    });
  });

  document.querySelectorAll('.view-case-summary-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.getAttribute('data-id'));
      openCaseSummaryModal(id);
    });
  });

  document.querySelectorAll('.add-reminder-case-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.currentTarget.getAttribute('data-id'));
      openNewReminderModal('', id);
    });
  });

  document.querySelectorAll('.edit-case-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      editCase(id);
    });
  });

  document.querySelectorAll('.delete-case-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      deleteCase(id);
    });
  });
}

function editCase(id) {
  const kase = State.activeCases.find(c => c.id === Number(id));
  if (kase) {
    document.getElementById('modal-case-title').innerText = 'Editar Causa Penal';
    document.getElementById('case-id-field').value = kase.id;
    populateClientSelect('case-client-select', kase.clientId);
    document.getElementById('case-rit').value = kase.rit;
    document.getElementById('case-court').value = kase.court;
    document.getElementById('case-crime').value = kase.crime;
    document.getElementById('case-status').value = kase.status;
    document.getElementById('case-details').value = kase.details || '';
    showModal('modal-case');
  }
}

async function deleteCase(id) {
  const kase = State.activeCases.find(c => c.id === Number(id));
  if (!kase) return;

  const confirmDelete = confirm(`¿Deseas eliminar la causa RIT "${kase.rit}"?`);
  if (confirmDelete) {
    try {
      await DB.delete('cases', id);
      await refreshStateData();
      renderCasesTable();
      updateDashboardStats();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar la causa.');
    }
  }
}

// ================= PAYMENTS MANAGEMENT =================
function setupPaymentsCRUD() {
  const modalId = 'modal-payment';

  // Open Crear Plan
  document.getElementById('btn-add-payment-modal').addEventListener('click', () => {
    document.getElementById('form-payment').reset();
    populateClientSelect('payment-client-select');
    showModal(modalId);
  });

  // Cancel/Close
  document.getElementById('btn-close-payment-modal').addEventListener('click', () => hideModal(modalId));
  document.getElementById('btn-cancel-payment').addEventListener('click', () => hideModal(modalId));

  // Form Submit
  document.getElementById('form-payment').addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const clientId = Number(document.getElementById('payment-client-select').value);
      const montoTotal = Number(document.getElementById('payment-amount').value);
      const cuotasTotales = Number(document.getElementById('payment-installments').value);
      const fechaInicioStr = document.getElementById('payment-start-date').value; // YYYY-MM-DD or browser locale format
      const frecuencia = document.getElementById('payment-frequency').value;

      if (!clientId) {
        alert('Por favor seleccione un cliente de la lista.');
        return;
      }

      if (!fechaInicioStr) {
        alert('Por favor ingrese la fecha del primer vencimiento.');
        return;
      }

      // Build installment list array
      const detalleCuotas = [];
      const cuotaMonto = Math.round(montoTotal / cuotasTotales);
      
      // Robust date parsing to handle YYYY-MM-DD, DD/MM/YYYY, and other browser-dependent variations
      let baseDate;
      if (fechaInicioStr.includes('-')) {
        const parts = fechaInicioStr.split('-');
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          baseDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
        } else {
          // DD-MM-YYYY
          baseDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
        }
      } else if (fechaInicioStr.includes('/')) {
        const parts = fechaInicioStr.split('/');
        if (parts[0].length === 4) {
          // YYYY/MM/DD
          baseDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
        } else {
          // DD/MM/YYYY
          baseDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
        }
      } else {
        baseDate = new Date(fechaInicioStr + 'T12:00:00');
      }

      if (isNaN(baseDate.getTime())) {
        alert('La fecha de vencimiento ingresada no es válida.');
        return;
      }

      for (let i = 1; i <= cuotasTotales; i++) {
        let dueDate = new Date(baseDate);
        if (i > 1) {
          if (frecuencia === 'Mensual') {
            dueDate.setMonth(baseDate.getMonth() + (i - 1));
          } else if (frecuencia === 'Quincenal') {
            dueDate.setDate(baseDate.getDate() + (i - 1) * 14);
          } else {
            // Pago único
            dueDate = baseDate;
          }
        }
        
        detalleCuotas.push({
          numero: i,
          monto: cuotaMonto,
          fechaVencimiento: dueDate.toISOString().split('T')[0], // YYYY-MM-DD
          estado: 'Pendiente',
          comprobanteId: null
        });
      }

      const paymentPlan = {
        clientId,
        montoTotal,
        cuotasTotales,
        cuotasPagas: 0,
        detalleCuotas
      };

      const paymentPlanId = await DB.add('payments', paymentPlan);

      // Create automatic reminders for each installment to show in calendar/dashboard
      const client = State.activeClients.find(c => c.id === clientId);
      const clientName = client ? client.nombre : 'Cliente';
      
      const clientCase = State.activeCases.find(k => k.clientId === clientId && k.status !== 'Cerrado');
      const caseId = clientCase ? clientCase.id : null;

      for (const cuota of detalleCuotas) {
        const reminderItem = {
          caseId,
          titulo: `Cobro Cuota #${cuota.numero} - ${clientName}`,
          fecha: `${cuota.fechaVencimiento}T09:00`,
          tipo: 'Pago',
          descripcion: `Vence el pago de la cuota #${cuota.numero} por un monto de $${cuota.monto.toLocaleString('es-CL')}.`,
          completado: false,
          isAutomatic: true,
          paymentPlanId: paymentPlanId,
          cuotaNumero: cuota.numero
        };
        await DB.add('reminders', reminderItem);
      }

      await refreshStateData();
      hideModal(modalId);
      renderPaymentsTable();
      updateDashboardStats();
    } catch (err) {
      console.error(err);
      alert('Error al registrar el plan de pagos: ' + err.message);
    }
  });

  // Setup close events for Payment Details Modal
  document.getElementById('btn-close-payment-details-modal').addEventListener('click', () => hideModal('modal-payment-details'));
  document.getElementById('btn-close-payment-details').addEventListener('click', () => hideModal('modal-payment-details'));
}

function renderPaymentsTable() {
  const tbody = document.getElementById('table-payments-body');
  tbody.innerHTML = '';

  if (State.activePayments.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
          <i class="fa-solid fa-credit-card" style="font-size: 32px; display: block; margin-bottom: 12px; color: var(--text-dark);"></i>
          No hay planes de pago creados aún. Presiona "Crear Plan de Pago".
        </td>
      </tr>
    `;
    return;
  }

  State.activePayments.forEach(plan => {
    const tr = document.createElement('tr');
    const client = State.activeClients.find(c => c.id === plan.clientId);
    const clientName = client ? client.nombre : 'Cliente Desconocido';
    
    // Check if there are overdue installments
    const todayStr = new Date().toISOString().split('T')[0];
    let hasOverdue = false;
    let totalPendingAmount = 0;
    
    plan.detalleCuotas.forEach(cuota => {
      if (cuota.estado === 'Pendiente') {
        totalPendingAmount += cuota.monto;
        if (cuota.fechaVencimiento < todayStr) {
          hasOverdue = true;
        }
      }
    });

    let statusUI = `<span class="badge badge-success">Al día</span>`;
    if (plan.cuotasPagas === plan.cuotasTotales) {
      statusUI = `<span class="badge badge-primary">Totalmente Pagado</span>`;
    } else if (hasOverdue) {
      statusUI = `<span class="badge badge-error">Moroso / Atrasado</span>`;
    }

    tr.innerHTML = `
      <td style="font-family: var(--font-title); font-weight: 500;">${clientName}</td>
      <td style="font-weight: 600;">$${plan.montoTotal.toLocaleString('es-CL')}</td>
      <td>${plan.cuotasPagas} / ${plan.cuotasTotales}</td>
      <td style="color: var(--accent); font-weight: 600;">$${totalPendingAmount.toLocaleString('es-CL')}</td>
      <td>${statusUI}</td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm view-installments-btn" data-id="${plan.id}"><i class="fa-solid fa-magnifying-glass-dollar"></i> Cuotas</button>
          <button class="btn btn-danger btn-sm delete-payment-btn" data-id="${plan.id}" title="Eliminar Plan"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach button triggers
  document.querySelectorAll('.view-installments-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      showPaymentDetails(id);
    });
  });

  document.querySelectorAll('.delete-payment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      deletePaymentPlan(id);
    });
  });
}

async function deletePaymentPlan(id) {
  const plan = State.activePayments.find(p => p.id === Number(id));
  if (!plan) return;

  const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar este plan de pagos? Se eliminarán todos los comprobantes y recordatorios asociados.`);
  if (confirmDelete) {
    try {
      await DB.delete('payments', id);
      // Clean up receipts
      const receipts = await DB.getByIndex('receipts', 'paymentId', plan.id);
      for (const r of receipts) {
        await DB.delete('receipts', r.id);
      }

      // Clean up linked reminders
      const reminders = await DB.getAll('reminders');
      const linkedReminders = reminders.filter(r => r.paymentPlanId === plan.id);
      for (const rem of linkedReminders) {
        await DB.delete('reminders', rem.id);
      }

      await refreshStateData();
      renderPaymentsTable();
      updateDashboardStats();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar el plan de pago.');
    }
  }
}

// Show Installment List Modal Details
function showPaymentDetails(paymentId) {
  const plan = State.activePayments.find(p => p.id === Number(paymentId));
  if (!plan) return;

  const client = State.activeClients.find(c => c.id === plan.clientId);
  const clientName = client ? client.nombre : 'Cliente Desconocido';
  
  // Compute pending amount
  let pendingAmount = 0;
  plan.detalleCuotas.forEach(c => {
    if (c.estado === 'Pendiente') pendingAmount += c.monto;
  });

  document.getElementById('payment-details-client-name').innerText = `Cliente: ${clientName}`;
  document.getElementById('payment-details-total').innerText = `$${plan.montoTotal.toLocaleString('es-CL')}`;
  document.getElementById('payment-details-pending').innerText = `$${pendingAmount.toLocaleString('es-CL')}`;

  const container = document.getElementById('payment-details-installments-list');
  container.innerHTML = '';

  const todayStr = new Date().toISOString().split('T')[0];

  plan.detalleCuotas.forEach((cuota, index) => {
    const card = document.createElement('div');
    card.className = 'installment-item';

    const isOverdue = cuota.estado === 'Pendiente' && cuota.fechaVencimiento < todayStr;
    
    let badgeUI = `<span class="badge badge-success">Pagado</span>`;
    if (cuota.estado === 'Pendiente') {
      badgeUI = isOverdue 
        ? `<span class="badge badge-error">Atrasado (Venció ${formatDate(cuota.fechaVencimiento)})</span>`
        : `<span class="badge badge-warning">Pendiente (Vence ${formatDate(cuota.fechaVencimiento)})</span>`;
    }

    // Set buttons based on status
    let actionButtons = '';
    if (cuota.estado === 'Pendiente') {
      actionButtons = `
        <button class="btn btn-secondary btn-sm fast-pay-btn" data-plan-id="${plan.id}" data-index="${index}"><i class="fa-solid fa-check"></i> Pagado en Efectivo</button>
        <button class="btn btn-primary btn-sm upload-receipt-btn" data-plan-id="${plan.id}" data-index="${index}"><i class="fa-solid fa-cloud-arrow-up"></i> Comprobante</button>
      `;
    } else {
      // Paid
      if (cuota.comprobanteId) {
        actionButtons = `
          <button class="btn btn-secondary btn-sm download-receipt-btn" data-receipt-id="${cuota.comprobanteId}" data-file-name="comprobante-cuota${cuota.numero}-${clientName.replace(/\s+/g, '')}"><i class="fa-solid fa-download"></i> Ver Recibo</button>
          <button class="btn btn-danger btn-sm cancel-payment-btn" data-plan-id="${plan.id}" data-index="${index}" title="Deshacer pago"><i class="fa-solid fa-rotate-left"></i></button>
        `;
      } else {
        // paid with cash/no receipt
        actionButtons = `
          <span style="font-size: 12px; color: var(--success); margin-right: 8px;"><i class="fa-solid fa-money-bill-1"></i> Sin comprobante (Efectivo)</span>
          <button class="btn btn-danger btn-sm cancel-payment-btn" data-plan-id="${plan.id}" data-index="${index}" title="Deshacer pago"><i class="fa-solid fa-rotate-left"></i></button>
        `;
      }
    }

    card.innerHTML = `
      <div class="installment-info">
        <h5>Cuota #${cuota.numero} &bull; $${cuota.monto.toLocaleString('es-CL')}</h5>
        <p>${badgeUI}</p>
      </div>
      <div class="installment-actions">
        ${actionButtons}
      </div>
    `;
    container.appendChild(card);
  });

  // Fast Pay (Mark paid in Cash)
  document.querySelectorAll('.fast-pay-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const planId = Number(e.currentTarget.getAttribute('data-plan-id'));
      const idx = Number(e.currentTarget.getAttribute('data-index'));
      await markInstallmentAsPaid(planId, idx, null);
      showPaymentDetails(planId); // Reload
    });
  });

  // Undo payment mark
  document.querySelectorAll('.cancel-payment-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const planId = Number(e.currentTarget.getAttribute('data-plan-id'));
      const idx = Number(e.currentTarget.getAttribute('data-index'));
      await undoInstallmentPayment(planId, idx);
      showPaymentDetails(planId); // Reload
    });
  });

  // Upload receipt
  document.querySelectorAll('.upload-receipt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const planId = Number(e.currentTarget.getAttribute('data-plan-id'));
      const idx = Number(e.currentTarget.getAttribute('data-index'));
      openReceiptUploadModal(planId, idx);
    });
  });

  // Download/View receipt
  document.querySelectorAll('.download-receipt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const recId = Number(e.currentTarget.getAttribute('data-receipt-id'));
      const name = e.currentTarget.getAttribute('data-file-name');
      downloadReceiptFile(recId, name);
    });
  });

  showModal('modal-payment-details');
}

// Helpers for installment state transitions
async function markInstallmentAsPaid(planId, installmentIdx, receiptId = null) {
  const plan = State.activePayments.find(p => p.id === planId);
  if (plan) {
    plan.detalleCuotas[installmentIdx].estado = 'Pagado';
    plan.detalleCuotas[installmentIdx].comprobanteId = receiptId;
    plan.cuotasPagas = plan.detalleCuotas.filter(c => c.estado === 'Pagado').length;
    
    await DB.update('payments', plan);

    // Mark the automatic reminder as completed
    const cuotaNum = installmentIdx + 1;
    const reminders = await DB.getAll('reminders');
    const linkedReminder = reminders.find(r => r.paymentPlanId === planId && r.cuotaNumero === cuotaNum);
    if (linkedReminder && !linkedReminder.completado) {
      linkedReminder.completado = true;
      await DB.update('reminders', linkedReminder);
    }
    
    await refreshStateData();
    renderPaymentsTable();
    updateDashboardStats();
  }
}

async function undoInstallmentPayment(planId, installmentIdx) {
  const plan = State.activePayments.find(p => p.id === planId);
  if (plan) {
    const oldReceiptId = plan.detalleCuotas[installmentIdx].comprobanteId;
    
    plan.detalleCuotas[installmentIdx].estado = 'Pendiente';
    plan.detalleCuotas[installmentIdx].comprobanteId = null;
    plan.cuotasPagas = plan.detalleCuotas.filter(c => c.estado === 'Pagado').length;

    await DB.update('payments', plan);

    // Mark the automatic reminder as pending again
    const cuotaNum = installmentIdx + 1;
    const reminders = await DB.getAll('reminders');
    const linkedReminder = reminders.find(r => r.paymentPlanId === planId && r.cuotaNumero === cuotaNum);
    if (linkedReminder && linkedReminder.completado) {
      linkedReminder.completado = false;
      await DB.update('reminders', linkedReminder);
    }
    
    // Also delete receipt from DB if it existed
    if (oldReceiptId) {
      await DB.delete('receipts', oldReceiptId);
    }

    await refreshStateData();
    renderPaymentsTable();
    updateDashboardStats();
  }
}

// ================= FILE UPLOADER (RECEIPTS) =================
function setupFileUploader() {
  const modalId = 'modal-receipt-upload';
  const dropBox = document.getElementById('drag-drop-uploader');
  const fileInput = document.getElementById('file-receipt-input');
  
  // Close / Cancel
  document.getElementById('btn-close-receipt-modal').addEventListener('click', () => hideModal(modalId));
  document.getElementById('btn-cancel-receipt').addEventListener('click', () => hideModal(modalId));

  // Trigger file browser on click
  dropBox.addEventListener('click', () => fileInput.click());

  // Drag and drop events
  ['dragenter', 'dragover'].forEach(eventName => {
    dropBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropBox.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropBox.classList.remove('dragover');
    }, false);
  });

  dropBox.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleSelectedFile(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  // Remove selected file click
  document.getElementById('btn-remove-preview-file').addEventListener('click', () => {
    clearSelectedFile();
  });

  // Submit Receipt Record to Database
  document.getElementById('btn-save-receipt-submit').addEventListener('click', async () => {
    if (!State.selectedUploadFile || !State.selectedUploadInstallment) return;

    const file = State.selectedUploadFile;
    const { paymentId, installmentIndex } = State.selectedUploadInstallment;

    try {
      // Save Receipt File Blob
      const receiptItem = {
        paymentId,
        cuotaNumero: installmentIndex + 1,
        file: file, // Blobs are supported directly by IndexedDB!
        fileName: file.name,
        fileType: file.type,
        fechaSubida: new Date().toLocaleDateString()
      };

      const receiptId = await DB.add('receipts', receiptItem);

      // Mark the installment as paid
      await markInstallmentAsPaid(paymentId, installmentIndex, receiptId);
      
      hideModal(modalId);
      clearSelectedFile();
      
      // Refresh details
      showPaymentDetails(paymentId);
    } catch (err) {
      console.error('Error saving receipt:', err);
      alert('Ocurrió un error al guardar el comprobante en la base local.');
    }
  });
}

function openReceiptUploadModal(paymentId, installmentIdx) {
  State.selectedUploadInstallment = { paymentId, installmentIndex: installmentIdx };
  clearSelectedFile();

  const plan = State.activePayments.find(p => p.id === paymentId);
  const cuota = plan.detalleCuotas[installmentIdx];
  const client = State.activeClients.find(c => c.id === plan.clientId);
  const clientName = client ? client.nombre : 'Cliente Desconocido';

  document.getElementById('receipt-upload-title').innerText = `Subir Comprobante Cuota #${cuota.numero} &bull; Monto: $${cuota.monto.toLocaleString('es-CL')}`;
  document.getElementById('receipt-upload-client').innerText = `Cliente: ${clientName}`;

  showModal('modal-receipt-upload');
}

function handleSelectedFile(file) {
  // Validate file type
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
  if (!validTypes.includes(file.type)) {
    alert('Formato de archivo no válido. Solo se admiten archivos PNG, JPG o PDF.');
    return;
  }

  // Validate size (max 5MB to keep IndexedDB light)
  if (file.size > 5 * 1024 * 1024) {
    alert('El archivo es demasiado grande. El límite de tamaño es de 5 MB.');
    return;
  }

  State.selectedUploadFile = file;

  // Show preview
  document.getElementById('preview-file-name').innerText = file.name;
  document.getElementById('preview-file-size').innerText = `${Math.round(file.size / 1024)} KB`;

  const icon = document.getElementById('preview-file-icon');
  if (file.type === 'application/pdf') {
    icon.className = 'fa-regular fa-file-pdf';
    icon.style.color = '#ef4444';
  } else {
    icon.className = 'fa-regular fa-file-image';
    icon.style.color = '#3b82f6';
  }

  document.getElementById('drag-drop-uploader').style.display = 'none';
  document.getElementById('receipt-file-preview').style.display = 'flex';
  document.getElementById('btn-save-receipt-submit').removeAttribute('disabled');
}

function clearSelectedFile() {
  State.selectedUploadFile = null;
  document.getElementById('file-receipt-input').value = '';
  document.getElementById('drag-drop-uploader').style.display = 'flex';
  document.getElementById('receipt-file-preview').style.display = 'none';
  document.getElementById('btn-save-receipt-submit').setAttribute('disabled', 'true');
}

function downloadReceiptFile(receiptId, proposedName) {
  DB.getById('receipts', receiptId).then(receipt => {
    if (!receipt || !receipt.file) {
      alert('El archivo del comprobante no fue encontrado.');
      return;
    }

    const isUrl = typeof receipt.file === 'string';
    const url = isUrl ? receipt.file : URL.createObjectURL(receipt.file);
    const a = document.createElement('a');
    a.href = url;
    if (isUrl) {
      a.target = '_blank';
    }
    
    // Maintain extension
    const ext = receipt.fileName.split('.').pop();
    a.download = `${proposedName}.${ext}`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      if (!isUrl) URL.revokeObjectURL(url);
    }, 100);
  }).catch(err => {
    console.error(err);
    alert('Error al descargar el archivo.');
  });
}

// ================= REMINDERS & AGENDA =================
function setupRemindersCRUD() {
  const modalId = 'modal-reminder';

  // Open modal from calendar page
  document.getElementById('btn-add-calendar-event').addEventListener('click', () => {
    openNewReminderModal();
  });

  // Open modal from dashboard quick button
  document.getElementById('btn-quick-reminder').addEventListener('click', () => {
    openNewReminderModal();
  });

  // Close/Cancel
  document.getElementById('btn-close-reminder-modal').addEventListener('click', () => hideModal(modalId));
  document.getElementById('btn-cancel-reminder').addEventListener('click', () => hideModal(modalId));

  // Tab Switch Event Listeners
  const btnTabStandard = document.getElementById('btn-tab-standard');
  const btnTabInvestigation = document.getElementById('btn-tab-investigation');
  const contentStandard = document.getElementById('reminder-tab-content-standard');
  const contentInvestigation = document.getElementById('reminder-tab-content-investigation');
  const formReminder = document.getElementById('form-reminder');

  const switchTab = (tab) => {
    formReminder.setAttribute('data-active-tab', tab);
    if (tab === 'standard') {
      btnTabStandard.classList.add('active');
      btnTabInvestigation.classList.remove('active');
      contentStandard.style.display = 'block';
      contentInvestigation.style.display = 'none';
      document.getElementById('reminder-date').setAttribute('required', 'true');
      document.getElementById('reminder-title').setAttribute('required', 'true');
    } else {
      btnTabStandard.classList.remove('active');
      btnTabInvestigation.classList.add('active');
      contentStandard.style.display = 'none';
      contentInvestigation.style.display = 'block';
      document.getElementById('reminder-date').removeAttribute('required');
      document.getElementById('reminder-title').removeAttribute('required');
      updateInvestigationTargetDate();
    }
  };

  btnTabStandard.addEventListener('click', () => switchTab('standard'));
  btnTabInvestigation.addEventListener('click', () => switchTab('investigation'));

  // Aritmética de cálculo de plazos
  const baseDateInput = document.getElementById('inv-base-date');
  const daysInput = document.getElementById('inv-days-input');
  const targetDateDisplay = document.getElementById('inv-target-date-display');

  const updateInvestigationTargetDate = () => {
    const baseDateStr = baseDateInput.value;
    const days = parseInt(daysInput.value) || 0;

    if (!baseDateStr) {
      targetDateDisplay.innerText = '—';
      return;
    }

    const [year, month, day] = baseDateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    date.setDate(date.getDate() + days);

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formatted = date.toLocaleDateString('es-ES', options);
    targetDateDisplay.innerText = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    targetDateDisplay.dataset.calculatedDate = date.toISOString().split('T')[0];
  };

  baseDateInput.addEventListener('input', updateInvestigationTargetDate);
  daysInput.addEventListener('input', updateInvestigationTargetDate);

  // Preset Buttons for Plazos
  document.querySelectorAll('.preset-day-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const days = e.currentTarget.getAttribute('data-days');
      daysInput.value = days;
      updateInvestigationTargetDate();
    });
  });

  // Form Submit
  document.getElementById('form-reminder').addEventListener('submit', async (e) => {
    e.preventDefault();

    const activeTab = formReminder.getAttribute('data-active-tab') || 'standard';
    const id = document.getElementById('reminder-id-field').value;
    
    let reminderData = { completado: false };

    if (activeTab === 'standard') {
      const caseId = document.getElementById('reminder-case-select').value ? Number(document.getElementById('reminder-case-select').value) : null;
      const titulo = document.getElementById('reminder-title').value.trim();
      const fecha = document.getElementById('reminder-date').value; // YYYY-MM-DDTHH:MM
      const tipo = document.getElementById('reminder-type').value;
      const descripcion = document.getElementById('reminder-details').value.trim();
      
      reminderData = { ...reminderData, caseId, titulo, fecha, tipo, descripcion };
    } else {
      // Plazo de investigación
      const caseId = document.getElementById('reminder-case-select-inv').value ? Number(document.getElementById('reminder-case-select-inv').value) : null;
      if (!caseId) {
        alert('Por favor, asocie el plazo de investigación a una causa.');
        return;
      }

      const baseDateStr = baseDateInput.value;
      if (!baseDateStr) {
        alert('Por favor, ingrese la fecha de la audiencia.');
        return;
      }

      const days = parseInt(daysInput.value) || 0;
      if (days <= 0) {
        alert('Por favor, ingrese una cantidad de días válida.');
        return;
      }

      const calculatedDateStr = targetDateDisplay.dataset.calculatedDate;
      if (!calculatedDateStr) {
        alert('Error al calcular la fecha de vencimiento.');
        return;
      }

      const formattedBaseDate = baseDateStr.split('-').reverse().join('/');
      
      reminderData = {
        ...reminderData,
        caseId,
        titulo: 'Vencimiento Plazo Investigación',
        fecha: `${calculatedDateStr}T09:00`,
        tipo: 'Plazo Legal',
        descripcion: `Plazo de investigación fijado en la audiencia del ${formattedBaseDate} por ${days} días corridos.`
      };
    }

    try {
      if (id) {
        reminderData.id = Number(id);
        const oldRem = State.activeReminders.find(r => r.id === reminderData.id);
        reminderData.completado = oldRem ? oldRem.completado : false;
        await DB.update('reminders', reminderData);
      } else {
        await DB.add('reminders', reminderData);
      }

      await refreshStateData();
      hideModal(modalId);

      // Re-render matching current view
      if (State.currentView === 'calendar') {
        renderCalendar();
      } else {
        renderDashboardLists();
        updateDashboardStats();
      }
    } catch (err) {
      console.error(err);
      alert('Error al programar el hito/recordatorio.');
    }
  });
}

function openNewReminderModal(prefilledDate = '', prefilledCaseId = null) {
  document.getElementById('modal-reminder-title').innerText = 'Programar Fecha Importante';
  document.getElementById('form-reminder').reset();
  document.getElementById('reminder-id-field').value = '';
  
  // Set default tab to standard
  const formReminder = document.getElementById('form-reminder');
  formReminder.setAttribute('data-active-tab', 'standard');
  document.getElementById('btn-tab-standard').classList.add('active');
  document.getElementById('btn-tab-investigation').classList.remove('active');
  document.getElementById('reminder-tab-content-standard').style.display = 'block';
  document.getElementById('reminder-tab-content-investigation').style.display = 'none';
  document.getElementById('reminder-date').setAttribute('required', 'true');
  document.getElementById('reminder-title').setAttribute('required', 'true');

  // Set default values for investigation inputs
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('inv-base-date').value = todayStr;
  document.getElementById('inv-days-input').value = '60';
  document.getElementById('inv-target-date-display').innerText = '—';

  // Populate cases selector (Standard)
  const select = document.getElementById('reminder-case-select');
  select.innerHTML = '<option value="">Ninguno (Hito general sin juicio)</option>';
  
  // Populate cases selector (Investigation)
  const selectInv = document.getElementById('reminder-case-select-inv');
  selectInv.innerHTML = '<option value="">Seleccione una causa...</option>';

  State.activeCases.forEach(kase => {
    const client = State.activeClients.find(c => c.id === kase.clientId);
    const clientName = client ? client.nombre : 'Cliente Desconocido';
    
    // Standard option
    const opt = document.createElement('option');
    opt.value = kase.id;
    opt.innerText = `Causa: ${kase.rit} - ${clientName}`;
    if (prefilledCaseId !== null && kase.id === Number(prefilledCaseId)) {
      opt.selected = true;
    }
    select.appendChild(opt);

    // Investigation option
    const optInv = document.createElement('option');
    optInv.value = kase.id;
    optInv.innerText = `Causa: ${kase.rit} - ${clientName}`;
    if (prefilledCaseId !== null && kase.id === Number(prefilledCaseId)) {
      optInv.selected = true;
    }
    selectInv.appendChild(optInv);
  });

  // Prefill Date
  if (prefilledDate) {
    document.getElementById('reminder-date').value = `${prefilledDate}T09:00`;
  }

  showModal('modal-reminder');
}

// ================= CALENDAR DRAWING LOGIC =================
function renderCalendar() {
  const grid = document.getElementById('calendar-grid-days');
  grid.innerHTML = '';

  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const curYear = State.currentDate.getFullYear();
  const curMonth = State.currentDate.getMonth();

  // Set Label
  document.getElementById('calendar-title-label').innerText = `${months[curMonth]} ${curYear}`;

  // Calendar Header Days Name
  const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  DAYS_OF_WEEK.forEach(day => {
    const label = document.createElement('div');
    label.className = 'calendar-day-name';
    label.innerText = day;
    grid.appendChild(label);
  });

  // Get first day of month index (0: Mon, 6: Sun)
  let startDayIdx = new Date(curYear, curMonth, 1).getDay();
  // JS getDay(): 0 is Sunday, 1 is Monday.
  // Transform to Monday = 0, Sunday = 6
  startDayIdx = startDayIdx === 0 ? 6 : startDayIdx - 1;

  // Last day of month
  const totalDays = new Date(curYear, curMonth + 1, 0).getDate();

  // Empty cells before first day
  for (let i = 0; i < startDayIdx; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day empty';
    grid.appendChild(cell);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Draw day cells
  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    
    const dayStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dayStr === todayStr) {
      cell.classList.add('today');
    }

    cell.innerHTML = `<span class="calendar-day-num">${day}</span><div class="calendar-day-events" id="cal-events-${day}"></div>`;
    grid.appendChild(cell);

    // Double click on day to add event
    cell.addEventListener('dblclick', () => {
      openNewReminderModal(dayStr);
    });

    // Populate events for this day
    const dayEventsContainer = cell.querySelector('.calendar-day-events');
    const dayReminders = State.activeReminders.filter(rem => rem.fecha.split('T')[0] === dayStr);

    dayReminders.forEach(rem => {
      const eventBadge = document.createElement('div');
      
      let classType = 'meeting';
      if (rem.tipo === 'Audiencia') classType = 'trial';
      if (rem.tipo === 'Pago') classType = 'pay';
      if (rem.tipo === 'Plazo Legal') classType = 'trial';

      eventBadge.className = `calendar-event ${classType}`;
      
      // Extract time
      const timeStr = rem.fecha.split('T')[1] || '';
      eventBadge.innerText = `${timeStr} ${rem.titulo}`;
      eventBadge.title = `${rem.titulo} - ${rem.descripcion || ''}`;
      
      eventBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        viewReminderDetails(rem.id);
      });

      dayEventsContainer.appendChild(eventBadge);
    });
  }

  // Setup Month selector triggers
  document.getElementById('btn-calendar-prev').onclick = () => {
    State.currentDate.setMonth(State.currentDate.getMonth() - 1);
    renderCalendar();
  };

  document.getElementById('btn-calendar-next').onclick = () => {
    State.currentDate.setMonth(State.currentDate.getMonth() + 1);
    renderCalendar();
  };
}

function viewReminderDetails(reminderId) {
  const rem = State.activeReminders.find(r => r.id === Number(reminderId));
  if (!rem) return;

  const caseInfo = rem.caseId ? State.activeCases.find(c => c.id === rem.caseId) : null;
  const caseText = caseInfo ? `Causa RIT: ${caseInfo.rit} (${caseInfo.court})` : 'Hito general independiente';

  const dateFormatted = new Date(rem.fecha).toLocaleString('es-CL', {
    dateStyle: 'long',
    timeStyle: 'short'
  });

  const confirmDelete = confirm(`
RECORDATORIO / HITO PROCESAL
---------------------------------
Título: ${rem.titulo}
Tipo: ${rem.tipo}
Fecha: ${dateFormatted}
Causa: ${caseText}

Detalle: ${rem.descripcion || 'Sin observaciones.'}

---------------------------------
¿Deseas eliminar este hito permanentemente?
`);

  if (confirmDelete) {
    DB.delete('reminders', rem.id).then(async () => {
      await refreshStateData();
      renderCalendar();
    });
  }
}

// ================= DASHBOARD CALCULATIONS & RE-RENDERS =================
function updateDashboardStats() {
  // Clients count
  const totalClients = State.activeClients.filter(c => c.estado === 'Activo').length;
  document.getElementById('stat-total-clients').innerText = totalClients;

  // Active cases count
  const totalCases = State.activeCases.filter(k => k.status !== 'Cerrado').length;
  document.getElementById('stat-total-cases').innerText = totalCases;

  // Upcoming reminders (next 7 days)
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  
  const upcomingRem = State.activeReminders.filter(rem => {
    const remDate = new Date(rem.fecha);
    return remDate >= today && remDate <= nextWeek && !rem.completado;
  }).length;
  
  document.getElementById('stat-upcoming-reminders').innerText = upcomingRem;

  // Pending payments this month
  const curYearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  let pendingPaymentsCount = 0;

  State.activePayments.forEach(plan => {
    plan.detalleCuotas.forEach(cuota => {
      if (cuota.estado === 'Pendiente' && cuota.fechaVencimiento.startsWith(curYearMonth)) {
        pendingPaymentsCount++;
      }
    });
  });

  document.getElementById('stat-pending-payments').innerText = pendingPaymentsCount;

  // Calculate Urgent Notifications for the bell icon badge
  calculateSystemAlerts();
}

function calculateSystemAlerts() {
  const todayStr = new Date().toISOString().split('T')[0];
  const next7Days = new Date();
  next7Days.setDate(next7Days.getDate() + 7);
  const next7DaysStr = next7Days.toISOString().split('T')[0];

  let alertCount = 0;

  // 1. Check for overdue/pending payments
  State.activePayments.forEach(plan => {
    plan.detalleCuotas.forEach(cuota => {
      if (cuota.estado === 'Pendiente') {
        if (cuota.fechaVencimiento <= todayStr) {
          alertCount++; // Overdue
        } else if (cuota.fechaVencimiento <= next7DaysStr) {
          alertCount++; // Due soon
        }
      }
    });
  });

  // 2. Check for upcoming trials/appointments (next 3 days)
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + 3);
  
  State.activeReminders.forEach(rem => {
    const remDateStr = rem.fecha.split('T')[0];
    if (remDateStr >= todayStr && remDateStr <= limitDate.toISOString().split('T')[0] && !rem.completado) {
      alertCount++;
    }
  });

  // Render badge
  const badge = document.getElementById('alert-notification-badge');
  if (alertCount > 0) {
    badge.innerText = alertCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderDashboardLists() {
  const todayStr = new Date().toISOString().split('T')[0];
  
  // 1. Render important Dates / Court schedule
  const remindersContainer = document.getElementById('dashboard-reminders-list');
  remindersContainer.innerHTML = '';

  // Sort reminders chronologically
  const activeSortedRem = [...State.activeReminders]
    .filter(r => !r.completado)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (activeSortedRem.length === 0) {
    remindersContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-calendar-check"></i>
        <h3>Sin eventos programados</h3>
        <p>No hay audiencias ni hito judicial registrado próximamente.</p>
      </div>
    `;
  } else {
    activeSortedRem.slice(0, 5).forEach(rem => {
      const item = document.createElement('div');
      
      const isUrgent = rem.fecha.split('T')[0] <= todayStr;
      item.className = `alert-item ${isUrgent ? 'urgent' : 'info'}`;

      const dateText = new Date(rem.fecha).toLocaleString('es-CL', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      const relatedCase = rem.caseId ? State.activeCases.find(c => c.id === rem.caseId) : null;
      const caseLabel = relatedCase ? `RIT: ${relatedCase.rit} - Tribunal: ${relatedCase.court}` : 'Hito General';

      item.innerHTML = `
        <i class="fa-solid ${rem.tipo === 'Audiencia' ? 'fa-gavel' : 'fa-clock'}" style="margin-top: 2px;"></i>
        <div class="alert-details" style="flex-grow: 1;">
          <h4>${rem.titulo} <span class="badge ${isUrgent ? 'badge-error' : 'badge-primary'}" style="font-size: 9px; padding: 2px 6px; margin-left: 6px;">${rem.tipo}</span></h4>
          <p>${caseLabel}</p>
          <p style="color: var(--text-main); font-weight: 500; margin-top: 4px;"><i class="fa-regular fa-calendar"></i> ${dateText}</p>
          ${rem.descripcion ? `<p style="font-style: italic; margin-top: 4px; font-size: 11px;">"${rem.descripcion}"</p>` : ''}
        </div>
        <button class="btn btn-secondary btn-sm check-reminder-btn" data-id="${rem.id}" title="Marcar como cumplido"><i class="fa-solid fa-check"></i></button>
      `;

      remindersContainer.appendChild(item);
    });

    // Attach check action
    document.querySelectorAll('.check-reminder-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = Number(e.currentTarget.getAttribute('data-id'));
        const rem = State.activeReminders.find(r => r.id === id);
        if (rem) {
          rem.completado = true;
          await DB.update('reminders', rem);

          // If this is an automatic payment reminder, mark the installment as paid
          if (rem.paymentPlanId && rem.cuotaNumero) {
            await markInstallmentAsPaid(rem.paymentPlanId, rem.cuotaNumero - 1, null);
          }

          await refreshStateData();
          renderDashboardLists();
          updateDashboardStats();
        }
      });
    });
  }

  // 2. Render Financial alerts (overdue cuotas)
  const paymentsContainer = document.getElementById('dashboard-payments-list');
  paymentsContainer.innerHTML = '';

  const pendingCuotas = [];
  State.activePayments.forEach(plan => {
    const client = State.activeClients.find(c => c.id === plan.clientId);
    const clientName = client ? client.nombre : 'Cliente Desconocido';
    
    plan.detalleCuotas.forEach(cuota => {
      if (cuota.estado === 'Pendiente') {
        pendingCuotas.push({
          paymentId: plan.id,
          clientName,
          cuotaNumero: cuota.numero,
          monto: cuota.monto,
          fechaVencimiento: cuota.fechaVencimiento
        });
      }
    });
  });

  // Sort by date (oldest first, i.e. most overdue)
  pendingCuotas.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));

  if (pendingCuotas.length === 0) {
    paymentsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-check"></i>
        <h3>Finanzas al día</h3>
        <p>Todos los honorarios están al día y sin atrasos.</p>
      </div>
    `;
  } else {
    pendingCuotas.slice(0, 5).forEach(cuota => {
      const isOverdue = cuota.fechaVencimiento < todayStr;
      const item = document.createElement('div');
      item.className = `alert-item ${isOverdue ? 'urgent' : 'pending'}`;

      item.innerHTML = `
        <i class="fa-solid fa-wallet" style="margin-top: 2px;"></i>
        <div class="alert-details" style="flex-grow: 1;">
          <h4>${cuota.clientName} &bull; Cuota #${cuota.cuotaNumero}</h4>
          <p>Monto pendiente: <strong>$${cuota.monto.toLocaleString('es-CL')}</strong></p>
          <p style="color: ${isOverdue ? 'var(--error)' : 'var(--warning)'}; font-weight: 500; margin-top: 2px;">
            <i class="fa-solid fa-triangle-exclamation"></i> Vence: ${formatDate(cuota.fechaVencimiento)} ${isOverdue ? '(VENCIDO)' : ''}
          </p>
        </div>
        <button class="btn btn-secondary btn-sm pay-cuota-quick-btn" data-plan-id="${cuota.paymentId}"><i class="fa-solid fa-dollar-sign"></i> Cobrar</button>
      `;
      paymentsContainer.appendChild(item);
    });

    // Quick cobro button opens installment plan modal
    document.querySelectorAll('.pay-cuota-quick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.getAttribute('data-plan-id'));
        showPaymentDetails(id);
      });
    });
  }
}

// ================= SETTINGS BACKUPS & GLOBAL SEARCH =================
function setupSettingsAndSearch() {
  // 1. Export JSON File
  document.getElementById('btn-export-db').addEventListener('click', async () => {
    try {
      const backup = await DB.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-bufete-penal-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error(err);
      alert('Error al exportar base de datos.');
    }
  });

  // 2. Import JSON File
  document.getElementById('input-import-db').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backupData = JSON.parse(event.target.result);
        
        // Basic signature validation
        if (!backupData.clients || !backupData.cases || !backupData.payments) {
          alert('El archivo no parece ser un respaldo válido de la aplicación.');
          return;
        }

        const confirmImport = confirm('ATENCIÓN: Importar este respaldo reemplazará TODA la información local actual. ¿Deseas continuar?');
        if (confirmImport) {
          await DB.importBackup(backupData);
          await refreshStateData();
          
          alert('Base de datos restaurada correctamente.');
          window.location.reload();
        }
      } catch (err) {
        console.error(err);
        alert('Error al leer el archivo de respaldo. Asegúrate que sea un JSON válido.');
      }
    };
    reader.readAsText(file);
  });

  // 3. Global Search Input Filter
  const searchInput = document.getElementById('global-search-input');
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      // Refresh current view table
      renderView(State.currentView);
      return;
    }

    // Perform global filtering depending on view
    if (State.currentView === 'clients') {
      const filtered = State.activeClients.filter(c => 
        c.nombre.toLowerCase().includes(query) || c.rut.toLowerCase().includes(query)
      );
      renderFilteredClientsTable(filtered);
    } 
    else if (State.currentView === 'cases') {
      const filtered = State.activeCases.filter(k => {
        const client = State.activeClients.find(c => c.id === k.clientId);
        const name = client ? client.nombre.toLowerCase() : '';
        return k.rit.toLowerCase().includes(query) || 
               k.court.toLowerCase().includes(query) || 
               k.crime.toLowerCase().includes(query) ||
               name.includes(query);
      });
      renderFilteredCasesTable(filtered);
    } 
    else if (State.currentView === 'payments') {
      const filtered = State.activePayments.filter(p => {
        const client = State.activeClients.find(c => c.id === p.clientId);
        const name = client ? client.nombre.toLowerCase() : '';
        return name.includes(query);
      });
      renderFilteredPaymentsTable(filtered);
    }
  });
}

// Helpers to render filtered views during search
function renderFilteredClientsTable(list) {
  const tbody = document.getElementById('table-clients-body');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Sin resultados de búsqueda.</td></tr>`;
    return;
  }

  list.forEach(client => {
    const tr = document.createElement('tr');
    let statusClass = client.estado === 'Activo' ? 'badge-success' : (client.estado === 'Suspendido' ? 'badge-warning' : 'badge-primary');
    tr.innerHTML = `
      <td style="font-weight: 600;">${client.rut}</td>
      <td style="font-family: var(--font-title); font-weight: 500;">${client.nombre}</td>
      <td>
        <div style="font-size: 13px;"><i class="fa-solid fa-phone"></i> ${client.telefono || '—'}</div>
        <div style="font-size: 11px; color: var(--text-muted);"><i class="fa-solid fa-envelope"></i> ${client.email || '—'}</div>
      </td>
      <td style="font-size: 13px;">${client.fechaRegistro}</td>
      <td><span class="badge ${statusClass}">${client.estado}</span></td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm edit-client-btn" data-id="${client.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm delete-client-btn" data-id="${client.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFilteredCasesTable(list) {
  const tbody = document.getElementById('table-cases-body');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Sin resultados de búsqueda.</td></tr>`;
    return;
  }

  list.forEach(kase => {
    const tr = document.createElement('tr');
    const client = State.activeClients.find(c => c.id === kase.clientId);
    const clientName = client ? client.nombre : 'Cliente Desconocido';
    let statusClass = kase.status === 'Juicio Oral' ? 'badge-error' : (kase.status === 'Apelación' ? 'badge-warning' : (kase.status === 'Cerrado' ? 'badge-success' : 'badge-primary'));
    const driveUI = kase.driveLink 
      ? `<a href="${kase.driveLink}" target="_blank" class="drive-link-badge"><i class="fa-brands fa-google-drive"></i> Ir a Drive</a>`
      : `<span style="color: var(--text-dark); font-size: 12px;"><i class="fa-solid fa-link-slash"></i> Sin Link</span>`;

    tr.innerHTML = `
      <td style="font-family: var(--font-title); font-weight: 500;">${clientName}</td>
      <td style="font-weight: 600; color: var(--primary);">${kase.rit}</td>
      <td style="font-size: 13px;">${kase.court}</td>
      <td style="font-size: 13px;">${kase.crime}</td>
      <td>${driveUI}</td>
      <td><span class="badge ${statusClass}">${kase.status}</span></td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm edit-case-btn" data-id="${kase.id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm delete-case-btn" data-id="${kase.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFilteredPaymentsTable(list) {
  const tbody = document.getElementById('table-payments-body');
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Sin resultados de búsqueda.</td></tr>`;
    return;
  }

  list.forEach(plan => {
    const tr = document.createElement('tr');
    const client = State.activeClients.find(c => c.id === plan.clientId);
    const clientName = client ? client.nombre : 'Cliente Desconocido';
    
    const todayStr = new Date().toISOString().split('T')[0];
    let hasOverdue = false;
    let totalPendingAmount = 0;
    
    plan.detalleCuotas.forEach(cuota => {
      if (cuota.estado === 'Pendiente') {
        totalPendingAmount += cuota.monto;
        if (cuota.fechaVencimiento < todayStr) hasOverdue = true;
      }
    });

    let statusUI = `<span class="badge badge-success">Al día</span>`;
    if (plan.cuotasPagas === plan.cuotasTotales) {
      statusUI = `<span class="badge badge-primary">Totalmente Pagado</span>`;
    } else if (hasOverdue) {
      statusUI = `<span class="badge badge-error">Moroso / Atrasado</span>`;
    }

    tr.innerHTML = `
      <td style="font-family: var(--font-title); font-weight: 500;">${clientName}</td>
      <td style="font-weight: 600;">$${plan.montoTotal.toLocaleString('es-CL')}</td>
      <td>${plan.cuotasPagas} / ${plan.cuotasTotales}</td>
      <td style="color: var(--accent); font-weight: 600;">$${totalPendingAmount.toLocaleString('es-CL')}</td>
      <td>${statusUI}</td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm view-installments-btn" data-id="${plan.id}"><i class="fa-solid fa-magnifying-glass-dollar"></i> Cuotas</button>
          <button class="btn btn-danger btn-sm delete-payment-btn" data-id="${plan.id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ================= DATE FORMATTING UTILITIES =================
function formatDate(dateStr) {
  if (!dateStr) return '—';
  // dateStr is YYYY-MM-DD
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ================= GOOGLE DRIVE API INTEGRATION =================
function setupGoogleDriveAPI() {
  // Populate form fields with stored values
  const inputClientId = document.getElementById('settings-drive-client-id');
  const inputRootFolder = document.getElementById('settings-drive-root-folder');
  const inputWebAppUrl = document.getElementById('settings-drive-web-app-url');
  
  if (inputClientId) inputClientId.value = State.googleDrive.clientId || '';
  if (inputRootFolder) inputRootFolder.value = State.googleDrive.rootFolderId || '';
  if (inputWebAppUrl) inputWebAppUrl.value = State.googleDrive.webAppUrl || '';

  // Handle save settings form submit
  const form = document.getElementById('form-settings-drive');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const clientId = inputClientId.value.trim();
      const rootFolderId = inputRootFolder.value.trim();
      const webAppUrl = inputWebAppUrl ? inputWebAppUrl.value.trim() : '';

      localStorage.setItem('drive_client_id', clientId);
      localStorage.setItem('drive_root_folder_id', rootFolderId);
      localStorage.setItem('drive_web_app_url', webAppUrl);

      State.googleDrive.clientId = clientId;
      State.googleDrive.rootFolderId = rootFolderId;
      State.googleDrive.webAppUrl = webAppUrl;
      
      // Reset client instance so it re-initializes next time
      State.googleDrive.tokenClient = null;
      State.googleDrive.accessToken = null;
      State.googleDrive.tokenExpiry = null;
      localStorage.removeItem('drive_access_token');
      localStorage.removeItem('drive_token_expiry');

      // Save config to Firestore to share across devices
      await saveGoogleConfigToFirestore();

      alert('Configuración de Google Drive guardada correctamente.');
    });
  }

  // Handle test connection button
  const testBtn = document.getElementById('btn-test-settings-drive');
  if (testBtn) {
    testBtn.addEventListener('click', () => {
      const clientId = inputClientId.value.trim();
      if (!clientId) {
        alert('Por favor ingresa un Client ID para probar la conexión.');
        return;
      }
      
      // Temporary apply configured clientId for testing
      State.googleDrive.clientId = clientId;
      State.googleDrive.tokenClient = null;

      getGoogleAccessToken(() => {
        alert('¡Conexión verificada con éxito! Has iniciado sesión en Google correctamente.');
      });
    });
  }

  // Setup close events for case files modal
  const closeFilesBtn1 = document.getElementById('btn-close-case-files-modal');
  if (closeFilesBtn1) {
    closeFilesBtn1.addEventListener('click', () => hideModal('modal-case-files'));
  }
  const closeFilesBtn2 = document.getElementById('btn-close-case-files');
  if (closeFilesBtn2) {
    closeFilesBtn2.addEventListener('click', () => hideModal('modal-case-files'));
  }

  // Setup close events for client summary modal
  const closeClientSummaryBtn1 = document.getElementById('btn-close-client-summary-modal');
  if (closeClientSummaryBtn1) {
    closeClientSummaryBtn1.addEventListener('click', () => hideModal('modal-client-summary'));
  }
  const closeClientSummaryBtn2 = document.getElementById('btn-close-client-summary');
  if (closeClientSummaryBtn2) {
    closeClientSummaryBtn2.addEventListener('click', () => hideModal('modal-client-summary'));
  }

  // Setup close events for case summary modal
  const closeCaseSummaryBtn1 = document.getElementById('btn-close-case-summary-modal');
  if (closeCaseSummaryBtn1) {
    closeCaseSummaryBtn1.addEventListener('click', () => hideModal('modal-case-summary'));
  }
  const closeCaseSummaryBtn2 = document.getElementById('btn-close-case-summary');
  if (closeCaseSummaryBtn2) {
    closeCaseSummaryBtn2.addEventListener('click', () => hideModal('modal-case-summary'));
  }

  // Google sign in trigger button inside files modal
  const btnAuthGoogle = document.getElementById('btn-auth-google-modal');
  if (btnAuthGoogle) {
    btnAuthGoogle.addEventListener('click', () => {
      getGoogleAccessToken(() => {
        openCaseFilesModal(State.currentFilesCaseId);
      });
    });
  }

  // Initialize Drive file uploader listeners
  setupDriveFileUploader();
}

// Global variable to track the active Google Auth callback
let currentGoogleAuthCallback = null;

async function saveGoogleConfigToFirestore() {
  if (!currentUser || !dbFirestore) return;
  try {
    const configDocRef = doc(dbFirestore, "users", currentUser.uid, "config", "googleDriveConfig");
    await setDoc(configDocRef, {
      webAppUrl: State.googleDrive.webAppUrl || '',
      clientId: State.googleDrive.clientId || '',
      rootFolderId: State.googleDrive.rootFolderId || '',
      accessToken: State.googleDrive.accessToken || '',
      tokenExpiry: State.googleDrive.tokenExpiry || 0,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.error("Error al guardar configuración de Google en Firestore:", err);
  }
}

async function loadGoogleConfigFromFirestore() {
  if (!currentUser || !dbFirestore) return null;
  try {
    const configDocRef = doc(dbFirestore, "users", currentUser.uid, "config", "googleDriveConfig");
    const configSnap = await getDoc(configDocRef);
    if (configSnap.exists()) {
      return configSnap.data();
    }
  } catch (err) {
    console.error("Error al cargar configuración de Google desde Firestore:", err);
  }
  return null;
}

async function loadSharedGoogleConfig() {
  const data = await loadGoogleConfigFromFirestore();
  if (data) {
    if (data.webAppUrl) {
      State.googleDrive.webAppUrl = data.webAppUrl;
      localStorage.setItem('drive_web_app_url', data.webAppUrl);
    }
    if (data.clientId) {
      State.googleDrive.clientId = data.clientId;
      localStorage.setItem('drive_client_id', data.clientId);
    }
    if (data.rootFolderId) {
      State.googleDrive.rootFolderId = data.rootFolderId;
      localStorage.setItem('drive_root_folder_id', data.rootFolderId);
    }
    if (data.accessToken) {
      State.googleDrive.accessToken = data.accessToken;
      State.googleDrive.tokenExpiry = data.tokenExpiry;
      localStorage.setItem('drive_access_token', data.accessToken);
      localStorage.setItem('drive_token_expiry', data.tokenExpiry);
    }
  }
}

function initTokenClient() {
  if (!State.googleDrive.clientId) {
    alert('Por favor configura el Google Client ID en la pestaña de Configuración.');
    return null;
  }
  
  if (State.googleDrive.tokenClient) {
    return State.googleDrive.tokenClient;
  }

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    alert('Las librerías de Google no se han cargado aún. Por favor, asegúrate de tener conexión a Internet y recarga la página.');
    return null;
  }

  State.googleDrive.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: State.googleDrive.clientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: async (tokenResponse) => {
      if (tokenResponse.error) {
        console.error('Error de autenticación Google:', tokenResponse.error);
        alert('Error de autenticación con Google: ' + tokenResponse.error);
        return;
      }
      
      State.googleDrive.accessToken = tokenResponse.access_token;
      State.googleDrive.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
      
      // Save to localStorage for immediate reuse
      localStorage.setItem('drive_access_token', tokenResponse.access_token);
      localStorage.setItem('drive_token_expiry', State.googleDrive.tokenExpiry);
      
      // Save config to Firestore to share across devices
      await saveGoogleConfigToFirestore();
      
      if (currentGoogleAuthCallback) {
        currentGoogleAuthCallback();
      }
    }
  });

  return State.googleDrive.tokenClient;
}

async function getGoogleAccessToken(callback) {
  // If a Web App URL is configured, we bypass interactive OAuth login entirely
  if (State.googleDrive.webAppUrl) {
    if (callback) callback();
    return;
  }

  // 1. If token is already valid in memory (with 2 min buffer)
  if (State.googleDrive.accessToken && State.googleDrive.tokenExpiry > (Date.now() + 120000)) {
    if (callback) callback();
    return;
  }

  // 2. Try loading a fresh token from Firestore (in case another computer in the office refreshed it)
  try {
    const data = await loadGoogleConfigFromFirestore();
    if (data && data.tokenExpiry > (Date.now() + 120000)) {
      State.googleDrive.accessToken = data.accessToken;
      State.googleDrive.tokenExpiry = data.tokenExpiry;
      localStorage.setItem('drive_access_token', data.accessToken);
      localStorage.setItem('drive_token_expiry', data.tokenExpiry);
      if (callback) callback();
      return;
    }
  } catch (err) {
    console.error("Error al verificar token compartido de Google:", err);
  }

  // 3. If still not valid, request a new one (interactive prompt)
  currentGoogleAuthCallback = callback;
  const tokenClient = initTokenClient();
  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

async function listDriveFiles(folderId) {
  if (State.googleDrive.webAppUrl) {
    const url = `${State.googleDrive.webAppUrl}?action=list&folderId=${folderId}`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error('Error al listar archivos desde Google Apps Script.');
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data.files || [];
  }

  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,webViewLink,createdTime)&orderBy=name`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${State.googleDrive.accessToken}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error ? errorData.error.message : 'Error al listar archivos de Google Drive.');
  }

  const data = await response.json();
  return data.files || [];
}

async function createDriveFolder(name, parentId) {
  if (State.googleDrive.webAppUrl) {
    const url = `${State.googleDrive.webAppUrl}?action=createFolder&name=${encodeURIComponent(name)}&parentId=${parentId}`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error('Error al crear la carpeta en Google Apps Script.');
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data; // { id: newFolderId }
  }

  const url = 'https://www.googleapis.com/drive/v3/files';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${State.googleDrive.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : []
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error ? errorData.error.message : 'Error al crear la carpeta en Google Drive.');
  }

  return await response.json();
}

async function shareDriveFileOrFolder(fileId) {
  if (State.googleDrive.webAppUrl) {
    return; // Already shared automatically by Apps Script
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${State.googleDrive.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  if (!response.ok) {
    console.warn('No se pudieron establecer los permisos públicos del archivo.');
  }
}

function uploadFileToDrive(file, folderId, onProgress) {
  if (State.googleDrive.webAppUrl) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const base64Data = e.target.result.split(',')[1];
          const response = await fetch(State.googleDrive.webAppUrl, {
            method: 'POST',
            redirect: 'follow',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
              action: 'upload',
              folderId: folderId,
              name: file.name,
              contentType: file.type,
              base64Data: base64Data
            })
          });
          if (onProgress) onProgress(100);
          if (!response.ok) throw new Error('Error al subir el archivo al Google Apps Script.');
          const data = await response.json();
          if (data.error) throw new Error(data.error);
          resolve(data); // returns { id: ..., name: ... }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${State.googleDrive.accessToken}`);
    
    if (onProgress && xhr.upload) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          reject(e);
        }
      } else {
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          reject(new Error(errorResponse.error ? errorResponse.error.message : 'Error desconocido al subir el archivo.'));
        } catch (e) {
          reject(new Error(`Error de red HTTP ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Error de red al intentar conectarse a Google Drive.'));
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: file.name,
      parents: [folderId]
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileContent = e.target.result;
      
      const metadataPart = delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        '\r\n';

      const fileHeader = delimiter +
        `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`;

      const blob = new Blob([
        metadataPart,
        fileHeader,
        new Uint8Array(fileContent),
        closeDelimiter
      ], { type: `multipart/related; boundary=${boundary}` });

      xhr.send(blob);
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function deleteDriveFile(fileId) {
  if (State.googleDrive.webAppUrl) {
    const response = await fetch(State.googleDrive.webAppUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'delete',
        fileId: fileId
      })
    });
    if (!response.ok) throw new Error('Error al eliminar archivo desde Google Apps Script.');
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return true;
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${State.googleDrive.accessToken}`
    }
  });

  if (!response.ok && response.status !== 404) {
    const errorData = await response.json();
    throw new Error(errorData.error ? errorData.error.message : 'Error al eliminar el archivo de Google Drive.');
  }
}

async function openCaseFilesModal(caseId) {
  State.currentFilesCaseId = caseId;
  const kase = State.activeCases.find(c => c.id === caseId);
  if (!kase) return;

  const client = State.activeClients.find(c => c.id === kase.clientId);
  const clientName = client ? client.nombre : 'Cliente';

  // Set modal header text
  document.getElementById('modal-case-files-title').innerText = `Expediente RIT: ${kase.rit}`;
  document.getElementById('modal-case-files-subtitle').innerText = `Cliente: ${clientName} | Tribunal: ${kase.court}`;

  // Check config
  if (!State.googleDrive.clientId || !State.googleDrive.rootFolderId) {
    alert('Debes configurar las credenciales de Google Drive (Client ID y Carpeta Raíz) en la pestaña de Configuración.');
    renderView('settings');
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById('nav-settings-li').classList.add('active');
    return;
  }

  // Clear previous upload preview or progress
  document.getElementById('drive-upload-progress-container').style.display = 'none';
  document.getElementById('drive-files-list').innerHTML = `
    <div style="text-align: center; padding: 20px; color: var(--text-muted);">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px;"></i>
      <p>Cargando archivos del expediente...</p>
    </div>
  `;

  showModal('modal-case-files');

  // Verify auth and proceed to load files
  getGoogleAccessToken(async () => {
    try {
      document.getElementById('drive-auth-warning').style.display = 'none';
      document.getElementById('drive-files-body').style.display = 'flex';
      
      let folderId = '';
      
      if (kase.driveLink) {
        folderId = extractFolderIdFromLink(kase.driveLink);
      }

      if (!folderId) {
        document.getElementById('modal-case-files-subtitle').innerText = `Creando carpeta en Google Drive para el expediente...`;
        
        const folderName = `${kase.rit} - ${clientName}`;
        const driveFolder = await createDriveFolder(folderName, State.googleDrive.rootFolderId);
        folderId = driveFolder.id;
        
        // Share folder publicly
        await shareDriveFileOrFolder(folderId);

        // Update database driveLink field
        kase.driveLink = `https://drive.google.com/drive/folders/${folderId}`;
        await DB.update('cases', kase);
        await refreshStateData();
        renderCasesTable();
      }

      document.getElementById('modal-case-files-subtitle').innerText = `Sincronizado con Google Drive`;
      await refreshDriveFilesList(folderId);

    } catch (err) {
      console.error(err);
      if (err.message && (err.message.includes('unauthorized') || err.message.includes('Invalid Credentials') || err.message.includes('401'))) {
        document.getElementById('drive-auth-warning').style.display = 'flex';
        document.getElementById('drive-files-body').style.display = 'none';
      } else {
        document.getElementById('drive-files-list').innerHTML = `
          <div class="empty-state">
            <i class="fa-solid fa-triangle-exclamation" style="color: var(--error);"></i>
            <h3>Error de sincronización</h3>
            <p>${err.message || 'No se pudieron recuperar los archivos de Google Drive.'}</p>
          </div>
        `;
      }
    }
  });
}

function extractFolderIdFromLink(link) {
  if (!link) return '';
  if (link.startsWith('http://') || link.startsWith('https://')) {
    const match = link.match(/\/folders\/([a-zA-Z0-9-_]+)/) || link.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    return match ? match[1] : '';
  }
  return link;
}

async function refreshDriveFilesList(folderId) {
  const container = document.getElementById('drive-files-list');
  container.innerHTML = `
    <div style="text-align: center; padding: 20px; color: var(--text-muted);">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 8px;"></i>
      <p>Consultando Google Drive...</p>
    </div>
  `;

  try {
    const files = await listDriveFiles(folderId);
    renderDriveFiles(files);
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation" style="color: var(--error);"></i>
        <h3>Error al listar archivos</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

function renderDriveFiles(files) {
  const container = document.getElementById('drive-files-list');
  container.innerHTML = '';

  if (files.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px 10px;">
        <i class="fa-solid fa-file-circle-minus" style="font-size: 32px;"></i>
        <h3 style="font-size: 15px;">Expediente vacío</h3>
        <p style="font-size: 12px;">No se han subido documentos a esta causa todavía.</p>
      </div>
    `;
    return;
  }

  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'drive-file-item';
    
    let iconClass = 'fa-regular fa-file';
    let iconColor = 'var(--text-muted)';
    
    if (file.mimeType.includes('pdf')) {
      iconClass = 'fa-regular fa-file-pdf';
      iconColor = '#ef4444';
    } else if (file.mimeType.includes('image')) {
      iconClass = 'fa-regular fa-file-image';
      iconColor = '#3b82f6';
    } else if (file.mimeType.includes('word') || file.mimeType.includes('officedocument.wordprocessing')) {
      iconClass = 'fa-regular fa-file-word';
      iconColor = '#2563eb';
    } else if (file.mimeType.includes('excel') || file.mimeType.includes('officedocument.spreadsheetml')) {
      iconClass = 'fa-regular fa-file-excel';
      iconColor = '#10b981';
    }

    let sizeText = '—';
    if (file.size) {
      const kbs = Math.round(Number(file.size) / 1024);
      sizeText = kbs >= 1024 
        ? `${(kbs / 1024).toFixed(1)} MB`
        : `${kbs} KB`;
    }

    const createdDate = file.createdTime 
      ? new Date(file.createdTime).toLocaleDateString('es-CL') 
      : '—';

    item.innerHTML = `
      <div class="drive-file-details">
        <i class="${iconClass}" style="color: ${iconColor};"></i>
        <div class="drive-file-info">
          <h6>${file.name}</h6>
          <p>${sizeText} &bull; Subido el ${createdDate}</p>
        </div>
      </div>
      <div class="drive-file-actions">
        <a href="${file.webViewLink}" target="_blank" class="btn btn-secondary btn-sm" title="Abrir en Google Drive" style="padding: 6px 10px; border-radius: var(--radius-sm);">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
        </a>
        <button class="btn btn-danger btn-sm delete-drive-file-btn" data-id="${file.id}" data-name="${file.name}" title="Eliminar de Drive" style="padding: 6px 10px; border-radius: var(--radius-sm);">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;

    container.appendChild(item);
  });

  container.querySelectorAll('.delete-drive-file-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const fileId = e.currentTarget.getAttribute('data-id');
      const fileName = e.currentTarget.getAttribute('data-name');
      
      const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar permanentemente el archivo "${fileName}" de Google Drive?`);
      if (confirmDelete) {
        try {
          e.currentTarget.disabled = true;
          e.currentTarget.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          
          await deleteDriveFile(fileId);
          
          const kase = State.activeCases.find(c => c.id === State.currentFilesCaseId);
          const folderId = extractFolderIdFromLink(kase.driveLink);
          
          await refreshDriveFilesList(folderId);
        } catch (err) {
          console.error(err);
          alert('Error al eliminar archivo: ' + err.message);
          e.currentTarget.disabled = false;
          e.currentTarget.innerHTML = '<i class="fa-solid fa-trash"></i>';
        }
      }
    });
  });
}

function setupDriveFileUploader() {
  const dropBox = document.getElementById('drive-file-uploader');
  const fileInput = document.getElementById('input-drive-file');
  
  if (!dropBox || !fileInput) return;

  dropBox.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropBox.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropBox.classList.remove('dragover');
    }, false);
  });

  dropBox.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleDriveFilesUpload(files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleDriveFilesUpload(e.target.files);
    }
  });
}

async function handleDriveFilesUpload(files) {
  const kase = State.activeCases.find(c => c.id === State.currentFilesCaseId);
  if (!kase) return;

  const folderId = extractFolderIdFromLink(kase.driveLink);
  if (!folderId) {
    alert('Error: Carpeta de Google Drive no establecida para esta causa.');
    return;
  }

  const progressContainer = document.getElementById('drive-upload-progress-container');
  const progressFilename = document.getElementById('drive-upload-filename');
  const progressPercentage = document.getElementById('drive-upload-percentage');
  const progressBar = document.getElementById('drive-upload-progress-bar');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (file.size > 15 * 1024 * 1024) {
      alert(`El archivo "${file.name}" supera el límite de 15 MB y no será subido.`);
      continue;
    }

    progressContainer.style.display = 'block';
    progressFilename.innerText = `Subiendo: ${file.name} (${i + 1}/${files.length})`;
    progressPercentage.innerText = '0%';
    progressBar.style.width = '0%';

    try {
      const uploadedFile = await uploadFileToDrive(file, folderId, (percent) => {
        progressPercentage.innerText = `${percent}%`;
        progressBar.style.width = `${percent}%`;
      });

      await shareDriveFileOrFolder(uploadedFile.id);

    } catch (err) {
      console.error('Error al subir archivo:', err);
      alert(`Ocurrió un error al subir el archivo "${file.name}": ${err.message}`);
    }
  }

  progressContainer.style.display = 'none';
  document.getElementById('input-drive-file').value = '';

  await refreshDriveFilesList(folderId);
}

// ================= SUMMARY PROFILE MODALS (FICHAS) =================
async function openClientSummaryModal(clientId) {
  const client = State.activeClients.find(c => c.id === clientId);
  if (!client) return;

  // Set basic info
  document.getElementById('client-summary-name').innerText = `Ficha de Cliente: ${client.nombre}`;
  document.getElementById('client-summary-rut').innerText = `RUT / ID: ${client.rut}`;
  document.getElementById('client-summary-phone').innerText = client.telefono || '—';
  document.getElementById('client-summary-email').innerText = client.email || '—';
  document.getElementById('client-summary-date').innerText = `Ingreso: ${client.fechaRegistro}`;
  
  // Set badge status
  const badge = document.getElementById('client-summary-status');
  badge.innerText = client.estado;
  badge.className = 'badge';
  if (client.estado === 'Activo') badge.classList.add('badge-success');
  else if (client.estado === 'Suspendido') badge.classList.add('badge-warning');
  else badge.classList.add('badge-primary');

  // List cases
  const clientCases = State.activeCases.filter(k => k.clientId === clientId);
  const casesContainer = document.getElementById('client-summary-cases-list');
  casesContainer.innerHTML = '';
  
  if (clientCases.length === 0) {
    casesContainer.innerHTML = '<p style="font-size: 13px; color: var(--text-muted); font-style: italic; padding: 10px 0;">No hay causas penales asociadas a este cliente.</p>';
  } else {
    clientCases.forEach(kase => {
      const caseRow = document.createElement('div');
      caseRow.className = 'drive-file-item'; // reuse nice glass row styling
      caseRow.style.margin = '4px 0';
      
      const driveUI = kase.driveLink 
        ? `<a href="${kase.driveLink}" target="_blank" class="drive-link-badge"><i class="fa-brands fa-google-drive"></i> Drive</a>`
        : `<span style="color: var(--text-muted); font-size: 11px;"><i class="fa-solid fa-link-slash"></i> Sin Carpeta</span>`;

      caseRow.innerHTML = `
        <div style="overflow: hidden;">
          <span style="font-weight: 600; color: var(--primary); font-size: 14px;">RIT: ${kase.rit}</span>
          <span style="font-size: 12px; color: var(--text-muted); margin-left: 8px;">${kase.court}</span>
          <div style="font-size: 12px; color: var(--text-main); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${kase.crime}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
          <span class="badge ${kase.status === 'Cerrado' ? 'badge-success' : 'badge-primary'}" style="font-size: 10px;">${kase.status}</span>
          ${driveUI}
        </div>
      `;
      casesContainer.appendChild(caseRow);
    });
  }

  // Financial summary
  const clientPayments = State.activePayments.filter(p => p.clientId === clientId);
  const progressPercentEl = document.getElementById('client-summary-payment-progress');
  const detailsContainer = document.getElementById('client-summary-payments-details');
  
  let totalContracted = 0;
  let totalPending = 0;
  
  detailsContainer.innerHTML = '';
  
  if (clientPayments.length === 0) {
    document.getElementById('client-summary-total-contracted').innerText = '$0';
    document.getElementById('client-summary-total-pending').innerText = '$0';
    progressPercentEl.style.width = '0%';
    detailsContainer.innerHTML = '<p style="font-style: italic; color: var(--text-muted);">No hay planes de pago registrados para este cliente.</p>';
  } else {
    let totalPaid = 0;
    
    clientPayments.forEach(plan => {
      totalContracted += plan.montoTotal;
      let planPending = 0;
      
      plan.detalleCuotas.forEach(cuota => {
        if (cuota.estado === 'Pendiente') {
          totalPending += cuota.monto;
          planPending += cuota.monto;
        } else {
          totalPaid += cuota.monto;
        }
      });

      const planPaid = plan.montoTotal - planPending;
      const planPercent = plan.montoTotal > 0 ? Math.round((planPaid / plan.montoTotal) * 100) : 0;

      const planRow = document.createElement('div');
      planRow.style.display = 'flex';
      planRow.style.justifyContent = 'space-between';
      planRow.style.margin = '4px 0';
      planRow.innerHTML = `
        <span>Plan ID #${plan.id}: Total $${plan.montoTotal.toLocaleString('es-CL')} (Cuotas: ${plan.cuotasPagas}/${plan.cuotasTotales})</span>
        <span style="font-weight: 600; color: var(--success);">Pagado: ${planPercent}%</span>
      `;
      detailsContainer.appendChild(planRow);
    });

    document.getElementById('client-summary-total-contracted').innerText = `$${totalContracted.toLocaleString('es-CL')}`;
    document.getElementById('client-summary-total-pending').innerText = `$${totalPending.toLocaleString('es-CL')}`;
    
    const overallPercent = totalContracted > 0 ? Math.round((totalPaid / totalContracted) * 100) : 0;
    progressPercentEl.style.width = `${overallPercent}%`;
  }

  // Reminders / Hearings timeline
  const remindersTimeline = document.getElementById('client-summary-reminders-timeline');
  remindersTimeline.innerHTML = '';
  
  const clientCaseIds = clientCases.map(k => k.id);
  const clientReminders = State.activeReminders.filter(r => r.caseId !== null && clientCaseIds.includes(r.caseId));
  
  if (clientReminders.length === 0) {
    remindersTimeline.innerHTML = `
      <div style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 13px;">
        <i class="fa-solid fa-calendar-check" style="font-size: 20px; margin-bottom: 4px; display: block; color: var(--text-dark);"></i>
        Sin audiencias ni plazos registrados para este cliente.
      </div>
    `;
  } else {
    clientReminders.sort((a, b) => b.fecha.localeCompare(a.fecha));
    
    clientReminders.forEach(rem => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'flex-start';
      item.style.gap = '10px';
      item.style.padding = '10px 14px';
      item.style.backgroundColor = rem.completado ? 'rgba(16, 185, 129, 0.03)' : 'rgba(255, 255, 255, 0.02)';
      item.style.borderLeft = rem.completado ? '3px solid var(--success)' : '3px solid var(--primary)';
      item.style.borderRadius = '0 var(--radius-sm) var(--radius-sm) 0';
      item.style.margin = '4px 0';
      
      const relatedCase = State.activeCases.find(c => c.id === rem.caseId);
      const caseText = relatedCase ? `(RIT: ${relatedCase.rit})` : '';

      const dateText = new Date(rem.fecha).toLocaleString('es-CL', {
        dateStyle: 'short',
        timeStyle: 'short'
      });

      item.innerHTML = `
        <div style="flex-grow: 1; overflow: hidden;">
          <h6 style="font-size: 13px; font-weight: 600; text-decoration: ${rem.completado ? 'line-through' : 'none'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${rem.titulo} ${caseText}</h6>
          <span style="font-size: 11px; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateText} &bull; ${rem.tipo}</span>
          ${rem.descripcion ? `<p style="font-size: 11px; font-style: italic; color: var(--text-muted); margin-top: 2px;">"${rem.descripcion}"</p>` : ''}
        </div>
        <span class="badge ${rem.completado ? 'badge-success' : 'badge-warning'}" style="font-size: 9px; padding: 2px 6px; flex-shrink: 0; margin-left: 10px;">
          ${rem.completado ? 'Cumplido' : 'Pendiente'}
        </span>
      `;
      remindersTimeline.appendChild(item);
    });
  }

  showModal('modal-client-summary');
}

async function openCaseSummaryModal(caseId) {
  const kase = State.activeCases.find(c => c.id === caseId);
  if (!kase) return;

  const client = State.activeClients.find(c => c.id === kase.clientId);
  const clientName = client ? client.nombre : 'Cliente Desconocido';

  // Set basic info
  document.getElementById('case-summary-rit').innerText = `Causa RIT: ${kase.rit}`;
  document.getElementById('case-summary-client').innerText = `Cliente: ${clientName} (${client ? client.rut : '—'})`;
  document.getElementById('case-summary-court').innerText = kase.court;
  document.getElementById('case-summary-crime').innerText = kase.crime;
  
  // Set badge status
  const badge = document.getElementById('case-summary-status');
  badge.innerText = kase.status;
  badge.className = 'badge';
  if (kase.status === 'Cerrado') badge.classList.add('badge-success');
  else if (kase.status === 'Juicio Oral') badge.classList.add('badge-error');
  else if (kase.status === 'Apelación') badge.classList.add('badge-warning');
  else badge.classList.add('badge-primary');

  // Drive link UI
  const driveContainer = document.getElementById('case-summary-drive');
  driveContainer.innerHTML = kase.driveLink 
    ? `<a href="${kase.driveLink}" target="_blank" class="drive-link-badge"><i class="fa-brands fa-google-drive"></i> Ir a Carpeta Drive</a>`
    : `<span style="color: var(--text-muted); font-size: 13px;"><i class="fa-solid fa-link-slash"></i> Sin carpeta vinculada</span>`;

  // Observations
  const detailsEl = document.getElementById('case-summary-details');
  detailsEl.innerText = kase.details ? kase.details : 'Sin observaciones o detalles defensivos registrados.';

  // Reminders Timeline
  const remindersTimeline = document.getElementById('case-summary-reminders');
  remindersTimeline.innerHTML = '';
  
  const caseReminders = State.activeReminders.filter(r => r.caseId === caseId);
  
  if (caseReminders.length === 0) {
    remindersTimeline.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
        <i class="fa-solid fa-calendar-check" style="font-size: 20px; margin-bottom: 4px; display: block; color: var(--text-dark);"></i>
        Sin hitos procesales ni audiencias agendadas para esta causa.
      </div>
    `;
  } else {
    caseReminders.sort((a, b) => b.fecha.localeCompare(a.fecha));
    
    caseReminders.forEach(rem => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'flex-start';
      item.style.gap = '10px';
      item.style.padding = '10px 14px';
      item.style.backgroundColor = rem.completado ? 'rgba(16, 185, 129, 0.03)' : 'rgba(255, 255, 255, 0.02)';
      item.style.borderLeft = rem.completado ? '3px solid var(--success)' : '3px solid var(--primary)';
      item.style.borderRadius = '0 var(--radius-sm) var(--radius-sm) 0';
      item.style.margin = '4px 0';

      const dateText = new Date(rem.fecha).toLocaleString('es-CL', {
        dateStyle: 'short',
        timeStyle: 'short'
      });

      item.innerHTML = `
        <div style="flex-grow: 1; overflow: hidden;">
          <h6 style="font-size: 13px; font-weight: 600; text-decoration: ${rem.completado ? 'line-through' : 'none'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${rem.titulo}</h6>
          <span style="font-size: 11px; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateText} &bull; ${rem.tipo}</span>
          ${rem.descripcion ? `<p style="font-size: 11px; font-style: italic; color: var(--text-muted); margin-top: 2px;">"${rem.descripcion}"</p>` : ''}
        </div>
        <span class="badge ${rem.completado ? 'badge-success' : 'badge-warning'}" style="font-size: 9px; padding: 2px 6px; flex-shrink: 0; margin-left: 10px;">
          ${rem.completado ? 'Cumplido' : 'Pendiente'}
        </span>
      `;
      remindersTimeline.appendChild(item);
    });
  }

  showModal('modal-case-summary');
}
