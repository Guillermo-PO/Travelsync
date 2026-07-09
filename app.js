/* ==========================================================================
   TripSync — app.js (Firebase Firestore Optimizado)
   ========================================================================== */

/* 1. PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE */
const firebaseConfig = {
  apiKey: "AIzaSyAyI0hZ3Kt4wpW_e3_uJ6tWmrE_8aOj_Zc",
  authDomain: "tripsync-58ded.firebaseapp.com",
  databaseURL: "https://tripsync-58ded-default-rtdb.firebaseio.com",
  projectId: "tripsync-58ded",
  storageBucket: "tripsync-58ded.firebasestorage.app",
  messagingSenderId: "854250106343",
  appId: "1:854250106343:web:8f8249f22bccd21dffe142",
  measurementId: "G-NJMT0T765X"
};

// Inicializar Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// 🚀 SOLUCIÓN: Persistencia Multi-Pestaña para la versión "Compat"
db.enablePersistence({ synchronizeTabs: true }).catch(function(err) {
  console.warn("Error de persistencia:", err.code);
});

/* --------------------------------------------------------------------------
 * 2. STATE & VARIABLES
 * ------------------------------------------------------------------------ */
let currentTripCode = null;
let currentUserName = null;
let events = [];
let unsubscribe = null; 
let openNotesId = null; 
let activeDate = null; // Guardará el día que estamos viendo

// --- Gastos (expenses) state ---
let travelersList = []; // nombres de todos los viajeros del viaje actual
let expenses = [];
let settlements = [];
let tripCurrency = "MXN";
let activeExpenseTab = "balance"; // 'balance' | 'list'
let activeSplitMethod = "equitativo"; // 'equitativo' | 'exacto' | 'porcentaje'
let unsubscribeExpenses = null;
let unsubscribeSettlements = null;
let unsubscribeTripConfig = null;
let unsubscribeTravelersGlobal = null;
let pendingSettleDebt = null; // { de, para, monto } mientras se confirma en el sheet

const EXPENSE_CATEGORIES = [
  { id: "comida", label: "Comida", emoji: "🍔" },
  { id: "transporte", label: "Transporte", emoji: "🚕" },
  { id: "alojamiento", label: "Alojamiento", emoji: "🏨" },
  { id: "actividades", label: "Actividades", emoji: "🎟️" },
  { id: "compras", label: "Compras", emoji: "🛍️" },
  { id: "otros", label: "Otros", emoji: "📦" },
];

function categoryEmoji(id) {
  return (EXPENSE_CATEGORIES.find((c) => c.id === id) || EXPENSE_CATEGORIES[5]).emoji;
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: tripCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch (_) {
    return `${tripCurrency} ${n.toFixed(2)}`;
  }
}

// Redondeo seguro a centavos para evitar errores de punto flotante
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

const LS_KEYS = {
  tripCode: "tripsync_trip_code",
  userName: "tripsync_user_name",
  userToken: "tripsync_user_token", // 🚀 NUEVO: El pase de abordar invisible
  cachedEvents: "tripsync_cached_events_",
  cachedExpenses: "tripsync_cached_expenses_",
  cachedSettlements: "tripsync_cached_settlements_",
  cachedCurrency: "tripsync_cached_currency_",
};

/* --------------------------------------------------------------------------
 * 3. DOM REFERENCES
 * ------------------------------------------------------------------------ */
const el = {
  screens: {
    splash: document.getElementById("screen-splash"),
    login: document.getElementById("screen-login"),
    timeline: document.getElementById("screen-timeline"),
    expenses: document.getElementById("screen-expenses"),
  },
  offlineBanner: document.getElementById("offline-banner"),
  livePill: document.getElementById("live-pill"),
  labelTripCode: document.getElementById("label-trip-code"),
  dayTabs: document.getElementById("day-tabs"),
  topbarLeft: document.querySelector(".topbar-left"),
  hubBackdrop: document.getElementById("hub-backdrop"),
  sheetHub: document.getElementById("sheet-hub"),
  btnCloseHub: document.getElementById("btn-close-hub"),
  travelersContainer: document.getElementById("travelers-container"),
  formRule: document.getElementById("form-rule"),
  inputRule: document.getElementById("input-rule"),
  rulesContainer: document.getElementById("rules-container"),

  confirmBackdrop: document.getElementById("confirm-backdrop"),
  sheetConfirm: document.getElementById("sheet-confirm"),
  confirmTitle: document.getElementById("confirm-title"),
  confirmDesc: document.getElementById("confirm-description"),
  btnCancelConfirm: document.getElementById("btn-cancel-confirm"),
  btnOkConfirm: document.getElementById("btn-ok-confirm"),

  pinBackdrop: document.getElementById("pin-backdrop"),
  sheetPin: document.getElementById("sheet-pin"),
  pinTitle: document.getElementById("pin-title"),
  pinDesc: document.getElementById("pin-description"),
  formPin: document.getElementById("form-pin"),
  inputPin: document.getElementById("input-pin"),
  btnCancelPin: document.getElementById("btn-cancel-pin"),

  formLogin: document.getElementById("form-login"),
  inputTripCode: document.getElementById("input-trip-code"),
  inputUserName: document.getElementById("input-user-name"),
  btnJoin: document.getElementById("btn-join"),

  timelineContainer: document.getElementById("timeline-container"),
  btnAddEvent: document.getElementById("btn-add-event"),
  btnLeave: document.getElementById("btn-leave"),

  sheetBackdrop: document.getElementById("sheet-backdrop"),
  sheet: document.getElementById("sheet-event"),
  sheetTitle: document.getElementById("sheet-title"),
  btnCloseSheet: document.getElementById("btn-close-sheet"),
  formEvent: document.getElementById("form-event"),
  inputEventId: document.getElementById("input-event-id"),
  inputFecha: document.getElementById("input-fecha"),
  inputHora: document.getElementById("input-hora"),
  inputTitulo: document.getElementById("input-titulo"),
  inputUbicacion: document.getElementById("input-ubicacion"),
  inputNotas: document.getElementById("input-notas"),
  formError: document.getElementById("form-error"),
  btnDeleteEvent: document.getElementById("btn-delete-event"),
  toastContainer: document.getElementById("toast-container"),

  // Bottom tabbar
  bottomTabbar: document.getElementById("bottom-tabbar"),
  tabbtnItinerario: document.getElementById("tabbtn-itinerario"),
  tabbtnGastos: document.getElementById("tabbtn-gastos"),

  // Expenses screen
  expensesTopbarLeft: document.getElementById("expenses-topbar-left"),
  labelTripCodeExpenses: document.getElementById("label-trip-code-expenses"),
  selectCurrency: document.getElementById("select-currency"),
  tabBalance: document.getElementById("tab-balance"),
  tabList: document.getElementById("tab-list"),
  expensesBalanceView: document.getElementById("expenses-balance-view"),
  expensesListView: document.getElementById("expenses-list-view"),
  summaryRow: document.getElementById("summary-row"),
  debtsContainer: document.getElementById("debts-container"),
  balancesContainer: document.getElementById("balances-container"),
  expensesListContainer: document.getElementById("expenses-list-container"),
  btnAddExpense: document.getElementById("btn-add-expense"),

  // Expense sheet
  expenseSheetBackdrop: document.getElementById("expense-sheet-backdrop"),
  sheetExpense: document.getElementById("sheet-expense"),
  expenseSheetTitle: document.getElementById("expense-sheet-title"),
  btnCloseExpenseSheet: document.getElementById("btn-close-expense-sheet"),
  formExpense: document.getElementById("form-expense"),
  inputExpenseId: document.getElementById("input-expense-id"),
  inputExpenseDesc: document.getElementById("input-expense-desc"),
  inputExpenseAmount: document.getElementById("input-expense-amount"),
  inputExpenseDate: document.getElementById("input-expense-date"),
  categoryGrid: document.getElementById("category-grid"),
  inputExpenseCategory: document.getElementById("input-expense-category"),
  selectExpensePayer: document.getElementById("select-expense-payer"),
  splitMethodTabs: document.getElementById("split-method-tabs"),
  participantsContainer: document.getElementById("participants-container"),
  splitHint: document.getElementById("split-hint"),
  expenseFormError: document.getElementById("expense-form-error"),
  btnDeleteExpense: document.getElementById("btn-delete-expense"),

  // Settle sheet
  sheetSettle: document.getElementById("sheet-settle"),
  btnCloseSettleSheet: document.getElementById("btn-close-settle-sheet"),
  formSettle: document.getElementById("form-settle"),
  settleDescription: document.getElementById("settle-description"),
  inputSettleAmount: document.getElementById("input-settle-amount"),
};

