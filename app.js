// app.js - Main Application Logic for Control Abogados Penal

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
};

// Initialize DB and load initial data
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Initialize DB and load data
    await refreshStateData();

    // 2. Setup Navigation Event Listeners
    setupNavigation();

    // 3. Setup CRUD Event Listeners (Clients, Cases, Payments, Reminders)
    setupClientsCRUD();
    setupCasesCRUD();
    setupPaymentsCRUD();
    setupRemindersCRUD();

    // 4. Setup File Uploader Event Listeners
    setupFileUploader();

    // 5. Setup Search and Backup System
    setupSettingsAndSearch();

    // 6. Initial render of current view
    renderView(State.currentView);
    updateDashboardStats();
    renderDashboardLists();

    console.log('Aplicación iniciada exitosamente.');
  } catch (error) {
    console.error('Error al inicializar la aplicación:', error);
    alert('Ocurrió un error al cargar la base de datos local. Por favor recarga la página.');
  }
});

// Refresh State data from IndexedDB
async function refreshStateData() {
  State.activeClients = await DB.getAll('clients');
  State.activeCases = await DB.getAll('cases');
  State.activePayments = await DB.getAll('payments');
  State.activeReminders = await DB.getAll('reminders');
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
  });
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
          <button class="btn btn-secondary btn-sm edit-client-btn" data-id="${client.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm delete-client-btn" data-id="${client.id}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach button triggers
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
    const driveLink = document.getElementById('case-drive').value.trim();
    const details = document.getElementById('case-details').value.trim();

    const caseData = { clientId, rit, court, crime, status, driveLink, details };

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
          <button class="btn btn-secondary btn-sm edit-case-btn" data-id="${kase.id}" title="Editar Causa"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm delete-case-btn" data-id="${kase.id}" title="Eliminar Causa"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach button triggers
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
    document.getElementById('case-drive').value = kase.driveLink || '';
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

    const clientId = Number(document.getElementById('payment-client-select').value);
    const montoTotal = Number(document.getElementById('payment-amount').value);
    const cuotasTotales = Number(document.getElementById('payment-installments').value);
    const fechaInicioStr = document.getElementById('payment-start-date').value; // YYYY-MM-DD
    const frecuencia = document.getElementById('payment-frequency').value;

    // Build installment list array
    const detailCuotas = [];
    const cuotaMonto = Math.round(montoTotal / cuotasTotales);
    
    let baseDate = new Date(fechaInicioStr + 'T12:00:00'); // set mid day to avoid timezone shifts

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
      
      detailCuotas.push({
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

    try {
      await DB.add('payments', paymentPlan);
      await refreshStateData();
      hideModal(modalId);
      renderPaymentsTable();
      updateDashboardStats();
    } catch (err) {
      console.error(err);
      alert('Error al registrar el plan de pagos.');
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

  const confirmDelete = confirm(`¿Estás seguro de que deseas eliminar este plan de pagos? Se eliminarán todos los comprobantes asociados.`);
  if (confirmDelete) {
    try {
      await DB.delete('payments', id);
      // Clean up receipts
      const receipts = await DB.getByIndex('receipts', 'paymentId', plan.id);
      for (const r of receipts) {
        await DB.delete('receipts', r.id);
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

    const url = URL.createObjectURL(receipt.file);
    const a = document.createElement('a');
    a.href = url;
    
    // Maintain extension
    const ext = receipt.fileName.split('.').pop();
    a.download = `${proposedName}.${ext}`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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

  // Form Submit
  document.getElementById('form-reminder').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('reminder-id-field').value;
    const caseId = document.getElementById('reminder-case-select').value ? Number(document.getElementById('reminder-case-select').value) : null;
    const titulo = document.getElementById('reminder-title').value.trim();
    const fecha = document.getElementById('reminder-date').value; // YYYY-MM-DDTHH:MM
    const tipo = document.getElementById('reminder-type').value;
    const descripcion = document.getElementById('reminder-details').value.trim();

    const reminderData = { caseId, titulo, fecha, tipo, descripcion, completado: false };

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

function openNewReminderModal(prefilledDate = '') {
  document.getElementById('modal-reminder-title').innerText = 'Programar Fecha Importante';
  document.getElementById('form-reminder').reset();
  document.getElementById('reminder-id-field').value = '';
  
  // Populate cases selector
  const select = document.getElementById('reminder-case-select');
  select.innerHTML = '<option value="">Ninguno (Hito general sin juicio)</option>';
  State.activeCases.forEach(kase => {
    const client = State.activeClients.find(c => c.id === kase.clientId);
    const clientName = client ? client.nombre : 'Cliente Desconocido';
    const opt = document.createElement('option');
    opt.value = kase.id;
    opt.innerText = `Causa: ${kase.rit} - ${clientName}`;
    select.appendChild(opt);
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
