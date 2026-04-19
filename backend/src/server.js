import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { customAlphabet } from "nanoid";
import { summarizeEventParticipants } from "./availability.js";
import {
  isIsoDate,
  normalizeExcludedDates,
  parseIsoDate
} from "./dateUtils.js";
import { readDb, writeDb } from "./store.js";

const app = express();
const PORT = process.env.PORT || 4000;
const nanoid = customAlphabet("123456789abcdefghijkmnopqrstuvwxyz", 8);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get("/api/events", (_req, res) => {
  cleanupOldEvents();
  const db = readDb();
  const nowIso = new Date().toISOString().slice(0, 10);

  const events = db.events
    .map((event) => {
      const participantCount = db.participants.filter(
        (p) => p.eventId === event.id
      ).length;
      const isActive = event.allowedEndDate
        ? event.allowedEndDate >= nowIso
        : true;
      return {
        ...event,
        participantCount,
        isActive
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ events });
});

function cleanupOldEvents() {
  const db = readDb();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString().slice(0, 10);

  writeDb((dbMut) => {
    const originalCount = dbMut.events.length;
    dbMut.events = dbMut.events.filter(event => {
      if (!event.createdAt) return true;
      const isRecent = event.createdAt.slice(0, 10) >= thirtyDaysAgoIso;
      const isNotExpired = !event.allowedEndDate || event.allowedEndDate >= thirtyDaysAgoIso;
      return isRecent || isNotExpired;
    });
    
    if (dbMut.events.length !== originalCount) {
      const remainingIds = new Set(dbMut.events.map(e => e.id));
      dbMut.participants = dbMut.participants.filter(p => remainingIds.has(p.eventId));
    }
  });
}

app.post("/api/events", (req, res) => {
  const { name, description, allowedStartDate, allowedEndDate } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Event name is required" });
  }
  if (!isIsoDate(allowedStartDate) || !isIsoDate(allowedEndDate)) {
    return res.status(400).json({
      error: "allowedStartDate and allowedEndDate are required (YYYY-MM-DD)"
    });
  }

  const allowedStart = parseIsoDate(allowedStartDate);
  const allowedEnd = parseIsoDate(allowedEndDate);
  if (!allowedStart || !allowedEnd || allowedStart > allowedEnd) {
    return res.status(400).json({ error: "Event date range is invalid" });
  }

  const eventId = nanoid();
  const now = new Date().toISOString();
  const event = {
    id: eventId,
    name: name.trim(),
    description: typeof description === "string" ? description.trim() : "",
    allowedStartDate,
    allowedEndDate,
    createdAt: now
  };

  writeDb((db) => {
    db.events.push(event);
  });

  res.status(201).json({
    event,
    eventUrl: `/event.html?eventId=${eventId}`
  });
});