/* --------------------------------------------------------------------------
 * 4. UTILITIES
 * ------------------------------------------------------------------------ */
function showScreen(name) {
  Object.values(el.screens).forEach((s) => s.classList.remove("active"));
  el.screens[name].classList.add("active");
}

function toast(message, type = "info") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  el.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 2900);
}

function sanitizeTripCode(raw) {
  return raw.trim().toUpperCase().replace(/\s+/g, "-").slice(0, 24);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function formatLongDate(dateStr) {
  // 🚀 EVITA EL CRASHEO: Si la fecha viene vacía o corrupta desde Firebase, pon un comodín seguro.
  if (!dateStr || typeof dateStr !== "string" || !dateStr.includes("-")) {
    return "Día Especial";
  }
  
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]} ${d} de ${MONTHS[m - 1]}`;
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

function locationIconSvg() { return '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>'; }
function chevronSvg() { return '<svg viewBox="0 0 24 24"><path d="M12 15.5l-6-6 1.41-1.41L12 12.67l4.59-4.58L18 9.5z"/></svg>'; }

function linkify(text) {
  if (!text) return "";
  // 1. Escapamos el HTML primero por seguridad (para que no inyecten código malicioso)
  const safeText = escapeHtml(text);
  // 2. Buscamos cualquier texto que empiece con http:// o https://
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  // 3. Lo reemplazamos por un enlace real con diseño
  return safeText.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-teal); text-decoration: underline; word-break: break-all;">${url}</a>`;
  });
}

function editIconSvg() { return '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>'; }

function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function requestPinUI(title, description) {
  return new Promise((resolve) => {
    // 1. Configuramos los textos
    el.pinTitle.textContent = title;
    el.pinDesc.innerHTML = description; 
    el.inputPin.value = "";

    // 2. Abrimos el panel visualmente
    el.pinBackdrop.classList.remove("hidden");
    requestAnimationFrame(() => {
      el.pinBackdrop.classList.add("visible");
      el.sheetPin.classList.add("open");
      el.inputPin.focus(); // Intenta abrir el teclado de inmediato
    });

    // 3. Función interna para cerrar y limpiar memoria
    const closeAndResolve = (value) => {
      el.pinBackdrop.classList.remove("visible");
      el.sheetPin.classList.remove("open");
      el.sheetPin.setAttribute("aria-hidden", "true");
      setTimeout(() => el.pinBackdrop.classList.add("hidden"), 220);
      
      el.formPin.removeEventListener("submit", handleSubmit);
      el.btnCancelPin.removeEventListener("click", handleCancel);
      
      resolve(value); 
    };

    // 4. Listeners temporales
    const handleSubmit = (e) => {
      e.preventDefault();
      closeAndResolve(el.inputPin.value);
    };
    const handleCancel = () => {
      closeAndResolve(null);
    };

    el.formPin.addEventListener("submit", handleSubmit);
    el.btnCancelPin.addEventListener("click", handleCancel);
  });
}

function requestConfirmUI(title, description, okText = "Confirmar", isDanger = false) {
  return new Promise((resolve) => {
    // 1. Configuramos los textos
    el.confirmTitle.textContent = title;
    el.confirmDesc.innerHTML = description;
    el.btnOkConfirm.textContent = okText;
    
    // Si es una acción peligrosa (como salir o borrar), el botón se pone rojo
    if (isDanger) {
      el.btnOkConfirm.style.background = "var(--danger)";
      el.btnOkConfirm.style.color = "#fff";
    } else {
      el.btnOkConfirm.style.background = "var(--accent-teal)";
      el.btnOkConfirm.style.color = "#FBFEFE";
    }

    // 2. Abrimos el panel visualmente
    el.confirmBackdrop.classList.remove("hidden");
    requestAnimationFrame(() => {
      el.confirmBackdrop.classList.add("visible");
      el.sheetConfirm.classList.add("open");
    });

    // 3. Lógica para cerrar y devolver la respuesta (true/false)
    const closeAndResolve = (value) => {
      el.confirmBackdrop.classList.remove("visible");
      el.sheetConfirm.classList.remove("open");
      el.sheetConfirm.setAttribute("aria-hidden", "true");
      setTimeout(() => el.confirmBackdrop.classList.add("hidden"), 220);
      
      el.btnOkConfirm.removeEventListener("click", handleOk);
      el.btnCancelConfirm.removeEventListener("click", handleCancel);
      resolve(value);
    };

    const handleOk = () => closeAndResolve(true);
    const handleCancel = () => closeAndResolve(false);

    el.btnOkConfirm.addEventListener("click", handleOk);
    el.btnCancelConfirm.addEventListener("click", handleCancel);
  });
}

/* --------------------------------------------------------------------------
 * 5. LOGIN FLOW (Anti-Clones con PIN)
 * ------------------------------------------------------------------------ */
