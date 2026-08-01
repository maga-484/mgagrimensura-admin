// ============================================
// PANEL DE ADMINISTRACIÓN — JWT + Leaflet
// ============================================
const API_BASE = "https://mgagrimensura-backend-2.onrender.com/api";

let token = localStorage.getItem("token_jwt") || "";
let parcelasCache = [];
let mapa = null;
let capaGeoJSON = null;
let notificarIdActual = null;

const $ = (id) => document.getElementById(id);

// ============================================================
// LOGIN
// ============================================================

function inicializarLogin() {
  if (token) {
    mostrarPanel();
    return;
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const usuario = $("login-usuario").value.trim();
    const password = $("login-password").value.trim();

    if (!usuario || !password) return;

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });

      const data = await res.json();

      if (res.status === 200 && data.token) {
        token = data.token;
        localStorage.setItem("token_jwt", token);
        $("login-error").classList.add("oculto");
        mostrarPanel();
      } else {
        mostrarLoginError(data.mensaje || "Credenciales inválidas");
      }
    } catch {
      mostrarLoginError("Error de conexión con el servidor");
    }
  });
}

function mostrarLoginError(texto) {
  const el = $("login-error");
  el.textContent = texto;
  el.classList.remove("oculto");
}

function mostrarLogin() {
  $("login-section").classList.remove("oculto");
  $("panel-section").classList.add("oculto");
}

function mostrarPanel() {
  $("login-section").classList.add("oculto");
  $("panel-section").classList.remove("oculto");
  cargarParcelas();

  setTimeout(() => {
    inicializarMapa();
  }, 100);
}

$("btn-logout")?.addEventListener("click", () => {
  token = "";
  localStorage.removeItem("token_jwt");
  if (mapa) {
    mapa.remove();
    mapa = null;
    capaGeoJSON = null;
  }
  mostrarLogin();
});

// ============================================================
// MAPA LEAFLET
// ============================================================

function inicializarMapa() {
  if (mapa) return;
  const container = $("mapa-parcela");
  if (!container) return;

  mapa = L.map("mapa-parcela").setView([-34.6, -58.5], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapa);
}

function mostrarParcelaEnMapa(geojson) {
  inicializarMapa();

  const mensajeEl = $("mapa-mensaje");
  mensajeEl.classList.add("oculto");

  if (capaGeoJSON) {
    mapa.removeLayer(capaGeoJSON);
    capaGeoJSON = null;
  }

  if (
    !geojson ||
    !geojson.type ||
    !geojson.coordinates ||
    geojson.coordinates.length === 0
  ) {
    mensajeEl.textContent = "Esta parcela no tiene geometría disponible.";
    mensajeEl.classList.remove("oculto");
    mapa.setView([-34.6, -58.5], 10);
    return;
  }

  capaGeoJSON = L.geoJSON(geojson, {
    style: {
      color: "#2563eb",
      weight: 3,
      fillColor: "#3b82f6",
      fillOpacity: 0.25,
    },
  }).addTo(mapa);

  const bounds = capaGeoJSON.getBounds();
  if (bounds.isValid()) {
    mapa.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
  }
}

// ============================================================
// PETICIONES CON JWT
// ============================================================

async function cargarParcelas() {
  const tbody = $("tabla-body");
  tbody.innerHTML = `<tr><td colspan="8" class="celda-vacia">Cargando...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/parcelas`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      mostrarMensaje("Sesión expirada. Volvé a iniciar sesión.", "error");
      token = "";
      localStorage.removeItem("token_jwt");
      setTimeout(mostrarLogin, 2000);
      return;
    }

    if (!res.ok) throw new Error(`Error ${res.status}`);

    const data = await res.json();
    parcelasCache = data.data || [];
    renderizarTabla(parcelasCache);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="celda-vacia">Error al cargar: ${err.message}</td></tr>`;
  }
}

$("btn-refresh")?.addEventListener("click", cargarParcelas);

// Exportar GeoJSON
$("btn-export")?.addEventListener("click", exportarGeoJSON);

async function exportarGeoJSON() {
  const btn = $("btn-export");
  const estadoOriginal = btn.textContent;
  btn.textContent = "⏳ Exportando...";
  btn.disabled = true;

  try {
    const estado = $("filtro-estado").value;
    const url =
      estado === "todos"
        ? `${API_BASE}/export/geojson`
        : `${API_BASE}/export/geojson?estado=${encodeURIComponent(estado)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      mostrarMensaje("Sesión expirada. Volvé a iniciar sesión.", "error");
      token = "";
      localStorage.removeItem("token_jwt");
      setTimeout(mostrarLogin, 2000);
      return;
    }

    if (!res.ok) throw new Error(`Error ${res.status}`);

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `parcelas_${new Date().toISOString().slice(0, 10)}.geojson`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);

    mostrarMensaje("✅ GeoJSON descargado correctamente", "exito");
  } catch (err) {
    mostrarMensaje(`❌ Error al exportar: ${err.message}`, "error");
  } finally {
    btn.textContent = estadoOriginal;
    btn.disabled = false;
  }
}

// ============================================================
// RENDERIZAR TABLA
// ============================================================

