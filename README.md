# When Are We Meeting?

Simple no-login event availability app.

## Features

- Create or join event with an event code
- Add participant using only name
- Event creator sets allowed start/end dates
- Pick available date range and mark excluded dates
- Update/delete own entry using private edit link (token)
- Aggregation output:
  - best dates (max available people)
  - names available per date
  - best continuous 3/5/10 day ranges by guaranteed overlap
- Lightweight JSON file database at `backend/data/db.json`

## Run locally

```bash
cd backend
npm install
npm start
```

Open: `http://localhost:4000`

## API (minimal)

- `POST /api/events`
- `GET /api/events` (includes active events + participant counts)
- `GET /api/events/:eventId`
- `POST /api/events/:eventId/participants`
- `PUT /api/events/:eventId/participants/:participantId` (requires `token` in body)
- `DELETE /api/events/:eventId/participants/:participantId?token=...`
- `GET /api/events/:eventId/summary`

`POST /api/events` requires: `name`, `allowedStartDate`, `allowedEndDate`.

## Deploy notes

- This is a single Node.js service that serves API + frontend.
- Persist `backend/data/db.json` using a mounted volume in production.
