const params = new URLSearchParams(window.location.search);
const eventId = params.get("eventId");
const prefilledName = params.get("name") || "";
let participantId = params.get("participantId") || null;
let token = params.get("token") || null;
let currentEvent = null;

const eventTitle = document.getElementById("eventTitle");
const eventMeta = document.getElementById("eventMeta");
const eventDescription = document.getElementById("eventDescription");
const participantForm = document.getElementById("participantForm");
const participantName = document.getElementById("participantName");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const dateGrid = document.getElementById("dateGrid");
const formMessage = document.getElementById("formMessage");
const editLinkWrap = document.getElementById("editLinkWrap");
const deleteButton = document.getElementById("deleteButton");

const bestDatesEl = document.getElementById("bestDates");
const bestRangesEl = document.getElementById("bestRanges");
const allDatesEl = document.getElementById("allDates");
const participantsEl = document.getElementById("participants");

const excludedDates = new Set();

if (prefilledName) {
  participantName.value = prefilledName;
}

if (eventId) {
  const local = readLocalEdit(eventId);
  if (!participantId && local?.participantId) participantId = local.participantId;
  if (!token && local?.token) token = local.token;
  refreshEvent();
  setInterval(refreshEvent, 8000);
} else {
  eventTitle.textContent = "Error: No Event ID provided";
}

let lastSummaryData = null;

const showAddDatesBtn = document.getElementById("showAddDates");
const hideAddDatesBtn = document.getElementById("hideAddDates");
const formOverlay = document.getElementById("formOverlay");

showAddDatesBtn?.addEventListener("click", () => {
  formOverlay.classList.remove("hidden");
  rebuildDateGrid();
});

hideAddDatesBtn?.addEventListener("click", () => {
  formOverlay.classList.add("hidden");
});

// Close overlay on outside click
formOverlay?.addEventListener("click", (e) => {
  if (e.target === formOverlay) {
    formOverlay.classList.add("hidden");
  }
});

const deleteEventButton = document.getElementById("deleteEventButton");
const findBestButton = document.getElementById("findBestButton");
const searchStart = document.getElementById("searchStart");
const searchEnd = document.getElementById("searchEnd");
const searchDuration = document.getElementById("searchDuration");
const searchResult = document.getElementById("searchResult");
const planningResults = document.getElementById("planningResults");

deleteEventButton?.addEventListener("click", async () => {
  if (!eventId) return;
  if (!window.confirm("ARE YOU SURE? This will delete the entire event and all participants' data permanently.")) return;

  try {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
    alert("Event deleted.");
    window.location.href = "/";
  } catch (err) {
    alert(err.message);
  }
});

findBestButton?.addEventListener("click", () => {
  if (!lastSummaryData) return;
  planningResults.classList.remove("hidden");
  runFindBestAlgorithm(lastSummaryData);
});

async function refreshEvent() {
  try {
    const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Cannot load event");

    renderEvent(data);
    autoFillIfEditing(data.participants);
  } catch (err) {
    eventTitle.textContent = err.message;
  }
}

// Event Listeners for Date Selection
startDate?.addEventListener("change", rebuildDateGrid);
endDate?.addEventListener("change", rebuildDateGrid);

participantForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  formMessage.textContent = "Saving...";

  const payload = {
    name: participantName.value.trim(),
    startDate: startDate.value,
    endDate: endDate.value,
    excludedDates: [...excludedDates].sort()
  };

  try {
    localStorage.setItem("wam_user_name", payload.name);

    if (participantId && token) {
      const res = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/participants/${encodeURIComponent(participantId)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, token })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      formMessage.textContent = "Successfully Updated";
    } else {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      participantId = data.participant.id;
      const url = new URL(data.editUrl, window.location.origin);
      token = url.searchParams.get("token");
      saveLocalEdit(eventId, participantId, token);
      showEditLink(url.toString());
      deleteButton.classList.remove("hidden");
      formMessage.textContent = "Availability Saved!";
    }

    await refreshEvent();
    // Auto-hide form after success after 1.5s
    setTimeout(() => {
        formOverlay.classList.add("hidden");
        formMessage.textContent = "";
    }, 1500);
  } catch (err) {
    formMessage.textContent = err.message;
  }
});