function renderizarTabla(parcelas) {
  const tbody = $("tabla-body");
  const filtro = $("filtro-estado").value;

  const filtradas =
    filtro === "todos" ? parcelas : parcelas.filter((p) => p.estado === filtro);

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="celda-vacia">No hay parcelas para mostrar.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas
    .map(
      (p) => `
    <tr class="fila-parcela" data-id="${p.id}">
      <td>${p.id}</td>
      <td>${formatearFecha(p.fechaCreacion)}</td>
      <td>${escaparHTML(p.clienteNombre)}</td>
      <td>${escaparHTML(p.clienteEmail)}</td>
      <td>${(p.areaM2 / 10000).toFixed(4)}</td>
      <td>${p.perimetroM.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
      <td><span class="badge badge-${p.estado.replace(/\s/g, "-")}">${p.estado}</span></td>
      <td class="acciones-celda">${renderizarBotonesAccion(p)}</td>
    </tr>
  `,
    )
    .join("");

  // Click en fila → mostrar en mapa
  document.querySelectorAll(".fila-parcela").forEach((fila) => {
    fila.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON") return;
      const id = parseInt(fila.dataset.id, 10);
      const parcela = parcelasCache.find((p) => p.id === id);
      if (parcela) {
        mostrarParcelaEnMapa(parcela.geoJSON || null);
      }
    });
  });
}

function renderizarBotonesAccion(p) {
  if (p.estado === "nueva") {
    return `<button class="btn-primario" onclick="iniciarParcela(${p.id}, this)">Empezar</button>`;
  }
  if (p.estado === "en proceso") {
    return `
      <button class="btn-exito" onclick="finalizarParcela(${p.id}, this)">Finalizar</button>
      <button class="btn-info" onclick="abrirModalNotificar(${p.id})">Notificar</button>
    `;
  }
  if (p.estado === "finalizado") {
    return `
      <button class="btn-advertencia" onclick="reabrirParcela(${p.id}, this)">Reabrir</button>
      <button class="btn-info" onclick="abrirModalNotificar(${p.id})">Notificar</button>
    `;
  }
  return "";
}

$("filtro-estado")?.addEventListener("change", () => {
  renderizarTabla(parcelasCache);
});

// ============================================================
// CAMBIAR ESTADO
// ============================================================

function iniciarParcela(id, btn) { cambiarEstado(id, "en proceso", btn); }
function finalizarParcela(id, btn) { cambiarEstado(id, "finalizado", btn); }
function reabrirParcela(id, btn) { cambiarEstado(id, "en proceso", btn); }

async function cambiarEstado(id, nuevoEstado, triggerElement) {
  if (triggerElement) triggerElement.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/parcelas/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    if (res.status === 401) {
      mostrarMensaje("Sesión expirada. Volvé a iniciar sesión.", "error");
      token = "";
      localStorage.removeItem("token_jwt");
      setTimeout(mostrarLogin, 2000);
      return;
    }

    if (res.status === 404) {
      mostrarMensaje("Parcela no encontrada.", "error");
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.mensaje || "Error al actualizar");
    }

    const idx = parcelasCache.findIndex((p) => p.id == id);
    if (idx !== -1) parcelasCache[idx].estado = nuevoEstado;

    mostrarMensaje(`✅ Parcela #${id} actualizada a "${nuevoEstado}"`, "exito");
    renderizarTabla(parcelasCache);
  } catch (err) {
    mostrarMensaje(`❌ ${err.message}`, "error");
    await cargarParcelas();
  } finally {
    if (triggerElement) triggerElement.disabled = false;
  }
}

// ============================================================
// MODAL NOTIFICAR
// ============================================================

function abrirModalNotificar(id) {
  notificarIdActual = id;
  const parcela = parcelasCache.find((p) => p.id === id);
  const nombre = parcela?.clienteNombre || "cliente";
  const estado = parcela?.estado || "";

  const template = `Estimado ${nombre}:

Le informamos que el análisis de su parcela ha sido actualizado.

Estado actual: ${estado}.

Ante cualquier consulta, no dude en contactarnos.

Saludos cordiales.`;

  $("notif-asunto").value = `Actualización de su parcela — ID #${id}`;
  $("notif-mensaje").value = template;
  $("modal-notificar").classList.remove("oculto");
}

function cerrarModalNotificar() {
  $("modal-notificar").classList.add("oculto");
  notificarIdActual = null;
}

async function enviarNotificacion() {
  if (!notificarIdActual) return;

  const btn = document.querySelector("#modal-notificar .btn-primario");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    const res = await fetch(`${API_BASE}/parcelas/${notificarIdActual}/notificar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        asunto: $("notif-asunto").value,
        mensaje: $("notif-mensaje").value,
      }),
    });

    if (res.status === 401) {
      mostrarMensaje("Sesión expirada. Volvé a iniciar sesión.", "error");
      token = "";
      localStorage.removeItem("token_jwt");
      setTimeout(mostrarLogin, 2000);
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error al enviar notificación");

    mostrarMensaje("✅ Notificación enviada correctamente", "exito");
    cerrarModalNotificar();
  } catch (err) {
    mostrarMensaje(`❌ ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar";
  }
}

// ============================================================
// UTILIDADES
// ============================================================

function form