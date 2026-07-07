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

const LS_KEYS = {
  tripCode: "tripsync_trip_code",
  userName: "tripsync_user_name",
  cachedEvents: "tripsync_cached_events_",
};

/* --------------------------------------------------------------------------
 * 3. DOM REFERENCES
 * ------------------------------------------------------------------------ */
const el = {
  screens: {
    splash: document.getElementById("screen-splash"),
    login: document.getElementById("screen-login"),
    timeline: document.getElementById("screen-timeline"),
  },
  offlineBanner: document.getElementById("offline-banner"),
  livePill: document.getElementById("live-pill"),
  labelTripCode: document.getElementById("label-trip-code"),
   dayTabs: document.getElementById("day-tabs"),

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

/* --------------------------------------------------------------------------
 * 5. LOGIN FLOW
 * ------------------------------------------------------------------------ */
function handleLoginSubmit(e) {
  e.preventDefault();
  const tripCode = sanitizeTripCode(el.inputTripCode.value);
  const userName = el.inputUserName.value.trim();

  if (!tripCode || !userName) {
    toast("Completa ambos campos", "error");
    return;
  }

  joinTrip(tripCode, userName);
}

function joinTrip(tripCode, userName) {
  currentTripCode = tripCode;
  currentUserName = userName;
  localStorage.setItem(LS_KEYS.tripCode, tripCode);
  localStorage.setItem(LS_KEYS.userName, userName);

  if (navigator.onLine) {
    subscribeRealtime();
  } else {
    loadCachedEvents();
    toast("Modo sin conexión a Firebase", "info");
  }

  enterTimelineScreen();
}

function enterTimelineScreen() {
  el.labelTripCode.textContent = `VIAJE · ${currentTripCode}`;
  showScreen("timeline");
  renderItinerary();
}

function leaveTrip() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  localStorage.removeItem(LS_KEYS.tripCode);
  localStorage.removeItem(LS_KEYS.userName);
  currentTripCode = null;
  currentUserName = null;
  events = [];
  el.inputTripCode.value = "";
  el.inputUserName.value = "";
  showScreen("login");
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
            ¿Un takoyaki en Dotonbori? ¿Visita a los ciervos en Nara o el cruce de Shibuya en Tokio? Comienza a trazar la ruta de la aventura.
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
      <div class="event-main" data-role="edit-trigger">
        <span class="event-time">${formatTime(ev.hora)}</span>
        <div class="event-body">
          <h3 class="event-title">${escapeHtml(ev.titulo)}</h3>
          ${ev.ubicacion ? `<p class="event-location">${locationIconSvg()} ${escapeHtml(ev.ubicacion)}</p>` : ""}
          ${ev.creado_por ? `<p class="event-author">Agregado por ${escapeHtml(ev.creado_por)}</p>` : ""}
        </div>
        <div class="event-meta">
          ${hasNotes ? `<button class="event-expand-btn ${isOpen ? "open" : ""}" data-role="toggle-notes" aria-label="Ver notas">${chevronSvg()}</button>` : ""}
        </div>
      </div>
      ${hasNotes ? `
      <div class="event-notes ${isOpen ? "open" : ""}" data-role="notes-panel">
        <div class="event-notes-inner">${escapeHtml(ev.notas)}</div>
      </div>` : ""}
    </article>
  `;
}

function attachCardListeners() {
  el.timelineContainer.querySelectorAll(".event-card").forEach((card) => {
    const id = card.dataset.id;
    const editTrigger = card.querySelector('[data-role="edit-trigger"]');
    editTrigger?.addEventListener("click", (e) => {
      if (e.target.closest('[data-role="toggle-notes"]')) return;
      openSheetForEdit(id);
    });
    const toggleBtn = card.querySelector('[data-role="toggle-notes"]');
    toggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      openNotesId = openNotesId === id ? null : id;
      renderItinerary();
    });
  });
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

document.addEventListener("DOMContentLoaded", init);
