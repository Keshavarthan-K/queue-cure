const { setServers } = require('node:dns');
setServers(['8.8.8.8', '1.1.1.1']);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// --- DATABASE CONNECTION ---
const MONGO_URI = "mongodb+srv://clinicadmin:SecurePassword2026@cluster0.ycydl5t.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log("Successfully connected to MongoDB Cloud!"))
  .catch(err => console.error("Database connection error:", err));

// --- DATA SCHEMA ---
const patientSchema = new mongoose.Schema({
  tokenNumber: Number,
  sortOrder: Number,
  name: String,
  isUrgent: { type: Boolean, default: false },
  status: { type: String, default: 'waiting' }, 
  createdAt: { type: Date, default: Date.now },
  servedAt: Date,
  skippedAt: Date // NEW: Track exactly when they were skipped!
});

const Patient = mongoose.model('Patient', patientSchema);

let clinicState = {
  isPaused: false,
  resumeTime: null
};

// --- BROADCAST FUNCTION ---
async function broadcastQueueUpdate() {
  try {
    const currentPatient = await Patient.findOne({ status: 'serving' }).sort({ servedAt: -1 });
    const waitingPatients = await Patient.find({ status: 'waiting' }).sort({ isUrgent: -1, sortOrder: 1 });
    const standbyPatients = await Patient.find({ status: 'standby' }).sort({ tokenNumber: 1 });

    const averageConsultationTime = 10; 

    io.emit('queue_updated', {
      currentToken: currentPatient ? currentPatient.tokenNumber : "None",
      currentName: currentPatient ? currentPatient.name : "-",
      currentServedAt: currentPatient ? currentPatient.servedAt : null,
      tokensAhead: waitingPatients.length,
      estimatedWait: waitingPatients.length * averageConsultationTime,
      waitingList: waitingPatients,
      standbyList: standbyPatients,
      clinicState: clinicState
    });
  } catch (err) {
    console.error("Error broadcasting queue:", err);
  }
}

// --- API ROUTES ---

app.post('/api/add-patient', async (req, res) => {
  try {
    const { name, isUrgent } = req.body;
    const lastPatientByDate = await Patient.findOne().sort({ createdAt: -1 }); 
    const lastPatientBySort = await Patient.findOne().sort({ sortOrder: -1 });

    let nextToken = 1;
    let nextSortOrder = 1;
    
    if (lastPatientByDate) {
      const lastPatientDate = new Date(lastPatientByDate.createdAt).toDateString();
      const todayDate = new Date().toDateString();
      if (lastPatientDate === todayDate) {
         if (lastPatientByDate.tokenNumber < 999) {
             nextToken = lastPatientByDate.tokenNumber + 1;
         }
      } 
    }

    if (lastPatientBySort) {
        nextSortOrder = lastPatientBySort.sortOrder + 1;
    }

    const newPatient = new Patient({ 
      tokenNumber: nextToken, 
      sortOrder: nextSortOrder,
      name: name, 
      isUrgent: isUrgent 
    });
    
    await newPatient.save();
    await broadcastQueueUpdate();
    
    res.status(201).json({ success: true, tokenNumber: nextToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/call-next', async (req, res) => {
  try {
    if (clinicState.isPaused) {
      return res.status(400).json({ error: "Doctor is unavailable." });
    }

    await Patient.updateMany({ status: 'serving' }, { status: 'completed' });
    const nextPatient = await Patient.findOne({ status: 'waiting' }).sort({ isUrgent: -1, sortOrder: 1 });

    if (nextPatient) {
      nextPatient.status = 'serving';
      nextPatient.servedAt = new Date();
      await nextPatient.save();
    }
    
    await broadcastQueueUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- UPDATED: Skip Patient (15 Min Timeout) ---
app.post('/api/skip-patient', async (req, res) => {
  try {
    const { patientId } = req.body;
    const patient = await Patient.findById(patientId);

    if (patient.isUrgent) {
      return res.status(400).json({ error: "Cannot skip an emergency patient." });
    }

    patient.status = 'standby';
    patient.skippedAt = new Date(); // Record exactly when the timer started
    await patient.save();

    // 15 Minute Auto-Delete (15 * 60 * 1000)
    setTimeout(async () => {
      const checkPatient = await Patient.findById(patientId);
      if (checkPatient && checkPatient.status === 'standby') {
        await Patient.findByIdAndDelete(patientId);
        broadcastQueueUpdate(); 
      }
    }, 15 * 60 * 1000); 

    await broadcastQueueUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/requeue-patient', async (req, res) => {
  try {
    const { patientId } = req.body;
    const patient = await Patient.findById(patientId);
    
    if (patient) {
      const waitingList = await Patient.find({ status: 'waiting' }).sort({ isUrgent: -1, sortOrder: 1 });
      let newSortOrder = patient.tokenNumber;

      if (waitingList.length >= 2) {
        if (waitingList.length > 2) {
            newSortOrder = (waitingList[1].sortOrder + waitingList[2].sortOrder) / 2;
        } else {
            newSortOrder = waitingList[1].sortOrder + 1;
        }
      } else if (waitingList.length === 1) {
        newSortOrder = waitingList[0].sortOrder + 1;
      } else {
        newSortOrder = Date.now(); 
      }

      patient.status = 'waiting';
      patient.sortOrder = newSortOrder;
      patient.skippedAt = null; // Clear the timer!
      await patient.save();
    }
    
    await broadcastQueueUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pause', async (req, res) => {
  try {
    const { minutes } = req.body;
    clinicState.isPaused = true;
    clinicState.resumeTime = new Date(Date.now() + minutes * 60 * 1000);
    
    await Patient.updateMany({ status: 'serving' }, { status: 'completed' });

    broadcastQueueUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/resume', (req, res) => {
  clinicState.isPaused = false;
  clinicState.resumeTime = null;
  broadcastQueueUpdate();
  res.json({ success: true });
});

io.on('connection', (socket) => {
  broadcastQueueUpdate();
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));