async function handleLoginSubmit(e) {
  e.preventDefault();
  const tripCode = sanitizeTripCode(el.inputTripCode.value);
  const userName = el.inputUserName.value.trim();

  if (!tripCode || !userName) {
    toast("Completa ambos campos", "error");
    return;
  }

  const originalBtnText = el.btnJoin.innerHTML;
  el.btnJoin.innerHTML = '<div class="btn-spinner"></div>';
  el.btnJoin.disabled = true;

  if (!navigator.onLine) {
    joinTrip(tripCode, userName);
    return;
  }

  try {
    let localToken = localStorage.getItem(LS_KEYS.userToken);
    if (!localToken) {
      localToken = generateToken();
    }

    const travelerRef = db.collection("viajeros").doc(tripCode + "_" + userName.toLowerCase());
    const doc = await travelerRef.get();

    if (doc.exists) {
      const data = doc.data();
      
      // Si el nombre existe pero el token es de otro dispositivo...
      if (data.token !== localToken) {
        el.btnJoin.innerHTML = originalBtnText;
        el.btnJoin.disabled = false;
        
        // 🚀 SE USA EL PANEL VISUAL EN LUGAR DE PROMPT()
        const pinAttempt = await requestPinUI(
          "Vincular dispositivo",
          `El nombre <b>${escapeHtml(userName)}</b> ya está en el viaje.<br>Ingresa el PIN para sincronizar:`
        );        
        if (pinAttempt === null) return; // Si cancela
        
        if (pinAttempt.trim() === data.pin) {
          localToken = data.token;
          localStorage.setItem(LS_KEYS.userToken, localToken);
          toast("Dispositivos sincronizados", "success");
          
          el.btnJoin.innerHTML = '<div class="btn-spinner"></div>';
          el.btnJoin.disabled = true;
          
          await travelerRef.update({ last_active: firebase.firestore.FieldValue.serverTimestamp() });
        } else {
          toast("PIN incorrecto. Intenta usar otro nombre o apodo.", "error");
          return;
        }
      } else {
        await travelerRef.update({ last_active: firebase.firestore.FieldValue.serverTimestamp() });
      }
    } else {
      // VIAJERO NUEVO: Le pedimos que invente un PIN
      el.btnJoin.innerHTML = originalBtnText;
      el.btnJoin.disabled = false;
      
      // 🚀 SE USA EL PANEL VISUAL EN LUGAR DE PROMPT()
      let newPin = await requestPinUI(
        "Protege tu nombre",
        `¡Hola <b>${escapeHtml(userName)}</b>!<br>Crea un PIN numérico corto. Lo usarás si necesitas conectarte desde otro dispositivo:`
      );      
      if (newPin === null || newPin.trim() === "") {
        toast("Debes crear un PIN para unirte al viaje.", "error");
        return;
      }
      
      el.btnJoin.innerHTML = '<div class="btn-spinner"></div>';
      el.btnJoin.disabled = true;

      await travelerRef.set({
        codigo_viaje: tripCode,
        nombre: userName,
        token: localToken,
        pin: newPin.trim(),
        joined_at: firebase.firestore.FieldValue.serverTimestamp(),
        last_active: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    localStorage.setItem(LS_KEYS.userToken, localToken);
    joinTrip(tripCode, userName);

  } catch (err) {
    console.error("Error validando viajero:", err);
    toast("Hubo un error de conexión. Intenta de nuevo.", "error");
    el.btnJoin.innerHTML = originalBtnText;
    el.btnJoin.disabled = false;
  }
}

function joinTrip(tripCode, userName) {
  currentTripCode = tripCode;
  currentUserName = userName;
  localStorage.setItem(LS_KEYS.tripCode, tripCode);
  localStorage.setItem(LS_KEYS.userName, userName);

  el.btnJoin.innerHTML = 'Unirse al viaje';
  el.btnJoin.disabled = false;

  if (navigator.onLine) {
    subscribeRealtime();
    subscribeTravelersGlobal();
    subscribeExpensesRealtime();
    subscribeSettlementsRealtime();
    subscribeTripConfigRealtime();
  } else {
    loadCachedEvents();
    loadCachedExpenses();
    loadCachedSettlements();
    loadCachedCurrency();
    if (!travelersList.includes(currentUserName)) travelersList.push(currentUserName);
    toast("Modo sin conexión a Firebase", "info");
  }

  enterTimelineScreen();
}

function enterTimelineScreen() {
  el.labelTripCode.textContent = `VIAJE · ${currentTripCode}`;
  el.labelTripCodeExpenses.textContent = `VIAJE · ${currentTripCode}`;
  el.bottomTabbar.classList.remove("hidden");
  switchMainTab("timeline");
  renderItinerary();
}

async function leaveTrip() {
  // 🚀 UX FIX: Usamos nuestra propia UI en lugar del confirm() nativo de iOS
  const isConfirmed = await requestConfirmUI(
    "Salir del viaje",
    "¿Estás seguro que quieres cerrar la sesión de este itinerario? Tendrás que volver a ingresar con el código de tu grupo.",
    "Sí, salir",
    true // true activa el botón rojo de peligro
  );

  if (!isConfirmed) return; // Si toca cancelar, la app sigue normal

  // Si confirma, ejecutamos la limpieza
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (unsubscribeExpenses) { unsubscribeExpenses(); unsubscribeExpenses = null; }
  if (unsubscribeSettlements) { unsubscribeSettlements(); unsubscribeSettlements = null; }
  if (unsubscribeTripConfig) { unsubscribeTripConfig(); unsubscribeTripConfig = null; }
  if (unsubscribeTravelersGlobal) { unsubscribeTravelersGlobal(); unsubscribeTravelersGlobal = null; }
  
  localStorage.removeItem(LS_KEYS.tripCode);
  localStorage.removeItem(LS_KEYS.userName);
  currentTripCode = null;
  currentUserName = null;
  events = [];
  expenses = [];
  settlements = [];
  travelersList = [];
  tripCurrency = "MXN";
  
  el.inputTripCode.value = "";
  el.inputUserName.value = "";
  el.bottomTabbar.classList.add("hidden");
  showScreen("login");
}

/* --------------------------------------------------------------------------
 * BOTTOM TABBAR — cambia entre Itinerario y Gastos
 * ------------------------------------------------------------------------ */
function switchMainTab(screenName) {
  showScreen(screenName);
  el.tabbtnItinerario.classList.toggle("active", screenName === "timeline");
  el.tabbtnGastos.classList.toggle("active", screenName === "expenses");
  if (screenName === "expenses") {
    renderExpensesScreen();
  }
}
/* --------------------------------------------------------------------------
 * 6. DATA — Realtime con Firebase
 * ------------------------------------------------------------------------ */
function subscribeRealtime() {
  if (!currentTripCode) return;
  
  if (unsubscribe) unsubscribe();
  
  const pill = el.livePill;
  pill.classList.remove("offline");
  pill.innerHTML = '<span class="live-dot"></span> Sincronizando...';

  unsubscribe = db.collection("itinerarios")
    .where("codigo_viaje", "==", currentTripCode)
    .onSnapshot((querySnapshot) => {
      events = [];
      querySnapshot.forEach((doc) => {
        events.push({ id: doc.id, ...doc.data() });
      });
      
      events.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
      
      cacheEvents();
      renderItinerary();
      
      pill.classList.remove("offline");
      pill.innerHTML = '<span class="live-dot"></span> En vivo';
    }, (error) => {
      console.error("Error suscribiéndose:", error);
      pill.classList.add("offline");
      pill.innerHTML = '<span class="live-dot"></span> Error de conexión';
      loadCachedEvents();
      renderItinerary();
    });
}

function cacheEvents() {
  if (!currentTripCode) return;
  try {
    localStorage.setItem(LS_KEYS.cachedEvents + currentTripCode, JSON.stringify(events));
  } catch (_) { }
}

function loadCachedEvents() {
  if (!currentTripCode) return;
  try {
    const raw = localStorage.getItem(LS_KEYS.cachedEvents + currentTripCode);
    events = raw ? JSON.parse(raw) : [];
  } catch (_) { events = []; }
}

/* --------------------------------------------------------------------------
 * GASTOS — Realtime, caché offline y configuración de moneda
 * ------------------------------------------------------------------------ */
function subscribeExpensesRealtime() {
  if (!currentTripCode) return;
  if (unsubscribeExpenses) unsubscribeExpenses();

  unsubscribeExpenses = db.collection("gastos")
    .where("codigo_viaje", "==", currentTripCode)
    .onSnapshot((querySnapshot) => {
      expenses = [];
      querySnapshot.forEach((doc) => expenses.push({ id: doc.id, ...doc.data() }));
      expenses.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
      cacheExpenses();
      if (currentTripCode) renderExpensesScreen();
    }, (error) => {
      console.error("Error suscribiéndose a gastos:", error);
      loadCachedExpenses();
      renderExpensesScreen();
    });
}

function subscribeSettlementsRealtime() {
  if (!currentTripCode) return;
  if (unsubscribeSettlements) unsubscribeSettlements();

  unsubscribeSettlements = db.collection("liquidaciones")
    .where("codigo_viaje", "==", currentTripCode)
    .onSnapshot((querySnapshot) => {
      settlements = [];
      querySnapshot.forEach((doc) => settlements.push({ id: doc.id, ...doc.data() }));
      cacheSettlements();
      if (currentTripCode) renderExpensesScreen();
    }, (error) => {
      console.error("Error suscribiéndose a liquidaciones:", error);
      loadCachedSettlements();
      renderExpensesScreen();
    });
}

function subscribeTripConfigRealtime() {
  if (!currentTripCode) return;
  if (unsubscribeTripConfig) unsubscribeTripConfig();

  unsubscribeTripConfig = db.collection("viajes").doc(currentTripCode)
    .onSnapshot((doc) => {
      if (doc.exists && doc.data().moneda) {
        tripCurrency = doc.data().moneda;
        try { localStorage.setItem(LS_KEYS.cachedCurrency + currentTripCode, tripCurrency); } catch (_) {}
        el.selectCurrency.value = tripCurrency;
        if (currentTripCode) renderExpensesScreen();
      }
    }, (error) => {
      console.error("Error leyendo configuración del viaje:", error);
    });
}

function handleCurrencyChange() {
  const nuevaMoneda = el.selectCurrency.value;
  tripCurrency = nuevaMoneda;
  renderExpensesScreen();
  if (!currentTripCode) return;
  db.collection("viajes").doc(currentTripCode).set({ moneda: nuevaMoneda }, { merge: true })
    .catch((err) => {
      console.error("Error guardando moneda:", err);
      toast("No se pudo guardar la moneda (sin conexión)", "error");
    });
}

function cacheExpenses() {
  if (!currentTripCode) return;
  try { localStorage.setItem(LS_KEYS.cachedExpenses + currentTripCode, JSON.stringify(expenses)); } catch (_) {}
}
function loadCachedExpenses() {
  if (!currentTripCode) return;
  try {
    const raw = localStorage.getItem(LS_KEYS.cachedExpenses + currentTripCode);
    expenses = raw ? JSON.parse(raw) : [];
  } catch (_) { expenses = []; }
}
function cacheSettlements() {
  if (!currentTripCode) return;
  try { localStorage.setItem(LS_KEYS.cachedSettlements + currentTripCode, JSON.stringify(settlements)); } catch (_) {}
}
function loadCachedSettlements() {
  if (!currentTripCode) return;
  try {
    const raw = localStorage.getItem(LS_KEYS.cachedSettlements + currentTripCode);
    settlements = raw ? JSON.parse(raw) : [];
  } catch (_) { settlements = []; }
}
function loadCachedCurrency() {
  if (!currentTripCode) return;
  try {
    const raw = localStorage.getItem(LS_KEYS.cachedCurrency + currentTripCode);
    tripCurrency = raw || "MXN";
    el.selectCurrency.value = tripCurrency;
  } catch (_) { tripCurrency = "MXN"; }
}

/* --------------------------------------------------------------------------
 * GASTOS — Cálculo de balances y simplificación de deudas
 * ------------------------------------------------------------------------ */
function computeBalances() {
  // net[nombre] > 0  => le deben esa cantidad (pagó de más)
  // net[nombre] < 0  => debe esa cantidad (le pagaron de menos)
  const net = {};
  const ensure = (name) => { if (!(name in net)) net[name] = 0; };

  travelersList.forEach(ensure);

  expenses.forEach((ev) => {
    ensure(ev.pagado_por);
    net[ev.pagado_por] += Number(ev.monto) || 0;
    (ev.participantes || []).forEach((p) => {
      ensure(p.nombre);
      net[p.nombre] -= Number(p.monto) || 0;
    });
  });

  settlements.forEach((s) => {
    ensure(s.de);
    ensure(s.para);
    net[s.de] += Number(s.monto) || 0;
    net[s.para] -= Number(s.monto) || 0;
  });

  Object.keys(net).forEach((k) => { net[k] = round2(net[k]); });
  return net;
}

// Algoritmo goloso: minimiza el número de transacciones necesarias para saldar todo
function simplifyDebts(net) {
  const creditors = [];
  const debtors = [];
  Object.entries(net).forEach(([nombre, monto]) => {
    if (monto > 0.005) creditors.push({ nombre, monto });
    else if (monto < -0.005) debtors.push({ nombre, monto: -monto });
  });
  creditors.sort((a, b) => b.monto - a.monto);
  debtors.sort((a, b) => b.monto - a.monto);

  const transactions = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pago = Math.min(debtors[i].monto, creditors[j].monto);
    if (pago > 0.005) {
      transactions.push({ de: debtors[i].nombre, para: creditors[j].nombre, monto: round2(pago) });
    }
    debtors[i].monto = round2(debtors[i].monto - pago);
    creditors[j].monto = round2(creditors[j].monto - pago);
    if (debtors[i].monto <= 0.005) i++;
    if (creditors[j].monto <= 0.005) j++;
  }
  return transactions;
}

function subscribeTravelersGlobal() {
  if (!currentTripCode) return;
  if (unsubscribeTravelersGlobal) unsubscribeTravelersGlobal();

  unsubscribeTravelersGlobal = db.collection("viajeros")
    .where("codigo_viaje", "==", currentTripCode)
    .onSnapshot((querySnapshot) => {
      const names = [];
      querySnapshot.forEach((doc) => names.push(doc.data().nombre));
      // Aseguramos que el usuario actual siempre aparezca, incluso si su doc tarda en llegar
      if (currentUserName && !names.includes(currentUserName)) names.push(currentUserName);
      travelersList = names;

      // Refresca los "pills" del Hub si está abierto
      if (el.travelersContainer) {
        el.travelersContainer.innerHTML = "";
        if (names.length === 0) {
          el.travelersContainer.innerHTML = `<p style="font-size:0.9rem; color:var(--muted);">No hay otros viajeros aún.</p>`;
        } else {
          names.forEach((nombre) => {
            const pill = document.createElement("span");
            pill.className = "traveler-pill";
            pill.innerHTML = `<span class="traveler-dot"></span> ${escapeHtml(nombre)}`;
            el.travelersContainer.appendChild(pill);
          });
        }
      }
    }, (error) => {
      console.error("Error cargando viajeros:", error);
    });
}

/* --------------------------------------------------------------------------
 * 7. RENDER
 * ------------------------------------------------------------------------ */
function renderItinerary() {
  const container = el.timelineContainer;
  container.innerHTML = "";

  if (!events.length) {
    el.dayTabs.classList.add("hidden");
    container.innerHTML = `
      <div class="empty-state" style="margin-top: 40px; padding: 0 10px;">
        <div style="background: var(--surface); padding: 32px 20px; border-radius: var(--radius-md); border: 1px dashed var(--border-strong); box-shadow: var(--shadow-sm);">
          <svg viewBox="0 0 24 24" style="width: 54px; height: 54px; margin: 0 auto 16px; color: var(--accent-gold);"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>
          <h3 style="font-family: var(--font-display); font-size: 1.3rem; color: var(--ink); margin-bottom: 8px;">El lienzo está en blanco</h3>
          <p style="font-size: 0.95rem; color: var(--muted); line-height: 1.5; margin-bottom: 24px;">
            Un viaje siempre es mejor bien organizado. Comienza a trazar la ruta de la aventura.
          </p>
          <button class="btn btn-primary" onclick="openSheetForCreate()" style="padding: 12px 24px; font-size: 0.95rem; width: 100%;">
            + Agregar el primer plan
          </button>
        </div>
      </div>`;
    return;
  }

  const uniqueDates = [...new Set(events.map(e => e.fecha))].sort();

  if (!activeDate || !uniqueDates.includes(activeDate)) {
    const today = new Date().toISOString().slice(0, 10);
    if (uniqueDates.includes(today)) {
      activeDate = today;
    } else {
      activeDate = uniqueDates[0];
    }
  }

  renderDayTabs(uniqueDates);

  const dayEvents = events.filter(e => e.fecha === activeDate);
  const dayIndex = uniqueDates.indexOf(activeDate) + 1;

  const dayEl = document.createElement("div");
  dayEl.className = "day-group";
  dayEl.innerHTML = `
    <div class="day-heading">
      <span class="day-index">DÍA ${dayIndex}</span>
      <span class="day-date">${formatLongDate(activeDate)}</span>
    </div>
    <div class="day-route">
      ${dayEvents.map(renderEventCard).join("")}
    </div>
  `;
  container.appendChild(dayEl);

  attachCardListeners();
}

function renderDayTabs(dates) {
  el.dayTabs.classList.remove("hidden");
  
  el.dayTabs.innerHTML = dates.map((d, i) => `
    <button class="day-tab ${d === activeDate ? 'active' : ''}" onclick="setActiveDate('${d}')">
      Día ${i + 1}
    </button>
  `).join('');

  // Scroll matemático seguro para móviles (Evita que la pantalla se congele)
  setTimeout(() => {
    const activeTab = el.dayTabs.querySelector('.active');
    if (activeTab) {
      const tabCenter = activeTab.offsetLeft + (activeTab.clientWidth / 2);
      const containerCenter = el.dayTabs.clientWidth / 2;
      el.dayTabs.scrollTo({
        left: tabCenter - containerCenter,
        behavior: 'smooth'
      });
    }
  }, 50);
}

// Hace la función global para los botones
window.setActiveDate = function(date) {
  activeDate = date;
  renderItinerary();
}

function renderEventCard(ev) {
  const hasNotes = !!(ev.notas && ev.notas.trim());
  const isOpen = openNotesId === ev.id;
  return `
    <article class="event-card" data-id="${ev.id}">
      <div class="event-main" ${hasNotes ? 'data-role="toggle-notes" style="cursor: pointer;"' : ''}>
        <span class="event-time">${formatTime(ev.hora)}</span>
        <div class="event-body">
          <h3 class="event-title">${escapeHtml(ev.titulo)}</h3>
          ${ev.ubicacion ? `<p class="event-location">${locationIconSvg()} ${escapeHtml(ev.ubicacion)}</p>` : ""}
          ${ev.creado_por ? `<p class="event-author">Agregado por ${escapeHtml(ev.creado_por)}</p>` : ""}
          ${hasNotes && !isOpen ? `<p class="event-author" style="color: var(--accent-teal); margin-top: 4px; font-weight: 500;">Toca para ver detalles...</p>` : ""}
        </div>
        <div class="event-meta">
          <button class="event-edit-btn" data-role="edit-trigger" aria-label="Editar evento">${editIconSvg()}</button>
        </div>
      </div>
      ${hasNotes ? `
      <div class="event-notes ${isOpen ? "open" : ""}">
        <div class="event-notes-inner">${linkify(ev.notas)}</div>
      </div>` : ""}
    </article>
  `;
}

function attachCardListeners() {
  el.timelineContainer.querySelectorAll(".event-card").forEach((card) => {
    const id = card.dataset.id;
    
    // 1. Escuchar el clic en el botón de editar (El lápiz)
    const editTrigger = card.querySelector('[data-role="edit-trigger"]');
    editTrigger?.addEventListener("click", (e) => {
      e.stopPropagation(); // Evita que el clic abra/cierre las notas
      openSheetForEdit(id);
    });

    // 2. Escuchar el clic en toda la tarjeta (para abrir notas)
    const toggleBtn = card.querySelector('[data-role="toggle-notes"]');
    toggleBtn?.addEventListener("click", (e) => {
      // Si tocaron accidentalmente cerca del botón de editar, no hacemos nada
      if (e.target.closest('[data-role="edit-trigger"]')) return;
      openNotesId = openNotesId === id ? null : id;
      renderItinerary();
    });
  });
}
/* --------------------------------------------------------------------------
 * 7b. RENDER — Pantalla de Gastos
 * ------------------------------------------------------------------------ */
window.setActiveExpenseTab = function (tab) {
  activeExpenseTab = tab;
  el.tabBalance.classList.toggle("active", tab === "balance");
  el.tabList.classList.toggle("active", tab === "list");
  el.expensesBalanceView.classList.toggle("hidden", tab !== "balance");
  el.expensesListView.classList.toggle("hidden", tab !== "list");
};

function renderExpensesScreen() {
  if (!currentTripCode) return;

  const totalGastado = expenses.reduce((sum, ev) => sum + (Number(ev.monto) || 0), 0);
  const net = computeBalances();
  const miBalance = net[currentUserName] || 0;

  // --- Tarjetas resumen ---
  const balanceClass = miBalance > 0.5 ? "positive" : miBalance < -0.5 ? "negative" : "";
  const balanceLabel = miBalance > 0.5
    ? `Te deben ${formatCurrency(miBalance)}`
    : miBalance < -0.5
      ? `Debes ${formatCurrency(-miBalance)}`
      : "Estás al día";

  el.summaryRow.innerHTML = `
    <div class="summary-card">
      <p class="summary-label">Gastado en total</p>
      <p class="summary-value">${formatCurrency(totalGastado)}</p>
      <p class="summary-sub">${expenses.length} gasto${expenses.length === 1 ? "" : "s"} registrado${expenses.length === 1 ? "" : "s"}</p>
    </div>
    <div class="summary-card ${balanceClass}">
      <p class="summary-label">Tu balance</p>
      <p class="summary-value">${miBalance === 0 ? formatCurrency(0) : formatCurrency(Math.abs(miBalance))}</p>
      <p class="summary-sub">${balanceLabel}</p>
    </div>
  `;

  // --- Deudas simplificadas ---
  const debts = simplifyDebts(net);
  if (debts.length === 0) {
    el.debtsContainer.innerHTML = `<div class="debts-empty">🎉 Todo está saldado. Nadie le debe nada a nadie.</div>`;
  } else {
    el.debtsContainer.innerHTML = debts.map((d, i) => `
      <div class="debt-item" data-index="${i}">
        <div class="debt-flow">
          <span class="debt-name">${escapeHtml(d.de)}</span>
          <svg class="debt-arrow" viewBox="0 0 24 24"><path d="M4 11v2h12l-5.5 5.5 1.42 1.42L19.84 12l-7.92-7.92L10.5 5.5 16 11H4z"/></svg>
          <span class="debt-name">${escapeHtml(d.para)}</span>
        </div>
        <span class="debt-amount">${formatCurrency(d.monto)}</span>
        <button type="button" class="btn-settle" data-role="settle" data-index="${i}">Marcar pagado</button>
      </div>
    `).join("");
    el._pendingDebts = debts; // referencia para abrir el sheet de liquidación
    el.debtsContainer.querySelectorAll('[data-role="settle"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.index);
        openSettleSheet(debts[idx]);
      });
    });
  }

  // --- Balance por persona ---
  const names = Object.keys(net).sort();
  if (names.length === 0) {
    el.balancesContainer.innerHTML = `<div class="debts-empty">Agrega viajeros para ver balances.</div>`;
  } else {
    el.balancesContainer.innerHTML = names.map((nombre) => {
      const val = net[nombre];
      const cls = val > 0.5 ? "positive" : val < -0.5 ? "negative" : "neutral";
      const sign = val > 0.5 ? "+" : val < -0.5 ? "−" : "";
      return `
        <div class="balance-row">
          <span class="balance-name">${escapeHtml(nombre)}${nombre === currentUserName ? " (tú)" : ""}</span>
          <span class="balance-amount ${cls}">${sign}${formatCurrency(Math.abs(val))}</span>
        </div>
      `;
    }).join("");
  }

  // --- Lista de todos los gastos ---
  if (expenses.length === 0) {
    el.expensesListContainer.innerHTML = `
      <div class="empty-state" style="margin-top: 10px; padding: 0;">
        <div style="background: var(--surface); padding: 32px 20px; border-radius: var(--radius-md); border: 1px dashed var(--border-strong); box-shadow: var(--shadow-sm);">
          <p style="font-size: 1.5rem; margin-bottom: 10px;">💸</p>
          <h3 style="font-family: var(--font-display); font-size: 1.1rem; color: var(--ink); margin-bottom: 6px;">Todavía no hay gastos</h3>
          <p style="font-size: 0.9rem; color: var(--muted);">Registra el primero con el botón de abajo.</p>
        </div>
      </div>`;
  } else {
    el.expensesListContainer.innerHTML = expenses.map((ev) => {
      const nParticipantes = (ev.participantes || []).length;
      return `
        <article class="expense-card" data-id="${ev.id}">
          <div class="expense-emoji">${categoryEmoji(ev.categoria)}</div>
          <div class="expense-body">
            <p class="expense-title">${escapeHtml(ev.descripcion)}</p>
            <p class="expense-sub">Pagó ${escapeHtml(ev.pagado_por)} · entre ${nParticipantes} persona${nParticipantes === 1 ? "" : "s"} · ${formatLongDate(ev.fecha)}</p>
          </div>
          <span class="expense-amount">${formatCurrency(ev.monto)}</span>
        </article>
      `;
    }).join("");
    el.expensesListContainer.querySelectorAll(".expense-card").forEach((card) => {
      card.addEventListener("click", () => openExpenseSheetForEdit(card.dataset.id));
    });
  }
}