deleteButton?.addEventListener("click", async () => {
  if (!participantId || !token) return;
  if (!window.confirm("Delete your availability from this event?")) return;

  try {
    const res = await fetch(
      `/api/events/${encodeURIComponent(eventId)}/participants/${encodeURIComponent(participantId)}?token=${encodeURIComponent(token)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Delete failed");
    }

    clearLocalEdit(eventId);
    participantId = null;
    token = null;
    participantForm.reset();
    excludedDates.clear();
    rebuildDateGrid();
    deleteButton.classList.add("hidden");
    editLinkWrap.textContent = "";
    formMessage.textContent = "Deleted";
    await refreshEvent();
    setTimeout(() => formOverlay.classList.add("hidden"), 1000);
  } catch (err) {
    formMessage.textContent = err.message;
  }
});

function renderEvent(data) {
  currentEvent = data.event;
  eventTitle.textContent = data.event.name;
  
  const rangeText = data.event.allowedStartDate && data.event.allowedEndDate
      ? `${data.event.allowedStartDate} to ${data.event.allowedEndDate}`
      : "not set";
  
  eventMeta.innerHTML = `
    <div style="display:flex; gap: 12px; align-items:center; flex-wrap: wrap;">
      <span>ID: <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">${data.event.id}</code></span>
      <button class="secondary" style="padding: 2px 8px; font-size: 0.75rem;" onclick="copyToClipboard('${data.event.id}', this)">Copy ID</button>
      <span style="color: var(--text-muted); padding-left: 8px;">• ${rangeText}</span>
    </div>
  `;
  eventDescription.textContent = data.event.description || "";

  startDate.min = data.event.allowedStartDate || "";
  startDate.max = data.event.allowedEndDate || "";
  endDate.min = data.event.allowedStartDate || "";
  endDate.max = data.event.allowedEndDate || "";

  if (!startDate.value && data.event.allowedStartDate) {
    startDate.value = data.event.allowedStartDate;
  }
  if (!endDate.value && data.event.allowedEndDate) {
    endDate.value = data.event.allowedEndDate;
  }

  if (!participantName.value.trim()) {
    const savedName = localStorage.getItem("wam_user_name") || "";
    if (savedName) participantName.value = savedName;
  }
  
  lastSummaryData = data;
  if (!searchStart.value && data.event.allowedStartDate) searchStart.value = data.event.allowedStartDate;
  if (!searchEnd.value && data.event.allowedEndDate) searchEnd.value = data.event.allowedEndDate;

  rebuildDateGrid();

  participantsEl.innerHTML = "";
  for (const p of data.participants) {
    const div = document.createElement("div");
    div.className = "participant-item";
    div.innerHTML = `
      <div>
        <strong style="color: var(--primary);">${escapeHtml(p.name)}</strong>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${p.startDate} - ${p.endDate}</div>
      </div>
      <span style="font-size: 0.75rem; font-weight: 600; background: #e2e8f0; padding: 2px 8px; border-radius: 20px;">${p.excludedDates.length} off</span>
    `;
    participantsEl.appendChild(div);
  }

  renderHeatmap(data.summary.perDate, data.participants.length);
}

function renderHeatmap(perDate, totalParticipants, highlightStart = null, highlightEnd = null) {
  allDatesEl.innerHTML = "";
  if (!perDate.length) {
    allDatesEl.innerHTML = "<p class='message'>No entries yet.</p>";
    return;
  }

  perDate.forEach((d) => {
    const cell = document.createElement("div");
    const ratio = totalParticipants > 0 ? d.availableCount / totalParticipants : 0;
    
    let intensity = "0";
    if (d.availableCount === totalParticipants && totalParticipants > 0) intensity = "high";
    else if (ratio > 0.75) intensity = "4";
    else if (ratio > 0.5) intensity = "3";
    else if (ratio > 0.25) intensity = "2";
    else if (ratio > 0) intensity = "1";

    cell.className = `date-cell intensity-${intensity}`;
    
    // Smooth highlighting using border and shadow
    if (highlightStart && highlightEnd && d.date >= highlightStart && d.date <= highlightEnd) {
      cell.style.borderColor = "var(--primary)";
      cell.style.boxShadow = "0 0 0 2px var(--primary)";
      cell.style.transform = "scale(1.05)";
      cell.style.zIndex = "2";
    }

    const dateParts = d.date.split("-");
    cell.innerHTML = `
      <strong>${dateParts[2]}</strong>
      <span style="font-size: 0.7rem; opacity: 0.8;">${dateParts[1]}/${dateParts[0].slice(2)}</span>
      <div style="margin-top: 4px; font-weight: 700; font-size: 0.9rem;">${d.availableCount}/${totalParticipants}</div>
    `;

    cell.title = `Available (${d.availableCount}): ${d.names.join(", ") || "none"}`;
    cell.addEventListener("click", () => {
      showModal(d, totalParticipants);
    });

    allDatesEl.appendChild(cell);
  });
}

function showModal(data, total) {
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalContent = document.getElementById("modalContent");
  
  modalTitle.textContent = `Details for ${data.date}`;
  modalContent.innerHTML = `
    <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-radius: 12px; text-align: center;">
      <span style="font-size: 2rem; font-weight: 800; color: var(--primary);">${data.availableCount}</span>
      <span style="font-size: 1.1rem; color: var(--text-muted);"> / ${total} available</span>
    </div>
    <div style="margin-bottom: 12px;">
      <strong style="display:block; margin-bottom: 8px;">Who is free?</strong>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${data.names.map(name => `<span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;">${escapeHtml(name)}</span>`).join("") || "No one yet"}
      </div>
    </div>
  `;
  
  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.add("hidden");
  modal.style.display = "none";
}

window.copyToClipboard = (text, btn) => {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = originalText; }, 2000);
  });
}

function runFindBestAlgorithm(data) {
  const start = searchStart.value;
  const end = searchEnd.value;
  const duration = parseInt(searchDuration.value, 10);
  const total = data.participants.length;

  if (!start || !end || isNaN(duration) || duration < 1) {
    searchResult.innerHTML = "<p class='message danger'>Please fill range and duration correctly.</p>";
    return;
  }

  const subset = data.summary.perDate.filter(d => d.date >= start && d.date <= end);
  
  if (subset.length < duration) {
    searchResult.innerHTML = "<p class='message danger'>Range is smaller than duration.</p>";
    return;
  }

  const results = [];
  for (let i = 0; i <= subset.length - duration; i++) {
    const window = subset.slice(i, i + duration);
    const minAvailable = Math.min(...window.map(d => d.availableCount));
    
    if (minAvailable === total && total > 0) {
      results.push({
        startDate: window[0].date,
        endDate: window[window.length - 1].date,
        available: minAvailable
      });
    }
  }

  if (results.length === 0) {
    searchResult.innerHTML = "<section style='padding:1rem; background:#fef2f2; border:1px solid #fee2e2; border-radius:12px;'><p class='message danger' style='margin:0;'>No dates found where <strong>100%</strong> of the group is available for " + duration + " consecutive days.</p></section>";
    return;
  }

  const rows = results.map(r => `
    <div style="padding: 1rem; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 800; color: #166534; font-size: 1.1rem;">${r.startDate} to ${r.endDate}</div>
        <span style="font-size: 0.8rem; color: #15803d; font-weight: 600;">Perfect Window Found</span>
      </div>
      <button class="primary" style="padding: 6px 14px; font-size: 0.8rem; background: #166534;" onclick="highlightOnHeatmap('${r.startDate}', '${r.endDate}')">Highlight</button>
    </div>
  `).join("");
  
  searchResult.innerHTML = `<div style="margin-bottom:1rem; font-weight:600; color:var(--text-muted);">Found ${results.length} option(s):</div>${rows}`;
}

window.highlightOnHeatmap = (start, end) => {
  if (!lastSummaryData) return;
  renderHeatmap(lastSummaryData.summary.perDate, lastSummaryData.participants.length, start, end);
};

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function autoFillIfEditing(participants) {
  if (!participantId) return;
  const match = participants.find((p) => p.id === participantId);
  if (!match) return;

  participantName.value = match.name;
  if (!startDate.value) startDate.value = match.startDate;
  if (!endDate.value) endDate.value = match.endDate;

  if (!excludedDates.size) {
    for (const d of match.excludedDates) excludedDates.add(d);
    rebuildDateGrid();
  }

  deleteButton.classList.remove("hidden");
}

let isDown = false;
document.addEventListener("mousedown", () => { isDown = true; });
document.addEventListener("mouseup", () => { isDown = false; });

function rebuildDateGrid() {
  dateGrid.innerHTML = "";
  const start = parseDate(startDate.value);
  const end = parseDate(endDate.value);
  if (!start || !end || start > end) return;

  if (
    currentEvent?.allowedStartDate &&
    currentEvent?.allowedEndDate &&
    (startDate.value < currentEvent.allowedStartDate ||
      endDate.value > currentEvent.allowedEndDate)
  ) {
    formMessage.textContent = `Range must be within ${currentEvent.allowedStartDate} and ${currentEvent.allowedEndDate}.`;
    return;
  }
  formMessage.textContent = "";

  const dates = eachDate(start, end);

  for (const d of dates) {
    const btn = document.createElement("div");
    btn.className = "select-cell " + (excludedDates.has(d) ? "unavailable" : "available");
    btn.dataset.date = d;
    btn.textContent = d.split("-")[2];

    const toggle = () => {
      if (excludedDates.has(d)) {
        excludedDates.delete(d);
        btn.className = "select-cell available";
      } else {
        excludedDates.add(d);
        btn.className = "select-cell unavailable";
      }
    };

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      toggle();
    });

    btn.addEventListener("mouseenter", () => {
      if (isDown) toggle();
    });

    dateGrid.appendChild(btn);
  }

  const allowed = new Set(dates);
  for (const d of [...excludedDates]) {
    if (!allowed.has(d)) excludedDates.delete(d);
  }
}

function eachDate(start, end) {
  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

function saveLocalEdit(eventIdValue, participantIdValue, tokenValue) {
  localStorage.setItem(
    `wam_edit_${eventIdValue}`,
    JSON.stringify({ participantId: participantIdValue, token: tokenValue })
  );
}

function readLocalEdit(eventIdValue) {
  try {
    const raw = localStorage.getItem(`wam_edit_${eventIdValue}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearLocalEdit(eventIdValue) {
  localStorage.removeItem(`wam_edit_${eventIdValue}`);
}

function showEditLink(url) {
  editLinkWrap.innerHTML = `Private edit link: <a href="${url}" style="color: var(--primary); font-weight:600;">Click to copy/save</a>`;
}
