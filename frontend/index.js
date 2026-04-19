const mainPortal = document.getElementById("mainPortal");
const viewActive = document.getElementById("viewActive");
const viewCreate = document.getElementById("viewCreate");
const viewJoin = document.getElementById("viewJoin");

const cardActive = document.getElementById("cardActive");
const cardCreate = document.getElementById("cardCreate");
const cardJoin = document.getElementById("cardJoin");

const backBtns = document.querySelectorAll(".back-btn");

const activeEventsList = document.getElementById("activeEventsList");
const createEventForm = document.getElementById("createEventForm");
const createEventMessage = document.getElementById("createEventMessage");
const joinByCodeForm = document.getElementById("joinByCodeForm");
const joinUserNameInput = document.getElementById("joinUserName");
const joinEventIdInput = document.getElementById("findEventId");

// Navigation Logic
function showView(view) {
  mainPortal.classList.add("hidden");
  viewActive.classList.add("hidden");
  viewCreate.classList.add("hidden");
  viewJoin.classList.add("hidden");
  view.classList.remove("hidden");
}

function showPortal() {
  mainPortal.classList.remove("hidden");
  viewActive.classList.add("hidden");
  viewCreate.classList.add("hidden");
  viewJoin.classList.add("hidden");
}

cardActive?.addEventListener("click", () => {
  showView(viewActive);
  loadActiveEvents();
});

cardCreate?.addEventListener("click", () => {
  showView(viewCreate);
});

cardJoin?.addEventListener("click", () => {
  showView(viewJoin);
});

backBtns.forEach(btn => {
  btn.addEventListener("click", showPortal);
});

// Fetching Logic
async function loadActiveEvents() {
  try {
    const res = await fetch("/api/events");
    const data = await res.json();
    renderEvents(data.events);
  } catch (err) {
    activeEventsList.innerHTML = `<p class="message danger">${err.message}</p>`;
  }
}

createEventForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  createEventMessage.textContent = "Launching...";

  const name = document.getElementById("eventName").value.trim();
  const description = document.getElementById("eventDescription").value.trim();
  const allowedStartDate = document.getElementById("allowedStartDate").value;
  const allowedEndDate = document.getElementById("allowedEndDate").value;

  try {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, allowedStartDate, allowedEndDate })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Launch failed");

    const userName = (joinUserNameInput?.value || "").trim();
    const targetUrl = new URL(data.eventUrl, window.location.origin);
    if (userName) targetUrl.searchParams.set("name", userName);
    window.location.href = targetUrl.pathname + targetUrl.search;
  } catch (err) {
    createEventMessage.textContent = err.message;
  }
});

joinByCodeForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const userName = joinUserNameInput.value.trim();
  const eventIdValue = joinEventIdInput.value.trim();
  if (!eventIdValue) return;

  const url = new URL("/event.html", window.location.origin);
  url.searchParams.set("eventId", eventIdValue);
  if (userName) url.searchParams.set("name", userName);
  window.location.href = url.pathname + url.search;
});

function renderEvents(events) {
  if (events.length === 0) {
    activeEventsList.innerHTML = `<p class="message" style="text-align: center; padding: 2rem;">No active events found. Be the first to start one!</p>`;
    return;
  }

  activeEventsList.innerHTML = events
    .map(event => `
      <div class="event-item" style="padding: 1.25rem; margin-bottom: 1rem; border-radius: 16px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: white; transition: all 0.2s;" onclick="window.location.href='/event.html?eventId=${event.id}'">
        <div>
          <div style="font-weight: 800; color: var(--primary); font-size: 1.2rem; margin-bottom: 4px;">${escapeHtml(event.name)}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; gap: 12px; font-weight: 500;">
            <span>👥 ${event.participantCount} joined</span>
            <span>📅 ${event.allowedStartDate.split("-").slice(1).join("/")} - ${event.allowedEndDate.split("-").slice(1).join("/")}</span>
          </div>
        </div>
        <div style="font-family: monospace; background: #f1f5f9; padding: 4px 10px; border-radius: 8px; font-size: 0.85rem; color: var(--text-muted); border: 1px solid var(--border);">${event.id}</div>
      </div>`)
    .join("");
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