app.get("/api/events/:eventId", (req, res) => {
  const { eventId } = req.params;
  const db = readDb();
  const event = db.events.find((e) => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const participants = db.participants
    .filter((p) => p.eventId === eventId)
    .map((p) => sanitizeParticipant(p));

  const summary = summarizeEventParticipants(participants);
  res.json({ event, participants, summary });
});

app.post("/api/events/:eventId/participants", (req, res) => {
  const { eventId } = req.params;
  const db = readDb();
  const event = db.events.find((e) => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const payload = validateParticipantPayload(req.body, event);
  if (!payload.ok) return res.status(400).json({ error: payload.error });

  const participantId = nanoid();
  const editToken = nanoid() + nanoid();
  const now = new Date().toISOString();

  const participant = {
    id: participantId,
    eventId,
    name: payload.value.name,
    startDate: payload.value.startDate,
    endDate: payload.value.endDate,
    excludedDates: payload.value.excludedDates,
    editToken,
    createdAt: now,
    updatedAt: now
  };

  writeDb((dbMut) => {
    dbMut.participants.push(participant);
  });

  res.status(201).json({
    participant: sanitizeParticipant(participant),
    editUrl: `/event.html?eventId=${eventId}&participantId=${participantId}&token=${editToken}`
  });
});

app.put("/api/events/:eventId/participants/:participantId", (req, res) => {
  const { eventId, participantId } = req.params;
  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Valid edit token is required" });
  }

  const dbForEvent = readDb();
  const event = dbForEvent.events.find((e) => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const payload = validateParticipantPayload(req.body, event);
  if (!payload.ok) return res.status(400).json({ error: payload.error });

  let updated;
  const db = writeDb((dbMut) => {
    const idx = dbMut.participants.findIndex(
      (p) => p.id === participantId && p.eventId === eventId
    );
    if (idx === -1) return;

    const existing = dbMut.participants[idx];
    if (existing.editToken !== token) return;

    dbMut.participants[idx] = {
      ...existing,
      name: payload.value.name,
      startDate: payload.value.startDate,
      endDate: payload.value.endDate,
      excludedDates: payload.value.excludedDates,
      updatedAt: new Date().toISOString()
    };
    updated = dbMut.participants[idx];
  });

  const exists = db.participants.find(
    (p) => p.id === participantId && p.eventId === eventId
  );
  if (!exists) return res.status(404).json({ error: "Participant not found" });
  if (!updated) return res.status(403).json({ error: "Invalid token" });

  res.json({ participant: sanitizeParticipant(updated) });
});

app.delete("/api/events/:eventId/participants/:participantId", (req, res) => {
  const { eventId, participantId } = req.params;
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "Valid token query parameter is required" });
  }

  const dbRead = readDb();
  const event = dbRead.events.find((e) => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  let deleted = false;
  const db = writeDb((dbMut) => {
    const idx = dbMut.participants.findIndex(
      (p) => p.id === participantId && p.eventId === eventId
    );
    if (idx === -1) return;
    if (dbMut.participants[idx].editToken !== token) return;

    dbMut.participants.splice(idx, 1);
    deleted = true;
  });

  const exists = db.participants.find(
    (p) => p.id === participantId && p.eventId === eventId
  );
  if (!exists && !deleted) return res.status(404).json({ error: "Participant not found" });
  if (!deleted) return res.status(403).json({ error: "Invalid token" });

  res.status(204).send();
});

app.delete("/api/events/:eventId", (req, res) => {
  const { eventId } = req.params;
  const dbRead = readDb();
  const event = dbRead.events.find((e) => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  let deleted = false;
  writeDb((dbMut) => {
    const eventIdx = dbMut.events.findIndex((e) => e.id === eventId);
    if (eventIdx !== -1) {
      dbMut.events.splice(eventIdx, 1);
      // Also delete all participants for this event
      dbMut.participants = dbMut.participants.filter((p) => p.eventId !== eventId);
      deleted = true;
    }
  });

  if (!deleted) return res.status(404).json({ error: "Event not found" });
  res.status(204).send();
});

app.get("/api/events/:eventId/summary", (req, res) => {
  const { eventId } = req.params;
  const db = readDb();
  const event = db.events.find((e) => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const participants = db.participants
    .filter((p) => p.eventId === eventId)
    .map((p) => sanitizeParticipant(p));
  const summary = summarizeEventParticipants(participants);

  res.json({ event, summary, participantCount: participants.length });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

function sanitizeParticipant(participant) {
  return {
    id: participant.id,
    eventId: participant.eventId,
    name: participant.name,
    startDate: participant.startDate,
    endDate: participant.endDate,
    excludedDates: participant.excludedDates,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt
  };
}

function validateParticipantPayload(body, event) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const startDate = body?.startDate;
  const endDate = body?.endDate;
  const excludedDates = body?.excludedDates;

  if (!name) return { ok: false, error: "Name is required" };
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return { ok: false, error: "startDate and endDate must be YYYY-MM-DD" };
  }

  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || start > end) {
    return { ok: false, error: "Date range is invalid" };
  }

  if (event?.allowedStartDate && event?.allowedEndDate) {
    if (startDate < event.allowedStartDate || endDate > event.allowedEndDate) {
      return {
        ok: false,
        error: `Date range must stay within ${event.allowedStartDate} and ${event.allowedEndDate}`
      };
    }
  }

  return {
    ok: true,
    value: {
      name,
      startDate,
      endDate,
      excludedDates: normalizeExcludedDates(excludedDates, startDate, endDate)
    }
  };
}

function sanitizeEvent(event, includePassword = false) {
  const { password, ...rest } = event;
  return includePassword ? event : { ...rest, hasPassword: !!password };
}