/* --------------------------------------------------------------------------
 * 8. BOTTOM SHEET
 * ------------------------------------------------------------------------ */
function openSheetForCreate() {
  el.sheetTitle.textContent = "Nuevo evento";
  el.formEvent.reset();
  el.inputEventId.value = "";
  el.btnDeleteEvent.classList.add("hidden");
  el.formError.classList.add("hidden");

  const today = new Date();
  el.inputFecha.value = today.toISOString().slice(0, 10);
  openSheet();
}

function openSheetForEdit(id) {
  const ev = events.find((e) => String(e.id) === String(id));
  if (!ev) return;

  el.sheetTitle.textContent = "Editar evento";
  el.inputEventId.value = ev.id;
  el.inputFecha.value = ev.fecha;
  el.inputHora.value = ev.hora?.slice(0, 5) || "";
  el.inputTitulo.value = ev.titulo || "";
  el.inputUbicacion.value = ev.ubicacion || "";
  el.inputNotas.value = ev.notas || "";
  el.btnDeleteEvent.classList.remove("hidden");
  el.formError.classList.add("hidden");
  openSheet();
}

function openSheet() {
  el.sheetBackdrop.classList.remove("hidden");
  requestAnimationFrame(() => {
    el.sheetBackdrop.classList.add("visible");
    el.sheet.classList.add("open");
  });
  el.sheet.setAttribute("aria-hidden", "false");
}

