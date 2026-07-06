/* ==========================================================================
   TripSync — app.js (Migrado a Firebase Firestore)
   ========================================================================== */

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "TUS_NUMEROS",
  appId: "TU_APP_ID"
};

// Inicializar Firebase (Versión Compat)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

/* ------------------------------------------------------------------------

/* --------------------------------------------------------------------------
 * 2. STATE & VARIABLES
 * ------------------------------------------------------------------------ */
let currentTripCode = null;
let currentUserName = null;
let events = [];
let unsubscribe = null; // Para detener la escucha en tiempo real
let openNotesId = null; 

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
  
  if (unsubscribe) unsubscribe(); // Limpiar si ya había una suscripción
  
  const pill = el.livePill;
  pill.classList.remove("offline");
  pill.innerHTML = '<span class="live-dot"></span> Sincronizando...';

  // Escuchar en tiempo real a la colección de Firestore
  unsubscribe = db.collection("itinerarios")
    .where("codigo_viaje", "==", currentTripCode)
    .orderBy("fecha", "asc")
    .orderBy("hora", "asc")
    .onSnapshot((querySnapshot) => {
      events = [];
      querySnapshot.forEach((doc) => {
        events.push({ id: doc.id, ...doc.data() });
      });
      
      cacheEvents();
      renderItinerary();
      
      pill.classList.remove("offline");
      pill.innerHTML = '<span class="live-dot"></span> En vivo';
    }, (error) => {
      console.error("Error suscribiéndose a Firebase:", error);
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
 * 7. RENDER — renderItinerary()
 * ------------------------------------------------------------------------ */
function renderItinerary() {
  const container = el.timelineContainer;
  container.innerHTML = "";

  if (!events.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM8 2v4M16 2v4M2 10h20"/></svg>
        <h3>Aún no hay planes</h3>
        <p>Toca "Agregar" para crear el primer evento del viaje.</p>
      </div>`;
    return;
  }

  const groups = [];
  const byDate = new Map();
  for (const ev of events) {
    if (!byDate.has(ev.fecha)) {
      const arr = [];
      byDate.set(ev.fecha, arr);
      groups.push({ fecha: ev.fecha, items: arr });
    }
    byDate.get(ev.fecha).push(ev);
  }
  groups.sort((a, b) => a.fecha.localeCompare(b.fecha));

  groups.forEach((group, i) => {
    const dayEl = document.createElement("div");
    dayEl.className = "day-group";
    dayEl.innerHTML = `
      <div class="day-heading">
        <span class="day-index">DÍA ${i + 1}</span>
        <span class="day-date">${formatLongDate(group.fecha)}</span>
      </div>
      <div class="day-route">
        ${group.items.map(renderEventCard).join("")}
      </div>
    `;
    container.appendChild(dayEl);
  });

  attachCardListeners();
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
 * 8. BOTTOM SHEET — add / edit event
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

async function handleEventFormSubmit(e) {
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
    created_at: firebase.firestore.FieldValue.serverTimestamp() // Timestamp de Firebase
  };

  const btn = document.getElementById("btn-save-event");
  btn.disabled = true;

  try {
    if (id) {
      await db.collection("itinerarios").doc(id).update(payload);
    } else {
      await db.collection("itinerarios").add(payload);
    }
    toast("Evento guardado", "success");
    closeSheet();
  } catch (err) {
    console.error(err);
    showFormError("No se pudo guardar el evento. Revisa tu conexión.");
  } finally {
    btn.disabled = false;
  }
}

async function handleDeleteEvent() {
  const id = el.inputEventId.value;
  if (!id) return;
  if (!confirm("¿Eliminar este evento del itinerario?")) return;

  try {
    await db.collection("itinerarios").doc(id).delete();
    toast("Evento eliminado", "success");
    closeSheet();
  } catch (err) {
    console.error(err);
    showFormError("No se pudo eliminar.");
  }
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
