const $ = (id) => document.getElementById(id);

const state = {
  equipments: [],
  logs: [],
  categories: [],
  statuses: [],
  shifts: [],
  userName: localStorage.getItem("plant_logger_username") || "",
  formReportMedia: [],
  formResolveMedia: [],
  editReportMedia: [],
  editResolveMedia: [],
};

function asArray(val) {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr.filter((x) => x && typeof x === "object" && !Array.isArray(x) && x.url);
}

function isVideoFile(item) {
  const mime = (item.mimeType || "").toLowerCase();
  const name = (item.name || item.url || "").toLowerCase();
  return mime.startsWith("video/") || /\.(mp4|mov|webm|mkv)$/.test(name);
}

async function uploadMediaFiles(fileList, targetArray, renderFn) {
  const files = Array.from(fileList || []);
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) {
      showToast(`File "${file.name}" melebihi batas 25 MB`);
      continue;
    }
    try {
      showToast(`Mengunggah ${file.name}...`);
      let data;
      if (isSupabaseMode()) {
        data = await supabaseUpload(file);
      } else {
        const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload gagal");
      }
      targetArray.push(data);
      renderFn();
      showToast(`${file.name} terunggah`);
    } catch (err) {
      showToast(`Gagal unggah ${file.name}: ${err.message}`);
    }
  }
}

function renderMediaChips(containerId, items, onRemove) {
  const el = $(containerId);
  if (!items || items.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = items
    .map((item, idx) => {
      const icon = isVideoFile(item) ? "🎬" : "📷";
      return `
        <span class="media-chip">
          <button type="button" class="media-chip-link" data-idx="${idx}" title="Lihat ${escapeHtml(item.name)}">${icon} ${escapeHtml(item.name)}</button>
          <button type="button" class="media-chip-del" data-del="${idx}" title="Hapus lampiran">&times;</button>
        </span>
      `;
    })
    .join("");

  el.querySelectorAll(".media-chip-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      openMediaLightbox("Pratinjau Lampiran", [items[idx]]);
    });
  });
  el.querySelectorAll(".media-chip-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      onRemove(Number(btn.dataset.del));
    });
  });
}

window.openMediaLightbox = function (title, items) {
  const list = asArray(items);
  $("mediaModalTitle").textContent = title;
  $("mediaModalBody").innerHTML = list
    .map((item) => {
      const mediaHtml = isVideoFile(item)
        ? `<video controls src="${escapeHtml(item.url)}"></video>`
        : `<img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}" />`;
      return `
        <div class="media-gallery-item">
          <div><strong>${escapeHtml(item.name)}</strong> <a href="${escapeHtml(item.url)}" target="_blank" class="btn-link" style="margin-left:8px;">Buka tab baru</a></div>
          ${mediaHtml}
        </div>
      `;
    })
    .join("");
  $("mediaModal").classList.remove("hidden");
};

window.openLogMedia = function (logId, stage) {
  const log = state.logs.find((l) => Number(l.id) === Number(logId));
  if (!log) return;
  const items = stage === "report" ? asArray(log.lampiran_report) : asArray(log.lampiran_resolve);
  const label = stage === "report" ? `Dokumentasi Report — Log #${logId}` : `Dokumentasi Resolve — Log #${logId}`;
  openMediaLightbox(label, items);
};

$("closeMediaModalBtn").addEventListener("click", () => $("mediaModal").classList.add("hidden"));
$("mediaModal").addEventListener("click", (e) => {
  if (e.target === $("mediaModal")) $("mediaModal").classList.add("hidden");
});

function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add("hidden"), 2800);
}

function getLocalDateStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getLocalTimeStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes === "") return "-";
  const m = Number(minutes);
  if (Number.isNaN(m)) return "-";
  if (m < 60) return `${m} mnt`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h} jam ${rem} mnt` : `${h} jam`;
}

function calcDurationMinutes(sDate, sTime, eDate, eTime) {
  if (!sDate || !sTime || !eDate || !eTime) return null;
  const start = new Date(`${sDate}T${sTime.length === 5 ? sTime + ":00" : sTime}`);
  const end = new Date(`${eDate}T${eTime.length === 5 ? eTime + ":00" : eTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diff = Math.round((end - start) / 60000);
  return diff < 0 ? 0 : diff;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSupabaseMode() {
  const cfg = window.APP_CONFIG || {};
  if (cfg.USE_SUPABASE === true) return true;
  if (cfg.USE_SUPABASE === false) return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

function getSupabaseCfg() {
  const cfg = window.APP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(cfg.SUPABASE_ANON_KEY || "").trim();
  const bucket = String(cfg.SUPABASE_BUCKET || "plant-media").trim();
  if (!url || !key || key.includes("PASTE_YOUR_")) {
    throw new Error("Isi SUPABASE_ANON_KEY di file public/config.js terlebih dahulu.");
  }
  return { url, key, bucket };
}

function supabaseHeaders(extra = {}) {
  const { key } = getSupabaseCfg();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

async function supabaseRest(path, options = {}) {
  const { url } = getSupabaseCfg();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders({
      "Content-Type": "application/json",
      ...(options.headers || {}),
    }),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && (data.message || data.error || data.hint)) || "Supabase request failed");
  }
  return data;
}

async function supabaseUpload(file) {
  const { url, bucket } = getSupabaseCfg();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  const objectPath = `${stamp}_${rand}_${safeName}`;
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    }),
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || "Gagal upload ke Supabase Storage");
  }
  return {
    name: file.name,
    url: `${url}/storage/v1/object/public/${bucket}/${objectPath}`,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

async function api(url, options = {}) {
  if (!isSupabaseMode()) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Terjadi kesalahan server");
    return data;
  }

  const cfg = window.APP_CONFIG || {};
  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;

  if (url === "/api/bootstrap" && method === "GET") {
    const [equipments, logs] = await Promise.all([
      supabaseRest("equipments?select=*&order=id.asc"),
      supabaseRest("problem_logs?select=*&order=id.asc"),
    ]);
    return {
      equipments: equipments || [],
      logs: logs || [],
      categories: cfg.CATEGORIES || ["elektrikal", "mekanikal", "material", "instrument"],
      statuses: cfg.STATUSES || ["critical", "moderate"],
      shifts: cfg.SHIFTS || ["Shift 1", "Shift 2", "Shift 3"],
    };
  }

  if (url === "/api/logs" && method === "POST") {
    const durasi = calcDurationMinutes(
      body.tanggal_problem_masuk,
      body.jam_problem_masuk,
      body.tanggal_problem_selesai,
      body.jam_problem_selesai
    );
    const payload = {
      ...body,
      durasi_menit: durasi,
      lampiran_report: asArray(body.lampiran_report),
      lampiran_resolve: asArray(body.lampiran_resolve),
    };
    const rows = await supabaseRest("problem_logs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    return rows[0];
  }

  const logMatch = url.match(/^\/api\/logs\/(\d+)$/);
  if (logMatch && method === "PUT") {
    const id = logMatch[1];
    const durasi = calcDurationMinutes(
      body.tanggal_problem_masuk,
      body.jam_problem_masuk,
      body.tanggal_problem_selesai,
      body.jam_problem_selesai
    );
    const payload = {
      ...body,
      durasi_menit: durasi,
      lampiran_report: asArray(body.lampiran_report),
      lampiran_resolve: asArray(body.lampiran_resolve),
    };
    const rows = await supabaseRest(`problem_logs?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    return rows[0];
  }

  if (logMatch && method === "DELETE") {
    const id = logMatch[1];
    await supabaseRest(`problem_logs?id=eq.${id}`, { method: "DELETE" });
    return { deleted: Number(id) };
  }

  if (url === "/api/equipments" && method === "POST") {
    const rows = await supabaseRest("equipments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    return rows[0];
  }

  const eqMatch = url.match(/^\/api\/equipments\/(\d+)$/);
  if (eqMatch && method === "PUT") {
    const id = eqMatch[1];
    const rows = await supabaseRest(`equipments?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    return rows[0];
  }

  throw new Error(`Endpoint tidak dikenal: ${method} ${url}`);
}

// --- User Name Gate ---
function initUserIdentity() {
  if (!state.userName) {
    $("nameModal").classList.remove("hidden");
    $("userNameInput").focus();
  } else {
    $("currentUserName").textContent = state.userName;
    if (!$("fPelapor").value) $("fPelapor").value = state.userName;
  }
}

$("nameForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = $("userNameInput").value.trim();
  if (!val) return;
  state.userName = val;
  localStorage.setItem("plant_logger_username", val);
  $("currentUserName").textContent = val;
  $("fPelapor").value = val;
  $("nameModal").classList.add("hidden");
  showToast(`Halo, ${val}`);
});

$("changeNameBtn").addEventListener("click", () => {
  $("userNameInput").value = state.userName;
  $("nameModal").classList.remove("hidden");
  $("userNameInput").focus();
});

// --- Tabs ---
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  });
});