function closeSheet() {
  el.sheetBackdrop.classList.remove("visible");
  el.sheet.classList.remove("open");
  el.sheet.setAttribute("aria-hidden", "true");
  setTimeout(() => el.sheetBackdrop.classList.add("hidden"), 220);
}

function handleEventFormSubmit(e) {
  e.preventDefault();

  const id = el.inputEventId.value;
  const fecha = el.inputFecha.value;
  const hora = el.inputHora.value;
  const titulo = el.inputTitulo.value.trim();
  const ubicacion = el.inputUbicacion.value.trim();
  const notas = el.inputNotas.value.trim();

  if (!fecha || !hora || !titulo) {
    showFormError("Completa fecha, hora y título.");
    return;
  }

  const payload = {
    codigo_viaje: currentTripCode,
    fecha,
    hora,
    titulo,
    ubicacion: ubicacion || null,
    notas: notas || null,
    creado_por: currentUserName,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  };

  closeSheet();

  if (id) {
    db.collection("itinerarios").doc(id).update(payload)
      .then(() => toast("Evento actualizado", "success"))
      .catch(err => {
        console.error(err);
        toast("Error al actualizar", "error");
      });
  } else {
    db.collection("itinerarios").add(payload)
      .then(() => toast("Evento guardado", "success"))
      .catch(err => {
        console.error(err);
        toast("Error al guardar", "error");
      });
  }
}

