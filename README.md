# SyncQ: Real-Time Clinic Queue Management System

SyncQ is an event-driven, real-time queue management system designed for medical clinics. It eliminates waiting room anxiety by replacing static display boards with live-syncing WebSockets, dynamic wait-time calculations, and personalized mobile digital tickets.

## 🚀 Features
* **Zero-Refresh Real-Time Sync:** Powered by Socket.io, the reception dashboard and waiting room displays update globally in milliseconds.
* **Smart Triage & Line Jumping:** Emergency patients automatically bypass the standard queue without breaking the numbering sequence.
* **Dynamic Wait-Time Engine:** A live ticking chronometer calculates wait times based on queue position and active consultation length, rather than static averages.
* **Doctor Break Automation:** If the doctor is unavailable, the queue pauses, visually alerts the waiting room, and dynamically recalculates everyone's estimated wait.
* **The "+2 Re-queue Penalty":** Patients who miss their turn are moved to a 15-minute standby countdown and can be re-inserted automatically behind active patients.
* **QR Digital Tickets:** Patients scan a QR code to download a personalized digital token to their device, showing their exact position and personal wait time.
* **Accessibility:** Automated Text-to-Speech (TTS) announcements call out tokens and names in the waiting room.

## 🛠️ Tech Stack
* **Backend:** Node.js, Express.js
* **Database:** MongoDB Cloud (Mongoose)
* **Real-Time Engine:** Socket.io (WebSockets)
* **Frontend:** HTML5, CSS3, Vanilla JavaScript, html2canvas

## ⚙️ How to Run Locally

1. Clone the repository:
   git clone https://github.com/keshavarthank/queue-cure.git
   cd YOUR-REPO-NAME

2. Install dependencies:
   npm install express socket.io mongoose

3. Start the server:
   node server.js

4. Access the Application:
   * Receptionist Dashboard: http://localhost:3000/reception.html
   * TV Display Board: http://localhost:3000/patient.html
   * (Note: To test QR scanning on a mobile device, access the Receptionist Dashboard using your computer's local IPv4 network address instead of localhost).
