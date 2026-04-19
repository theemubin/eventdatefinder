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
import { connectDb, Event, Participant } from "./store.js";

const app = express();
const PORT = process.env.PORT || 4000;
const nanoid = customAlphabet("123456789abcdefghijkmnopqrstuvwxyz", 8);

// Connect to MongoDB
connectDb().catch(err => {
  console.error("Failed to connect to MongoDB", err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get("/api/events", async (_req, res) => {
  try {
    const nowIso = new Date().toISOString().slice(0, 10);
    const eventsData = await Event.find().sort({ createdAt: -1 }).lean();
    
    // Enrich with participant counts
    const events = await Promise.all(eventsData.map(async (event) => {
      const participantCount = await Participant.countDocuments({ eventId: event.id });
      const isActive = !event.allowedEndDate || event.allowedEndDate >= nowIso;
      return {
        ...event,
        participantCount,
        isActive
      };
    }));

    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/events", async (req, res) => {
  try {
    const { name, description, allowedStartDate, allowedEndDate } = req.body || {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "Event name is required" });
    if (!isIsoDate(allowedStartDate) || !isIsoDate(allowedEndDate)) return res.status(400).json({ error: "Start and End dates are required" });

    const eventId = nanoid();
    const event = await new Event({
      id: eventId,
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      allowedStartDate,
      allowedEndDate
    }).save();

    res.status(201).json({ event, eventUrl: `/event.html?eventId=${eventId}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/events/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findOne({ id: eventId }).lean();
    if (!event) return res.status(404).json({ error: "Event not found" });

    const participantsRaw = await Participant.find({ eventId }).lean();
    const participants = participantsRaw.map(p => sanitizeParticipant(p));
    const summary = summarizeEventParticipants(participants);

    res.json({ event, participants, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/events/:eventId/participants", async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findOne({ id: eventId }).lean();
    if (!event) return res.status(404).json({ error: "Event not found" });

    const payload = validateParticipantPayload(req.body, event);
    if (!payload.ok) return res.status(400).json({ error: payload.error });

    const participantId = nanoid();
    const editToken = nanoid() + nanoid();
    const participant = await new Participant({
      id: participantId,
      eventId,
      name: payload.value.name,
      startDate: payload.value.startDate,
      endDate: payload.value.endDate,
      excludedDates: payload.value.excludedDates,
      editToken
    }).save();

    res.status(201).json({
      participant: sanitizeParticipant(participant),
      editUrl: `/event.html?eventId=${eventId}&participantId=${participantId}&token=${editToken}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/events/:eventId/participants/:participantId", async (req, res) => {
  try {
    const { eventId, participantId } = req.params;
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "Token required" });

    const event = await Event.findOne({ id: eventId }).lean();
    if (!event) return res.status(404).json({ error: "Event not found" });

    const payload = validateParticipantPayload(req.body, event);
    if (!payload.ok) return res.status(400).json({ error: payload.error });

    const updated = await Participant.findOneAndUpdate(
      { id: participantId, eventId, editToken: token },
      {
        name: payload.value.name,
        startDate: payload.value.startDate,
        endDate: payload.value.endDate,
        excludedDates: payload.value.excludedDates,
        updatedAt: new Date()
      },
      { new: true }
    ).lean();

    if (!updated) return res.status(403).json({ error: "Invalid token or participant not found" });
    res.json({ participant: sanitizeParticipant(updated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/events/:eventId/participants/:participantId", async (req, res) => {
  try {
    const { eventId, participantId } = req.params;
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "Token required" });

    const deleted = await Participant.findOneAndDelete({ id: participantId, eventId, editToken: token });
    if (!deleted) return res.status(403).json({ error: "Invalid token or participant not found" });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/events/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;
    const deleted = await Event.findOneAndDelete({ id: eventId });
    if (!deleted) return res.status(404).json({ error: "Event not found" });

    await Participant.deleteMany({ eventId });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/events/:eventId/summary", async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findOne({ id: eventId }).lean();
    if (!event) return res.status(404).json({ error: "Event not found" });

    const participantsRaw = await Participant.find({ eventId }).lean();
    const participants = participantsRaw.map(p => sanitizeParticipant(p));
    const summary = summarizeEventParticipants(participants);

    res.json({ event, summary, participantCount: participants.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