function handleDeleteEvent() {
  const id = el.inputEventId.value;
  if (!id) return;
  if (!confirm("¿Eliminar este evento del itinerario?")) return;

  closeSheet(); 

  db.collection("itinerarios").doc(id).delete()
    .then(() => toast("Evento eliminado", "success"))
    .catch(err => {
      console.error(err);
      toast("Error al eliminar", "error");
    });
}

function showFormError(msg) {
  el.formError.textContent = msg;
  el.formError.classList.remove("hidden");
}

/* --------------------------------------------------------------------------
 * 8b. SHEET DE GASTOS — crear/editar
 * ------------------------------------------------------------------------ */
function renderCategoryGrid(selected) {
  el.categoryGrid.innerHTML = EXPENSE_CATEGORIES.map((c) => `
    <button type="button" class="category-chip ${c.id === selected ? "active" : ""}" data-cat="${c.id}">
      <span class="emoji">${c.emoji}</span>
      <span>${c.label}</span>
    </button>
  `).join("");
  el.categoryGrid.querySelectorAll(".category-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      el.inputExpenseCategory.value = chip.dataset.cat;
      el.categoryGrid.querySelectorAll(".category-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });
}

function renderPayerSelect(selected) {
  const names = travelersList.length ? travelersList : [currentUserName];
  el.selectExpensePayer.innerHTML = names.map((n) =>
    `<option value="${escapeHtml(n)}" ${n === selected ? "selected" : ""}>${escapeHtml(n)}${n === currentUserName ? " (tú)" : ""}</option>`
  ).join("");
}

// existingParticipants: array de {nombre, monto} para precargar en modo edición (o null para modo creación = todos)
function renderParticipantRows(existingParticipants) {
  const names = travelersList.length ? travelersList : [currentUserName];
  const selectedNames = existingParticipants ? existingParticipants.map((p) => p.nombre) : names;

  el.participantsContainer.innerHTML = names.map((n) => {
    const checked = selectedNames.includes(n);
    const existing = existingParticipants ? existingParticipants.find((p) => p.nombre === n) : null;
    return `
      <div class="participant-row ${checked ? "" : "disabled"}" data-name="${escapeHtml(n)}">
        <input type="checkbox" class="participant-check" ${checked ? "checked" : ""} />
        <span class="participant-name">${escapeHtml(n)}${n === currentUserName ? " (tú)" : ""}</span>
        <input type="text" inputmode="decimal" class="participant-value" ${checked ? "" : "disabled"}
          value="${existing ? existing.monto : ""}" placeholder="0.00" />
      </div>
    `;
  }).join("");

  el.participantsContainer.querySelectorAll(".participant-row").forEach((row) => {
    const checkbox = row.querySelector(".participant-check");
    const valueInput = row.querySelector(".participant-value");
    checkbox.addEventListener("change", () => {
      row.classList.toggle("disabled", !checkbox.checked);
      valueInput.disabled = !checkbox.checked;
      recalcSplit();
    });
    valueInput.addEventListener("input", recalcSplit);
  });

  recalcSplit();
}

function setSplitMethod(method) {
  activeSplitMethod = method;
  el.splitMethodTabs.querySelectorAll(".split-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.method === method);
  });
  recalcSplit();
}

// Recalcula montos por participante según el método activo y muestra el estado (falta/sobra/ok)
function recalcSplit() {
  const total = Number(el.inputExpenseAmount.value) || 0;
  const rows = Array.from(el.participantsContainer.querySelectorAll(".participant-row"));
  const activeRows = rows.filter((r) => r.querySelector(".participant-check").checked);

  if (activeRows.length === 0) {
    el.splitHint.textContent = "Selecciona al menos una persona para dividir el gasto.";
    el.splitHint.className = "split-hint error";
    return;
  }

  if (activeSplitMethod === "equitativo") {
    const cada = total / activeRows.length;
    activeRows.forEach((row, i) => {
      const input = row.querySelector(".participant-value");
      // La última persona absorbe el residuo de redondeo para que la suma cuadre exacto
      const esUltimo = i === activeRows.length - 1;
      const suma = activeRows.slice(0, -1).reduce((s) => s + round2(cada), 0);
      input.value = esUltimo ? round2(total - suma).toFixed(2) : round2(cada).toFixed(2);
      input.disabled = true;
    });
    el.splitHint.textContent = `Se divide en partes iguales entre ${activeRows.length} persona${activeRows.length === 1 ? "" : "s"}.`;
    el.splitHint.className = "split-hint";
    return;
  }

  activeRows.forEach((row) => { row.querySelector(".participant-value").disabled = false; });

  if (activeSplitMethod === "exacto") {
    const suma = activeRows.reduce((s, r) => s + (Number(r.querySelector(".participant-value").value) || 0), 0);
    const diff = round2(total - suma);
    if (Math.abs(diff) < 0.01) {
      el.splitHint.textContent = "Los montos cuadran con el total. ✓";
      el.splitHint.className = "split-hint ok";
    } else if (diff > 0) {
      el.splitHint.textContent = `Faltan ${formatCurrency(diff)} por asignar.`;
      el.splitHint.className = "split-hint error";
    } else {
      el.splitHint.textContent = `Te pasaste por ${formatCurrency(-diff)}.`;
      el.splitHint.className = "split-hint error";
    }
  } else if (activeSplitMethod === "porcentaje") {
    const sumaPct = activeRows.reduce((s, r) => s + (Number(r.querySelector(".participant-value").value) || 0), 0);
    const diff = round2(100 - sumaPct);
    if (Math.abs(diff) < 0.01) {
      el.splitHint.textContent = "Los porcentajes suman 100%. ✓";
      el.splitHint.className = "split-hint ok";
    } else if (diff > 0) {
      el.splitHint.textContent = `Faltan ${diff}% por asignar.`;
      el.splitHint.className = "split-hint error";
    } else {
      el.splitHint.textContent = `Te pasaste por ${-diff}%.`;
      el.splitHint.className = "split-hint error";
    }
  }
}

// Convierte lo que hay en el formulario a la lista final de {nombre, monto} para guardar
function collectParticipants(total) {
  const rows = Array.from(el.participantsContainer.querySelectorAll(".participant-row"));
  const activeRows = rows.filter((r) => r.querySelector(".participant-check").checked);

  if (activeSplitMethod === "porcentaje") {
    return activeRows.map((row) => {
      const pct = Number(row.querySelector(".participant-value").value) || 0;
      return { nombre: row.dataset.name, monto: round2((pct / 100) * total) };
    });
  }
  return activeRows.map((row) => ({
    nombre: row.dataset.name,
    monto: round2(Number(row.querySelector(".participant-value").value) || 0),
  }));
}

function validateSplit(total) {
  const rows = Array.from(el.participantsContainer.querySelectorAll(".participant-row"));
  const activeRows = rows.filter((r) => r.querySelector(".participant-check").checked);
  if (activeRows.length === 0) return "Selecciona al menos una persona para dividir el gasto.";

  if (activeSplitMethod === "exacto") {
    const suma = activeRows.reduce((s, r) => s + (Number(r.querySelector(".participant-value").value) || 0), 0);
    if (Math.abs(round2(total - suma)) >= 0.01) return "Los montos exactos deben sumar el total del gasto.";
  } else if (activeSplitMethod === "porcentaje") {
    const sumaPct = activeRows.reduce((s, r) => s + (Number(r.querySelector(".participant-value").value) || 0), 0);
    if (Math.abs(round2(100 - sumaPct)) >= 0.01) return "Los porcentajes deben sumar 100%.";
  }
  return null;
}

function openExpenseSheetForCreate() {
  el.expenseSheetTitle.textContent = "Nuevo gasto";
  el.formExpense.reset();
  el.inputExpenseId.value = "";
  el.btnDeleteExpense.classList.add("hidden");
  el.expenseFormError.classList.add("hidden");
  el.inputExpenseDate.value = new Date().toISOString().slice(0, 10);
  el.inputExpenseCategory.value = "otros";

  renderCategoryGrid("otros");
  renderPayerSelect(currentUserName);
  setSplitMethod("equitativo");
  renderParticipantRows(null);
  openSheetExpense();
}

function openExpenseSheetForEdit(id) {
  const ev = expenses.find((e) => String(e.id) === String(id));
  if (!ev) return;

  el.expenseSheetTitle.textContent = "Editar gasto";
  el.inputExpenseId.value = ev.id;
  el.inputExpenseDesc.value = ev.descripcion || "";
  el.inputExpenseAmount.value = ev.monto || "";
  el.inputExpenseDate.value = ev.fecha || new Date().toISOString().slice(0, 10);
  el.inputExpenseCategory.value = ev.categoria || "otros";
  el.btnDeleteExpense.classList.remove("hidden");
  el.expenseFormError.classList.add("hidden");

  renderCategoryGrid(ev.categoria || "otros");
  renderPayerSelect(ev.pagado_por);
  activeSplitMethod = ev.metodo || "equitativo";
  el.splitMethodTabs.querySelectorAll(".split-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.method === activeSplitMethod);
  });
  renderParticipantRows(ev.participantes || []);
  openSheetExpense();
}