// --- Populate Dropdowns ---
function getUniqueLines(onlyActive = false) {
  const lines = new Set(
    state.equipments
      .filter((e) => !onlyActive || e.is_active !== false)
      .map((e) => String(e.line))
  );
  return Array.from(lines).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
}

function populateSelectOptions() {
  const lines = getUniqueLines(true);
  const allLines = getUniqueLines(false);

  // Main form line
  const fLine = $("fLine");
  const curLine = fLine.value;
  fLine.innerHTML = `<option value="">-- Pilih Line --</option>` +
    lines.map((l) => `<option value="${escapeHtml(l)}">Line ${escapeHtml(l)}</option>`).join("");
  if (curLine) fLine.value = curLine;

  // Edit modal line
  $("eLine").innerHTML = allLines
    .map((l) => `<option value="${escapeHtml(l)}">Line ${escapeHtml(l)}</option>`)
    .join("");

  // Filters
  $("filterLine").innerHTML = `<option value="all">Semua Line</option>` +
    allLines.map((l) => `<option value="${escapeHtml(l)}">Line ${escapeHtml(l)}</option>`).join("");

  $("equipFilterLine").innerHTML = `<option value="all">Semua Line</option>` +
    allLines.map((l) => `<option value="${escapeHtml(l)}">Line ${escapeHtml(l)}</option>`).join("");

  const catOpts = state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  $("fKategori").innerHTML = catOpts;
  $("eKategori").innerHTML = catOpts;
  $("filterKategori").innerHTML = `<option value="all">Semua Kategori</option>` + catOpts;

  const statOpts = state.statuses.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  $("fStatus").innerHTML = statOpts;
  $("eStatus").innerHTML = statOpts;
  $("filterStatus").innerHTML = `<option value="all">Semua Severity</option>` + statOpts;

  const shiftOpts = `<option value="">-- Pilih Shift --</option>` +
    state.shifts.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  $("fShift").innerHTML = shiftOpts;
  $("eShift").innerHTML = shiftOpts;
}

function populateKodeByLine(lineVal, selectEl, equipmentInputEl, includeInactive = false) {
  if (!lineVal) {
    selectEl.innerHTML = `<option value="">-- Pilih Line dulu --</option>`;
    selectEl.disabled = true;
    equipmentInputEl.value = "";
    return;
  }
  const filtered = state.equipments.filter(
    (eq) => String(eq.line) === String(lineVal) && (includeInactive || eq.is_active !== false)
  );
  selectEl.disabled = false;
  selectEl.innerHTML =
    `<option value="">-- Pilih Kode Mesin --</option>` +
    filtered
      .map(
        (eq) =>
          `<option value="${escapeHtml(eq.kode_mesin)}" data-name="${escapeHtml(eq.jenis_equipment)}">${escapeHtml(eq.kode_mesin)} — ${escapeHtml(eq.jenis_equipment)}</option>`
      )
      .join("");
}

$("fLine").addEventListener("change", () => {
  populateKodeByLine($("fLine").value, $("fKode"), $("fEquipment"), false);
});

$("fKode").addEventListener("change", () => {
  const opt = $("fKode").selectedOptions[0];
  $("fEquipment").value = opt && opt.dataset.name ? opt.dataset.name : "";
});

$("eLine").addEventListener("change", () => {
  populateKodeByLine($("eLine").value, $("eKode"), $("eEquipment"), true);
});

$("eKode").addEventListener("change", () => {
  const opt = $("eKode").selectedOptions[0];
  $("eEquipment").value = opt && opt.dataset.name ? opt.dataset.name : "";
});

