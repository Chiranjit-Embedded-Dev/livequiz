# LiveQuiz — live audience quiz web app

A small working starter app for hosting a live quiz with attendee registration (name + email), event PIN and QR join link, multiple-choice questions, timed questions, automatic scoring, a host/projector dashboard, leaderboard, and CSV export that opens in Excel.

## Requirements
- Node.js 18 or newer
- Internet connection on first setup (to install packages and load the Socket.IO/QR libraries)

## Run locally
1. Install Node.js from https://nodejs.org/ if it is not installed.
2. Extract this folder.
3. Open a terminal/Command Prompt in the `live-quiz-app` folder.
4. Run `npm install`.
5. Run `npm start`.
6. On the host laptop, open http://localhost:3000.
7. Choose **Create / host quiz**, edit the sample question or add more, and click **Create event**.
8. Show the QR code and six-digit PIN on the projector. Participants on the same Wi-Fi can open the displayed join link or visit `http://HOST-LAPTOP-IP:3000` and enter the PIN. For QR links to work on phones, the host laptop and phones must be on the same network and the laptop firewall must allow Node.js on private networks.
9. Click **Start quiz**. Click **Reveal answer** to show the correct option. Click **Next question** to continue. After the final question, export results with **Export CSV for Excel**.

## Let phones connect on the same Wi-Fi
- Find the host laptop's local IPv4 address. On Windows, run `ipconfig` and look for the Wi-Fi adapter's IPv4 Address (for example, `192.168.1.25`).
- The laptop URL is `http://192.168.1.25:3000` (replace with your real address).
- Ensure the laptop and attendee phones are on the same Wi-Fi; guest Wi-Fi/client isolation may block devices from reaching each other.
- If Windows Firewall prompts, allow Node.js on private networks. You can also create an inbound TCP rule for port 3000 on a trusted private network.
- For remote/online events, deploy the app to a Node.js host that supports WebSockets and HTTPS, then use that public URL.

## Notes / limitations
- This is a starter implementation: events and scores live in server memory and are lost when the server restarts. It is intended for demos/small events, not production use yet.
- Anyone with the event PIN can attempt to join; there is no host login or event password. Add authentication, rate limiting, persistent database storage, and privacy/retention controls before public or sensitive use.
- Email addresses are collected for the host's CSV export. Inform participants how their details will be used and only collect what is needed.
- QR code is generated in the browser via a CDN library. The first page load needs internet access.
- The CSV export is Excel-compatible; it does not create a native `.xlsx` workbook.

## Files
- `server.js` — Express + Socket.IO server and quiz logic
- `public/index.html` — host, join and participant screens
- `public/style.css` — responsive styling
- `public/app.js` — real-time client logic