function openSheetExpense() {
  el.expenseSheetBackdrop.classList.remove("hidden");
  requestAnimationFrame(() => {
    el.expenseSheetBackdrop.classList.add("visible");
    el.sheetExpense.classList.add("open");
  });
  el.sheetExpense.setAttribute("aria-hidden", "false");
}

function closeSheetExpense() {
  el.expenseSheetBackdrop.classList.remove("visible");
  el.sheetExpense.classList.remove("open");
  el.sheetExpense.setAttribute("aria-hidden", "true");
  setTimeout(() => el.expenseSheetBackdrop.classList.add("hidden"), 220);
}

function handleExpenseFormSubmit(e) {
  e.preventDefault();

  const id = el.inputExpenseId.value;
  const descripcion = el.inputExpenseDesc.value.trim();
  const monto = round2(Number(el.inputExpenseAmount.value));
  const fecha = el.inputExpenseDate.value;
  const categoria = el.inputExpenseCategory.value;
  const pagado_por = el.selectExpensePayer.value;

  if (!descripcion || !monto || monto <= 0 || !fecha || !pagado_por) {
    el.expenseFormError.textContent = "Completa descripción, monto, fecha y quién pagó.";
    el.expenseFormError.classList.remove("hidden");
    return;
  }

  const splitError = validateSplit(monto);
  if (splitError) {
    el.expenseFormError.textContent = splitError;
    el.expenseFormError.classList.remove("hidden");
    return;
  }

  const participantes = collectParticipants(monto);

  const payload = {
    codigo_viaje: currentTripCode,
    descripcion,
    monto,
    fecha,
    categoria,
    pagado_por,
    participantes,
    metodo: activeSplitMethod,
    creado_por: currentUserName,
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  };

  closeSheetExpense();

  if (id) {
    db.collection("gastos").doc(id).update(payload)
      .then(() => toast("Gasto actualizado", "success"))
      .catch((err) => { console.error(err); toast("Error al actualizar", "error"); });
  } else {
    db.collection("gastos").add(payload)
      .then(() => toast("Gasto guardado", "success"))
      .catch((err) => { console.error(err); toast("Error al guardar", "error"); });
  }
}

async function handleDeleteExpense() {
  const id = el.inputExpenseId.value;
  if (!id) return;
  
  // 🚀 UX FIX: Usamos nuestro panel de confirmación personalizado
  const isConfirmed = await requestConfirmUI(
    "Eliminar gasto",
    "¿Estás seguro que quieres borrar este gasto? Esto actualizará inmediatamente los balances de todos los viajeros.",
    "Sí, eliminar",
    true // true activa el botón rojo
  );

  if (!isConfirmed) return;

  closeSheetExpense();

  db.collection("gastos").doc(id).delete()
    .then(() => toast("Gasto eliminado", "success"))
    .catch((err) => { console.error(err); toast("Error al eliminar", "error"); });
}

/* --------------------------------------------------------------------------
 * 8c. SHEET DE LIQUIDACIÓN — marcar una deuda como pagada
 * ------------------------------------------------------------------------ */
function openSettleSheet(debt) {
  pendingSettleDebt = debt;
  el.settleDescription.innerHTML = `<strong>${escapeHtml(debt.de)}</strong> le paga a <strong>${escapeHtml(debt.para)}</strong> para saldar su deuda.`;
  el.inputSettleAmount.value = debt.monto.toFixed(2);

  el.expenseSheetBackdrop.classList.remove("hidden");
  requestAnimationFrame(() => {
    el.expenseSheetBackdrop.classList.add("visible");
    el.sheetSettle.classList.add("open");
  });
  el.sheetSettle.setAttribute("aria-hidden", "false");
}

function closeSettleSheet() {
  el.expenseSheetBackdrop.classList.remove("visible");
  el.sheetSettle.classList.remove("open");
  el.sheetSettle.setAttribute("aria-hidden", "true");
  setTimeout(() => el.expenseSheetBackdrop.classList.add("hidden"), 220);
  pendingSettleDebt = null;
}

function handleSettleSubmit(e) {
  e.preventDefault();
  if (!pendingSettleDebt) return;

  const monto = round2(Number(el.inputSettleAmount.value));
  if (!monto || monto <= 0) {
    toast("Ingresa un monto válido", "error");
    return;
  }

  const payload = {
    codigo_viaje: currentTripCode,
    de: pendingSettleDebt.de,
    para: pendingSettleDebt.para,
    monto,
    registrado_por: currentUserName,
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  };

  closeSettleSheet();

  db.collection("liquidaciones").add(payload)
    .then(() => toast("Pago registrado", "success"))
    .catch((err) => { console.error(err); toast("Error al registrar el pago", "error"); });
}

function openHub() {
  el.hubBackdrop.classList.remove("hidden");
  requestAnimationFrame(() => {
    el.hubBackdrop.classList.add("visible");
    el.sheetHub.classList.add("open");
  });
  el.sheetHub.setAttribute("aria-hidden", "false");

  // 🚀 Iniciar el listener de reglas (los viajeros ya se escuchan desde que entraste al viaje)
  subscribeRulesRealtime();
}

