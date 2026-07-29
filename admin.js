// ============================================
// PANEL DE ADMINISTRACIÓN
// ============================================
const API_BASE = "https://mgagrimensura-backend-2.onrender.com/api";

let apiKey = localStorage.getItem("admin_api_key") || "";
let parcelasCache = [];

// DOM refs
const $ = (id) => document.getElementById(id);

// ============================================================
// LOGIN
// ============================================================

function inicializarLogin() {
  if (apiKey) {
    mostrarPanel();
    return;
  }

  $("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const key = $("api-key-input").value.trim();
    if (!key) return;

    // Guardar y probar
    apiKey = key;
    localStorage.setItem("admin_api_key", apiKey);
    mostrarPanel();
  });
}

function mostrarLogin() {
  $("login-section").classList.remove("oculto");
  $("panel-section").classList.add("oculto");
}

function mostrarPanel() {
  $("login-section").classList.add("oculto");
  $("panel-section").classList.remove("oculto");
  cargarParcelas();
}

$("btn-logout")?.addEventListener("click", () => {
  apiKey = "";
  localStorage.removeItem("admin_api_key");
  mostrarLogin();
});

// ============================================================
// CARGAR PARCELAS
// ============================================================

async function cargarParcelas() {
  const tbody = $("tabla-body");
  tbody.innerHTML = `<tr><td colspan="8" class="celda-vacia">Cargando...</td></tr>`;

  try {
    const res = await fetch(`${API_BASE}/parcelas`, {
      headers: { "x-api-key": apiKey },
    });

    if (res.status === 401) {
      mostrarMensaje("API Key inválida. Cerrando sesión.", "error");
      setTimeout(() => {
        apiKey = "";
        localStorage.removeItem("admin_api_key");
        mostrarLogin();
      }, 2000);
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
    <tr>
      <td>${p.id}</td>
      <td>${formatearFecha(p.fechaCreacion)}</td>
      <td>${escaparHTML(p.clienteNombre)}</td>
      <td>${escaparHTML(p.clienteEmail)}</td>
      <td>${(p.areaM2 / 10000).toFixed(4)}</td>
      <td>${p.perimetroM.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
      <td><span class="badge badge-${p.estado.replace(/\s/g, "-")}">${p.estado}</span></td>
      <td>
        <select class="select-estado" data-id="${p.id}">
          <option value="recibido" ${p.estado === "recibido" ? "selected" : ""}>Recibido</option>
          <option value="en proceso" ${p.estado === "en proceso" ? "selected" : ""}>En proceso</option>
          <option value="finalizado" ${p.estado === "finalizado" ? "selected" : ""}>Finalizado</option>
        </select>
      </td>
    </tr>
  `,
    )
    .join("");

  // Bind eventos a los selects
  document.querySelectorAll(".select-estado").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const nuevoEstado = e.target.value;
      await cambiarEstado(id, nuevoEstado, e.target);
    });
  });
}

// ============================================================
// FILTROS
// ============================================================

$("filtro-estado")?.addEventListener("change", () => {
  renderizarTabla(parcelasCache);
});

// ============================================================
// CAMBIAR ESTADO
// ============================================================

async function cambiarEstado(id, nuevoEstado, selectElement) {
  selectElement.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/parcelas/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    if (res.status === 401) {
      mostrarMensaje("Sesión expirada. Volvé a iniciar sesión.", "error");
      setTimeout(() => {
        apiKey = "";
        localStorage.removeItem("admin_api_key");
        mostrarLogin();
      }, 2000);
      return;
    }

    if (res.status === 404) {
      mostrarMensaje("Parcela no encontrada.", "error");
      return;
    }

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Error al actualizar");
    }

    // Actualizar cache local
    const idx = parcelasCache.findIndex((p) => p.id == id);
    if (idx !== -1) parcelasCache[idx].estado = nuevoEstado;

    mostrarMensaje(`✅ Parcela #${id} actualizada a "${nuevoEstado}"`, "exito");
    renderizarTabla(parcelasCache);
  } catch (err) {
    mostrarMensaje(`❌ ${err.message}`, "error");
    // Revertir select al valor anterior
    const parcela = parcelasCache.find((p) => p.id == id);
    if (parcela) selectElement.value = parcela.estado;
  } finally {
    selectElement.disabled = false;
  }
}

// ============================================================
// UTILIDADES
// ============================================================

function formatearFecha(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escaparHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mostrarMensaje(texto, tipo) {
  const el = $("mensaje-global");
  el.textContent = texto;
  el.className =
    "mensaje-global " + (tipo === "exito" ? "msg-exito" : "msg-error");
  el.classList.remove("oculto");
  setTimeout(() => el.classList.add("oculto"), 4000);
}

// ============================================================
// ARRANQUE
// ============================================================

inicializarLogin();