// --- Main Form Time & Media Helpers ---
function renderFormMediaPreviews() {
  renderMediaChips("fReportPreview", state.formReportMedia, (idx) => {
    state.formReportMedia.splice(idx, 1);
    renderFormMediaPreviews();
  });
  renderMediaChips("fResolvePreview", state.formResolveMedia, (idx) => {
    state.formResolveMedia.splice(idx, 1);
    renderFormMediaPreviews();
  });
}

$("fReportFiles").addEventListener("change", async (e) => {
  await uploadMediaFiles(e.target.files, state.formReportMedia, renderFormMediaPreviews);
  e.target.value = "";
});

$("fResolveFiles").addEventListener("change", async (e) => {
  await uploadMediaFiles(e.target.files, state.formResolveMedia, renderFormMediaPreviews);
  e.target.value = "";
});

function resetLogFormDefaults() {
  $("fTanggalMasuk").value = getLocalDateStr();
  $("fJamMasuk").value = getLocalTimeStr();
  $("fPelapor").value = state.userName || "";
  $("fTanggalSelesai").value = "";
  $("fJamSelesai").value = "";
  $("fDeskripsi").value = "";
  $("fPic").value = "";
  $("fKegiatanPerbaikan").value = "";
  state.formReportMedia = [];
  state.formResolveMedia = [];
  renderFormMediaPreviews();
}

$("nowMasukBtn").addEventListener("click", () => {
  $("fTanggalMasuk").value = getLocalDateStr();
  $("fJamMasuk").value = getLocalTimeStr();
});

$("clearSelesaiFormBtn").addEventListener("click", () => {
  $("fTanggalSelesai").value = "";
  $("fJamSelesai").value = "";
});

$("resetFormBtn").addEventListener("click", () => {
  $("logForm").reset();
  populateKodeByLine("", $("fKode"), $("fEquipment"), false);
  resetLogFormDefaults();
});

// --- Create Problem Log ---
$("logForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    line: $("fLine").value,
    kode: $("fKode").value,
    nama_equipment: $("fEquipment").value,
    kategori: $("fKategori").value,
    status: $("fStatus").value,
    shift: $("fShift").value,
    tanggal_problem_masuk: $("fTanggalMasuk").value,
    jam_problem_masuk: $("fJamMasuk").value,
    pelapor: $("fPelapor").value.trim(),
    deskripsi_kendala: $("fDeskripsi").value.trim(),
    pic_teknisi: $("fPic").value.trim(),
    deskripsi_kegiatan_perbaikan: $("fKegiatanPerbaikan").value.trim(),
    lampiran_report: state.formReportMedia,
    lampiran_resolve: state.formResolveMedia,
    tanggal_problem_selesai: $("fTanggalSelesai").value,
    jam_problem_selesai: $("fJamSelesai").value,
  };

  try {
    const created = await api("/api/logs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.logs.push(created);
    renderAll();
    $("fDeskripsi").value = "";
    $("fKegiatanPerbaikan").value = "";
    $("fTanggalSelesai").value = "";
    $("fJamSelesai").value = "";
    state.formReportMedia = [];
    state.formResolveMedia = [];
    renderFormMediaPreviews();
    $("fTanggalMasuk").value = getLocalDateStr();
    $("fJamMasuk").value = getLocalTimeStr();
    showToast(`Problem #${created.id} berhasil dicatat`);
  } catch (err) {
    showToast("Gagal menyimpan: " + err.message);
  }
});

