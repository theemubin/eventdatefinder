import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  allowedStartDate: String,
  allowedEndDate: String,
  createdAt: { type: Date, default: Date.now }
});

const participantSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  eventId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  startDate: String,
  endDate: String,
  excludedDates: [String],
  editToken: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const Event = mongoose.model("Event", eventSchema);
export const Participant = mongoose.model("Participant", participantSchema);

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("⚠️ MONGODB_URI not set. Attempting to use local dev DB...");
    await mongoose.connect("mongodb://localhost:27017/whenarewemeeting");
  } else {
    const maskedUri = uri.replace(/\/\/(.*):(.*)@/, "//****:****@");
    console.log(`📡 Connecting to MongoDB Atlas: ${maskedUri}`);
    await mongoose.connect(uri, {
      connectTimeoutMS: 10000, // 10s timeout
    });
  }
  console.log("✅ Successfully connected to MongoDB");
}
