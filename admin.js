// ============================================
// PANEL DE ADMINISTRACIÓN — JWT
// ============================================
const API_BASE = "https://mgagrimensura-backend-2.onrender.com/api";

let token = localStorage.getItem("token_jwt") || "";
let parcelasCache = [];

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
    } catch (err) {
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
}

$("btn-logout")?.addEventListener("click", () => {
  token = "";
  localStorage.removeItem("token_jwt");
  mostrarLogin();
});

// ============================================================
// PETICIONES CON JWT
// ============================================================

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

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

  document.querySelectorAll(".select-estado").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const nuevoEstado = e.target.value;
      await cambiarEstado(id, nuevoEstado, e.target);
    });
  });
}

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
      headers: getAuthHeaders(),
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