function closeHub() {
  el.hubBackdrop.classList.remove("visible");
  el.sheetHub.classList.remove("open");
  el.sheetHub.setAttribute("aria-hidden", "true");
  setTimeout(() => el.hubBackdrop.classList.add("hidden"), 220);
}

let unsubscribeRules = null;

function subscribeRulesRealtime() {
  if (!currentTripCode) return;
  if (unsubscribeRules) unsubscribeRules();

  // Leemos de la colección "reglas" en Firebase
  unsubscribeRules = db.collection("reglas")
    .where("codigo_viaje", "==", currentTripCode)
    .onSnapshot((querySnapshot) => {
      let rulesArray = [];
      querySnapshot.forEach(doc => {
        rulesArray.push({ id: doc.id, ...doc.data() });
      });

      // Ordenamos localmente por fecha de creación
      rulesArray.sort((a, b) => {
        const tA = a.created_at ? a.created_at.toMillis() : Date.now();
        const tB = b.created_at ? b.created_at.toMillis() : Date.now();
        return tA - tB;
      });

      el.rulesContainer.innerHTML = "";

      if (rulesArray.length === 0) {
        el.rulesContainer.innerHTML = `<p style="font-size:0.9rem; color:var(--muted); text-align:center; margin-top:10px;">El lienzo está en blanco. Agrega el primer acuerdo.</p>`;
        return;
      }

      rulesArray.forEach((rule) => {
        const li = document.createElement("li");
        li.className = "rule-item";

        // Validamos si el usuario actual es el creador para darle permiso de borrar
        const canDelete = rule.creado_por === currentUserName;

        li.innerHTML = `
          <div class="rule-text">
            ${escapeHtml(rule.texto)}
            <span class="rule-author">Agregado por ${escapeHtml(rule.creado_por)}</span>
          </div>
          ${canDelete ? `
          <button class="btn-delete-rule" data-id="${rule.id}" aria-label="Borrar acuerdo">
            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>` : ''}
        `;
        el.rulesContainer.appendChild(li);
      });

      // Escuchar los clics en los botones de borrar
      el.rulesContainer.querySelectorAll(".btn-delete-rule").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const id = e.currentTarget.dataset.id;
          if(confirm("¿Borrar este acuerdo del grupo?")) {
            db.collection("reglas").doc(id).delete();
          }
        });
      });
    });
}

function handleRuleSubmit(e) {
  e.preventDefault();
  const text = el.inputRule.value.trim();
  if (!text || !currentTripCode) return;

  db.collection("reglas").add({
    codigo_viaje: currentTripCode,
    texto: text,
    creado_por: currentUserName,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    el.inputRule.value = ""; // Limpiar el input tras guardar
  }).catch(err => {
    console.error("Error guardando regla:", err);
    toast("Error al guardar", "error");
  });
}
/* --------------------------------------------------------------------------
 * 9. CONNECTIVITY
 * ------------------------------------------------------------------------ */
function updateConnectivityUI() {
  const online = navigator.onLine;
  el.offlineBanner.classList.toggle("hidden", online);
  if (!online) {
    el.livePill.classList.add("offline");
    el.livePill.innerHTML = '<span class="live-dot"></span> Sin conexión';
  }
}

window.addEventListener("online", () => {
  updateConnectivityUI();
  if (currentTripCode) {
    subscribeRealtime();
    subscribeTravelersGlobal();
    subscribeExpensesRealtime();
    subscribeSettlementsRealtime();
    subscribeTripConfigRealtime();
  }
  toast("Conexión restaurada", "success");
});

window.addEventListener("offline", () => {
  updateConnectivityUI();
  toast("Sin conexión — mostrando datos guardados", "info");
});

/* --------------------------------------------------------------------------
 * 10. INIT
 * ------------------------------------------------------------------------ */
function attachEventListeners() {
  el.formLogin.addEventListener("submit", handleLoginSubmit);
  el.btnAddEvent.addEventListener("click", openSheetForCreate);
  el.btnLeave.addEventListener("click", leaveTrip);
  el.btnCloseSheet.addEventListener("click", closeSheet);
  el.sheetBackdrop.addEventListener("click", closeSheet);
  el.formEvent.addEventListener("submit", handleEventFormSubmit);
  el.btnDeleteEvent.addEventListener("click", handleDeleteEvent);
  el.topbarLeft.addEventListener("click", openHub);
  el.btnCloseHub.addEventListener("click", closeHub);
  el.hubBackdrop.addEventListener("click", closeHub);
  el.formRule.addEventListener("submit", handleRuleSubmit);

  // Bottom tabbar
  el.tabbtnItinerario.addEventListener("click", () => switchMainTab("timeline"));
  el.tabbtnGastos.addEventListener("click", () => switchMainTab("expenses"));
  el.expensesTopbarLeft.addEventListener("click", openHub);

  // Pantalla de gastos
  el.tabBalance.addEventListener("click", () => window.setActiveExpenseTab("balance"));
  el.tabList.addEventListener("click", () => window.setActiveExpenseTab("list"));
  el.selectCurrency.addEventListener("change", handleCurrencyChange);
  el.btnAddExpense.addEventListener("click", openExpenseSheetForCreate);

  // Sheet de gasto
  el.btnCloseExpenseSheet.addEventListener("click", closeSheetExpense);
  el.expenseSheetBackdrop.addEventListener("click", () => {
    closeSheetExpense();
    closeSettleSheet();
  });
  el.formExpense.addEventListener("submit", handleExpenseFormSubmit);
  el.btnDeleteExpense.addEventListener("click", handleDeleteExpense);
  el.inputExpenseAmount.addEventListener("input", recalcSplit);
  el.splitMethodTabs.querySelectorAll(".split-tab").forEach((tab) => {
    tab.addEventListener("click", () => setSplitMethod(tab.dataset.method));
  });

  // Sheet de liquidación
  el.btnCloseSettleSheet.addEventListener("click", closeSettleSheet);
  el.formSettle.addEventListener("submit", handleSettleSubmit);
}

function init() {
  attachEventListeners();
  updateConnectivityUI();

  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.register("sw.js");
    } catch (err) {
      console.warn("SW registration failed:", err);
    }
  }

  const savedTripCode = localStorage.getItem(LS_KEYS.tripCode);
  const savedUserName = localStorage.getItem(LS_KEYS.userName);

  setTimeout(() => {
    if (savedTripCode && savedUserName) {
      joinTrip(savedTripCode, savedUserName);
    } else {
      showScreen("login");
    }
  }, 500); 
}

/* ==========================================================================
 * 11. IOS PWA FIXES (Anti-congelamiento y Clics Fantasmas)
 * ========================================================================== */
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
  const now = (new Date()).getTime();
  // Si ocurren 2 toques con menos de 300ms de diferencia...
  if (now - lastTouchEnd <= 300) {
    const tag = event.target.tagName;
    // ...y NO estás tocando una caja de texto, destruye el doble tap.
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      event.preventDefault(); 
    }
  }
  lastTouchEnd = now;
}, { passive: false });

// 🚀 FIX DEFINITIVO: Medición dinámica de altura para matar el glitch de iOS
function setDocHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('resize', setDocHeight);
window.addEventListener('orientationchange', setDocHeight);

setDocHeight(); // Se ejecuta al instante

// 🚀 NUEVO: Doble verificación para iPhones lentos (calcula de nuevo a los 300ms y al segundo)
setTimeout(setDocHeight, 300);
setTimeout(setDocHeight, 1000);

// Escuchamos cuando la app se abre, cambia de tamaño o rota la pantalla
window.addEventListener('resize', setDocHeight);
window.addEventListener('orientationchange', setDocHeight);
setDocHeight(); // Lo corremos inmediatamente

// Prevenir el zoom con dos dedos (pellizco)
document.addEventListener('touchstart', function(event) {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
}, { passive: false });

document.addEventListener("DOMContentLoaded", init);