// --- Render KPIs & Category Breakdown ---
function renderDashboard() {
  const total = state.logs.length;
  const openLogs = state.logs.filter((l) => !l.tanggal_problem_selesai || !l.jam_problem_selesai);
  const criticalOpen = openLogs.filter((l) => l.status === "critical").length;
  const totalMinutes = state.logs.reduce((acc, l) => acc + (Number(l.durasi_menit) || 0), 0);

  $("kpiTotal").textContent = total;
  $("kpiOpen").textContent = openLogs.length;
  $("kpiCriticalOpen").textContent = criticalOpen;
  $("kpiDowntime").textContent = formatDuration(totalMinutes);

  const counts = {};
  state.categories.forEach((c) => (counts[c] = 0));
  state.logs.forEach((l) => {
    counts[l.kategori] = (counts[l.kategori] || 0) + 1;
  });

  const maxVal = Math.max(1, ...Object.values(counts));
  $("categoryBars").innerHTML = Object.entries(counts)
    .map(([cat, count]) => {
      const pct = Math.round((count / maxVal) * 100);
      return `
        <div class="cat-item">
          <div class="cat-top">
            <span>${escapeHtml(cat)}</span>
            <span>${count}</span>
          </div>
          <div class="cat-track">
            <div class="cat-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

// --- Render Logs Table ---
function getFilteredLogs() {
  const q = $("filterSearch").value.trim().toLowerCase();
  const prog = $("filterProgress").value;
  const line = $("filterLine").value;
  const kat = $("filterKategori").value;
  const stat = $("filterStatus").value;
  const dFrom = $("filterDateFrom").value;
  const dTo = $("filterDateTo").value;

  return state.logs
    .filter((l) => {
      const isResolved = Boolean(l.tanggal_problem_selesai && l.jam_problem_selesai);
      if (prog === "open" && isResolved) return false;
      if (prog === "resolved" && !isResolved) return false;
      if (line !== "all" && String(l.line) !== line) return false;
      if (kat !== "all" && l.kategori !== kat) return false;
      if (stat !== "all" && l.status !== stat) return false;
      if (dFrom && l.tanggal_problem_masuk < dFrom) return false;
      if (dTo && l.tanggal_problem_masuk > dTo) return false;
      if (q) {
        const kegiatan = l.deskripsi_kegiatan_perbaikan || l.tindakan || "";
        const hay = `${l.id} ${l.kode} ${l.nama_equipment} ${l.deskripsi_kendala} ${kegiatan} ${l.pelapor} ${l.pic_teknisi}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => Number(b.id) - Number(a.id));
}

function renderLogsTable() {
  const rows = getFilteredLogs();
  $("logCountInfo").textContent = `${rows.length} dari ${state.logs.length} log`;

  if (rows.length === 0) {
    $("logsTableBody").innerHTML = `<tr><td colspan="14" class="muted" style="text-align:center;padding:24px;">Tidak ada data log yang sesuai filter.</td></tr>`;
    return;
  }

  $("logsTableBody").innerHTML = rows
    .map((l) => {
      const isResolved = Boolean(l.tanggal_problem_selesai && l.jam_problem_selesai);
      const sevBadge = l.status === "critical" ? "badge-critical" : "badge-moderate";
      const progBadge = isResolved
        ? `<span class="badge badge-resolved">Resolved</span>`
        : `<span class="badge badge-open">Open</span>`;
      const kegiatan = l.deskripsi_kegiatan_perbaikan || l.tindakan || "";
      const repFiles = asArray(l.lampiran_report);
      const resFiles = asArray(l.lampiran_resolve);
      const docBtns = [];
      if (repFiles.length > 0) {
        docBtns.push(`<button type="button" class="doc-btn" onclick="openLogMedia(${l.id}, 'report')">📷 Report (${repFiles.length})</button>`);
      }
      if (resFiles.length > 0) {
        docBtns.push(`<button type="button" class="doc-btn" onclick="openLogMedia(${l.id}, 'resolve')">✅ Resolve (${resFiles.length})</button>`);
      }

      return `
        <tr>
          <td class="mono">#${l.id}</td>
          <td class="mono">${escapeHtml(l.tanggal_problem_masuk)}<br>${escapeHtml(l.jam_problem_masuk)}</td>
          <td>Line ${escapeHtml(l.line)}</td>
          <td>
            <strong class="mono">${escapeHtml(l.kode)}</strong><br>
            <span class="muted">${escapeHtml(l.nama_equipment)}</span>
          </td>
          <td><span class="badge badge-cat">${escapeHtml(l.kategori)}</span></td>
          <td>${escapeHtml(l.deskripsi_kendala)}</td>
          <td>${kegiatan ? escapeHtml(kegiatan) : `<span class="muted">-</span>`}</td>
          <td><div class="doc-badges">${docBtns.length ? docBtns.join("") : `<span class="muted">-</span>`}</div></td>
          <td><span class="badge ${sevBadge}">${escapeHtml(l.status)}</span></td>
          <td>${progBadge}</td>
          <td class="mono">${isResolved ? `${escapeHtml(l.tanggal_problem_selesai)}<br>${escapeHtml(l.jam_problem_selesai)}` : `<span class="muted">Belum selesai</span>`}</td>
          <td class="mono">${formatDuration(l.durasi_menit)}</td>
          <td>
            <div>${escapeHtml(l.pelapor || "-")}</div>
            ${l.pic_teknisi ? `<div class="muted">PIC: ${escapeHtml(l.pic_teknisi)}</div>` : ""}
          </td>
          <td>
            <div class="actions-cell">
              ${!isResolved ? `<button type="button" class="btn btn-success btn-sm" onclick="openEditLogModal(${l.id}, true)">Selesaikan</button>` : ""}
              <button type="button" class="btn btn-ghost btn-sm" onclick="openEditLogModal(${l.id}, false)">Edit</button>
              <button type="button" class="btn btn-danger btn-sm" onclick="deleteLog(${l.id})">Hapus</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

["filterSearch", "filterProgress", "filterLine", "filterKategori", "filterStatus", "filterDateFrom", "filterDateTo"].forEach((id) => {
  $(id).addEventListener("input", renderLogsTable);
  $(id).addEventListener("change", renderLogsTable);
});

$("resetFilterBtn").addEventListener("click", () => {
  $("filterSearch").value = "";
  $("filterProgress").value = "all";
  $("filterLine").value = "all";
  $("filterKategori").value = "all";
  $("filterStatus").value = "all";
  $("filterDateFrom").value = "";
  $("filterDateTo").value = "";
  renderLogsTable();
});

// --- Edit / Resolve Log Modal ---
function updateDurationPreview() {
  const mins = calcDurationMinutes(
    $("eTanggalMasuk").value,
    $("eJamMasuk").value,
    $("eTanggalSelesai").value,
    $("eJamSelesai").value
  );
  $("eDurationPreview").textContent = mins === null ? "Open (Belum selesai)" : formatDuration(mins);
}

function renderEditMediaPreviews() {
  renderMediaChips("eReportPreview", state.editReportMedia, (idx) => {
    state.editReportMedia.splice(idx, 1);
    renderEditMediaPreviews();
  });
  renderMediaChips("eResolvePreview", state.editResolveMedia, (idx) => {
    state.editResolveMedia.splice(idx, 1);
    renderEditMediaPreviews();
  });
}

$("eReportFiles").addEventListener("change", async (e) => {
  await uploadMediaFiles(e.target.files, state.editReportMedia, renderEditMediaPreviews);
  e.target.value = "";
});

$("eResolveFiles").addEventListener("change", async (e) => {
  await uploadMediaFiles(e.target.files, state.editResolveMedia, renderEditMediaPreviews);
  e.target.value = "";
});

window.openEditLogModal = function (id, quickResolve = false) {
  const log = state.logs.find((l) => Number(l.id) === Number(id));
  if (!log) return;

  $("editLogId").value = log.id;
  $("editLogIdLabel").textContent = log.id;
  $("eLine").value = String(log.line);
  populateKodeByLine(log.line, $("eKode"), $("eEquipment"), true);
  $("eKode").value = log.kode;
  $("eEquipment").value = log.nama_equipment;
  $("eKategori").value = log.kategori;
  $("eStatus").value = log.status;
  $("eShift").value = log.shift || "";
  $("eDeskripsi").value = log.deskripsi_kendala || "";
  $("ePelapor").value = log.pelapor || "";
  $("ePic").value = log.pic_teknisi || "";
  $("eKegiatanPerbaikan").value = log.deskripsi_kegiatan_perbaikan || log.tindakan || "";
  $("eTanggalMasuk").value = log.tanggal_problem_masuk || "";
  $("eJamMasuk").value = log.jam_problem_masuk || "";
  state.editReportMedia = [...asArray(log.lampiran_report)];
  state.editResolveMedia = [...asArray(log.lampiran_resolve)];
  renderEditMediaPreviews();

  if (quickResolve && (!log.tanggal_problem_selesai || !log.jam_problem_selesai)) {
    $("eTanggalSelesai").value = getLocalDateStr();
    $("eJamSelesai").value = getLocalTimeStr();
    if (!$("ePic").value && state.userName) $("ePic").value = state.userName;
  } else {
    $("eTanggalSelesai").value = log.tanggal_problem_selesai || "";
    $("eJamSelesai").value = log.jam_problem_selesai || "";
  }

  updateDurationPreview();
  $("editLogModal").classList.remove("hidden");
};

["eTanggalMasuk", "eJamMasuk", "eTanggalSelesai", "eJamSelesai"].forEach((id) => {
  $(id).addEventListener("input", updateDurationPreview);
  $(id).addEventListener("change", updateDurationPreview);
});

$("fillNowResolveBtn").addEventListener("click", () => {
  $("eTanggalSelesai").value = getLocalDateStr();
  $("eJamSelesai").value = getLocalTimeStr();
  updateDurationPreview();
});

$("clearResolveBtn").addEventListener("click", () => {
  $("eTanggalSelesai").value = "";
  $("eJamSelesai").value = "";
  updateDurationPreview();
});

function closeEditModal() {
  $("editLogModal").classList.add("hidden");
}
$("closeEditModalBtn").addEventListener("click", closeEditModal);
$("cancelEditModalBtn").addEventListener("click", closeEditModal);

$("editLogForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("editLogId").value;
  const payload = {
    line: $("eLine").value,
    kode: $("eKode").value,
    nama_equipment: $("eEquipment").value,
    kategori: $("eKategori").value,
    status: $("eStatus").value,
    shift: $("eShift").value,
    deskripsi_kendala: $("eDeskripsi").value.trim(),
    pelapor: $("ePelapor").value.trim(),
    pic_teknisi: $("ePic").value.trim(),
    deskripsi_kegiatan_perbaikan: $("eKegiatanPerbaikan").value.trim(),
    lampiran_report: state.editReportMedia,
    lampiran_resolve: state.editResolveMedia,
    tanggal_problem_masuk: $("eTanggalMasuk").value,
    jam_problem_masuk: $("eJamMasuk").value,
    tanggal_problem_selesai: $("eTanggalSelesai").value,
    jam_problem_selesai: $("eJamSelesai").value,
  };

  try {
    const updated = await api(`/api/logs/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    const idx = state.logs.findIndex((l) => Number(l.id) === Number(id));
    if (idx !== -1) state.logs[idx] = updated;
    closeEditModal();
    renderAll();
    showToast(`Log #${id} berhasil diperbarui`);
  } catch (err) {
    showToast("Gagal memperbarui: " + err.message);
  }
});

window.deleteLog = async function (id) {
  if (!confirm(`Yakin ingin menghapus Problem Log #${id}?`)) return;
  try {
    await api(`/api/logs/${id}`, { method: "DELETE" });
    state.logs = state.logs.filter((l) => Number(l.id) !== Number(id));
    renderAll();
    showToast(`Log #${id} dihapus`);
  } catch (err) {
    showToast("Gagal menghapus: " + err.message);
  }
};

// --- Master Equipment ---
function renderEquipTable() {
  const q = $("equipSearch").value.trim().toLowerCase();
  const lineFilter = $("equipFilterLine").value;

  const rows = state.equipments.filter((eq) => {
    if (lineFilter !== "all" && String(eq.line) !== lineFilter) return false;
    if (q) {
      const hay = `${eq.kode_mesin} ${eq.jenis_equipment} ${eq.line}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  $("equipCount").textContent = rows.length;
  $("equipTableBody").innerHTML = rows
    .map((eq) => {
      const activeBadge =
        eq.is_active !== false
          ? `<span class="badge badge-resolved">Aktif</span>`
          : `<span class="badge badge-inactive">Non-aktif</span>`;
      return `
        <tr>
          <td class="mono">${eq.id}</td>
          <td>Line ${escapeHtml(eq.line)}</td>
          <td class="mono"><strong>${escapeHtml(eq.kode_mesin)}</strong></td>
          <td>${escapeHtml(eq.jenis_equipment)}</td>
          <td>${activeBadge}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-sm" onclick="openEditEquipModal(${eq.id})">Edit</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

$("equipSearch").addEventListener("input", renderEquipTable);
$("equipFilterLine").addEventListener("change", renderEquipTable);

$("equipForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    line: $("eqLine").value.trim(),
    kode_mesin: $("eqKode").value.trim(),
    jenis_equipment: $("eqJenis").value.trim(),
    is_active: true,
  };
  try {
    const created = await api("/api/equipments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.equipments.push(created);
    $("equipForm").reset();
    populateSelectOptions();
    renderEquipTable();
    showToast(`Equipment ${created.kode_mesin} ditambahkan`);
  } catch (err) {
    showToast("Gagal menambah equipment: " + err.message);
  }
});

window.openEditEquipModal = function (id) {
  const eq = state.equipments.find((x) => Number(x.id) === Number(id));
  if (!eq) return;
  $("editEqId").value = eq.id;
  $("editEqLine").value = eq.line;
  $("editEqKode").value = eq.kode_mesin;
  $("editEqJenis").value = eq.jenis_equipment;
  $("editEqActive").checked = eq.is_active !== false;
  $("editEquipModal").classList.remove("hidden");
};

function closeEquipModal() {
  $("editEquipModal").classList.add("hidden");
}
$("closeEquipModalBtn").addEventListener("click", closeEquipModal);
$("cancelEquipModalBtn").addEventListener("click", closeEquipModal);

$("editEquipForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("editEqId").value;
  const payload = {
    line: $("editEqLine").value.trim(),
    kode_mesin: $("editEqKode").value.trim(),
    jenis_equipment: $("editEqJenis").value.trim(),
    is_active: $("editEqActive").checked,
  };
  try {
    const updated = await api(`/api/equipments/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    const idx = state.equipments.findIndex((x) => Number(x.id) === Number(id));
    if (idx !== -1) state.equipments[idx] = updated;
    closeEquipModal();
    populateSelectOptions();
    renderEquipTable();
    showToast(`Equipment ${updated.kode_mesin} diperbarui`);
  } catch (err) {
    showToast("Gagal memperbarui equipment: " + err.message);
  }
});

// --- Export CSV ---
function escapeCsvCell(val) {
  const s = String(val ?? "");
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

$("exportCsvBtn").addEventListener("click", () => {
  if (!isSupabaseMode()) {
    window.location.href = "/api/export/csv";
    return;
  }
  const headers = [
    "id",
    "tanggal_problem_masuk",
    "jam_problem_masuk",
    "line",
    "kode",
    "nama equipment",
    "kategori",
    "deskripsi kendala",
    "status",
    "tanggal_problem_selesai",
    "jam_problem_selesai",
    "durasi_menit",
    "shift",
    "pelapor",
    "pic_teknisi",
    "deskripsi_kegiatan_perbaikan",
    "lampiran_report",
    "lampiran_resolve",
  ];
  const lines = [headers.join(",")];
  for (const l of state.logs) {
    const rep = asArray(l.lampiran_report).map((x) => x.name).join("; ");
    const res = asArray(l.lampiran_resolve).map((x) => x.name).join("; ");
    lines.push(
      [
        l.id,
        escapeCsvCell(l.tanggal_problem_masuk),
        escapeCsvCell(l.jam_problem_masuk),
        escapeCsvCell(l.line),
        escapeCsvCell(l.kode),
        escapeCsvCell(l.nama_equipment),
        escapeCsvCell(l.kategori),
        escapeCsvCell(l.deskripsi_kendala),
        escapeCsvCell(l.status),
        escapeCsvCell(l.tanggal_problem_selesai),
        escapeCsvCell(l.jam_problem_selesai),
        l.durasi_menit ?? "",
        escapeCsvCell(l.shift),
        escapeCsvCell(l.pelapor),
        escapeCsvCell(l.pic_teknisi),
        escapeCsvCell(l.deskripsi_kegiatan_perbaikan || l.tindakan || ""),
        escapeCsvCell(rep),
        escapeCsvCell(res),
      ].join(",")
    );
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "plant_problem_logs.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

// --- Bootstrap ---
function renderAll() {
  renderDashboard();
  renderLogsTable();
  renderEquipTable();
}

async function init() {
  try {
    const data = await api("/api/bootstrap");
    state.equipments = data.equipments || [];
    state.logs = data.logs || [];
    state.categories = data.categories || [];
    state.statuses = data.statuses || [];
    state.shifts = data.shifts || [];

    populateSelectOptions();
    resetLogFormDefaults();
    initUserIdentity();
    renderAll();
  } catch (err) {
    showToast("Gagal memuat data awal: " + err.message);
  }
}

init();
