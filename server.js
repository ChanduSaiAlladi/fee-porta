import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(bodyParser.json());
// Connect to DB on first request
app.use((req, res, next) => {
  connectDB().then(next).catch(next);
});

app.use(cors());

// Static frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(__dirname));

let dbConnected = false;

// Lazy MongoDB connection
const connectDB = async () => {
  if (dbConnected) return;
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/feeportal";
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB Connected");
    dbConnected = true;
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
};

// Schemas
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: { type: String, enum: ["student", "faculty", "hod"], required: true }
});
const User = mongoose.model("User", userSchema);

const feeRequestSchema = new mongoose.Schema({
  studentName: String,
  regNumber: String,
  year: String,
  branch: String,
  section: String,
  feeType: { type: String, enum: ["semester", "minor"] },
  status: { type: String, default: "Pending" },
  reason: String,
  faculty: String,
  amount: Number,
  crtFee: { type: Number, default: 0 },
  attendance: { type: String, default: "" }
});
const FeeRequest = mongoose.model("FeeRequest", feeRequestSchema);

// Signup Route
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, designation } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword, role: designation });
    await newUser.save();
    res.json({ message: "Signup successful!", redirect: "/login.html" });
  } catch (err) {
    res.status(500).json({ error: "Signup failed" });
  }
});

// Login Route
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, "secret123", { expiresIn: "1h" });
    let redirect;
    if (user.role === "student") {
      redirect = "/main.html";
    } else if (user.role === "faculty") {
      redirect = "/faculty.html";
    } else if (user.role === "hod") {
      redirect = "/hod.html";
    } else {
      redirect = "/main.html";
    }
    res.json({ message: "Login successful", token, role: user.role, redirect });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

// Fee Request
app.post("/request-fee", async (req, res) => {
  const { studentName, regNumber, year, branch, section, feeType, amount, crtFee, attendance } = req.body;
  const newRequest = new FeeRequest({ 
    studentName, 
    regNumber, 
    year, 
    branch, 
    section, 
    feeType, 
    amount, 
    crtFee: crtFee || 0, 
    attendance: attendance || "" 
  });
  await newRequest.save();
  res.json({ message: "Fee request submitted successfully!" });
});

// Get pending requests for faculty
app.get("/requests", async (req, res) => {
  try {
    const requests = await FeeRequest.find({ status: "Pending" });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// Get all requests for HOD
app.get("/all-requests", async (req, res) => {
  try {
    const requests = await FeeRequest.find({});
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all requests" });
  }
});

// Faculty Approval
app.post("/faculty/update", async (req, res) => {
  const { id, status, reason, faculty } = req.body;
  const request = await FeeRequest.findById(id);
  if (!request) return res.status(404).json({ error: "Request not found" });

  request.status = status;
  request.reason = reason || "";
  request.faculty = faculty;
  await request.save();
  res.json({ message: "Request updated successfully!" });
});

// Get request by ID
app.get("/request/:id", async (req, res) => {
  try {
    const request = await FeeRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Request not found" });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch request" });
  }
});

// Status Check
app.get("/status/:regNumber", async (req, res) => {
  const request = await FeeRequest.findOne({ regNumber: req.params.regNumber });
  if (!request) return res.json({ status: "Not Found" });
  res.json(request);
});

// Payment
app.post("/pay-fee", async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await FeeRequest.findById(requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "Approved") return res.status(400).json({ error: "Request not approved for payment" });
    request.status = "Paid";
    await request.save();
    res.json({ message: "Payment successful!" });
  } catch (err) {
    res.status(500).json({ error: "Payment failed" });
  }
});

// Root route - redirect to signup
app.get("/", (req, res) => {
  res.redirect("/signup.html");
});

// Start server locally
const PORT = process.env.PORT || 3000;
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
}

// For Vercel serverless
export default app;
