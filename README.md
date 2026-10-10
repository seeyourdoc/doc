# SeeYourDoctor

Online doctor consultations: patients book a package, pay with Paystack (card, Apple Pay), then chat or video-call the doctor in a private room. Admin and doctor dashboards included.

```
index.html, book.html, ... css/ js/ assets/   the website (GitHub Pages, served from repo root)
server/    Node + Express API (Render)         supabase/  schema.sql (run once)
render.yaml  Render Blueprint for the API
```

## 1. Database (Supabase)
1. Create a project. In **SQL Editor**, run `supabase/schema.sql`. It creates all tables, locks them with row-level security (only the server can read or write), and seeds the 3 default packages.
2. **Authentication > Users > Add user**: create your admin account (email + password). Copy its UUID, then run:
   `insert into admins (auth_user_id, email) values ('<uuid>', 'you@example.com');`
3. From **Project Settings > API**, copy the URL, `anon` key and `service_role` key.

## 2. Video (LiveKit)
Create a LiveKit Cloud project and copy the WebSocket URL, API key and API secret. Rooms are created on demand per booking; recording is never started.

## 3. Email
Patient emails (booking confirmed, reminder, "your consultation is open", doctor sent a message, access ending, access ended) need an email provider. Without one the app still works and logs emails as "skipped" in the `notifications` table.
- **Gmail, no domain needed:** use a Gmail account (a dedicated one is best). Turn on 2-Step Verification, then create an App Password at myaccount.google.com/apppasswords. Set `GMAIL_USER` to the address and `GMAIL_APP_PASSWORD` to the 16-character password. Gmail allows roughly 500 emails a day.
- **Resend:** create an API key and verify a sending domain, then set `RESEND_API_KEY` and `MAIL_FROM`. Without a verified domain Resend only delivers to your own address.
After setting it, open **Website Settings > Email** in the admin dashboard and press **Send test email**.

## 4. Paystack
- Enable **USD** on your account, and **Apple Pay** under Settings > Preferences > Payment channels (if available for your account).
- Webhook URL (Settings > API Keys & Webhooks): `https://YOUR-API.onrender.com/api/webhooks/paystack`
- Use test keys first. Payments are only activated after the server verifies them with Paystack (webhook, callback page, or the background check), never because the browser came back from checkout.

## 5. Deploy the API (Render)
Use **New > Blueprint** and select this repo (it reads `render.yaml`), or create a **Web Service** by hand: root directory `server`, build `npm install`, start `npm start`. Fill in the variables from `server/.env.example`. `FRONTEND_URL` must be your exact GitHub Pages address, and `ALLOWED_ORIGINS` its origin (e.g. `https://yourname.github.io`). Check `https://YOUR-API.onrender.com/health`.

## 6. Deploy the site (GitHub Pages)
Edit `js/config.js` and set `API_BASE` to your Render URL. In the repo, go to Settings > Pages, choose "Deploy from a branch", branch `main`, folder `/ (root)`, and Save. Your site will be at `https://yourname.github.io/yourrepo/` (use exactly that for `FRONTEND_URL`).

## 7. First run
Open `login.html`, sign in as admin, then:
1. **Doctors**: add the doctor account (they sign in at the same login page and land on the doctor dashboard).
2. **Website Settings**: doctor name and photo link, contact email, countdown, currency, payment methods.
3. **Consultation Packages**: edit names, durations, prices.

## How it behaves
- **Countdown / availability** (Website Settings): "Bookings are open", start/end dates, and a countdown end time. When the countdown reaches zero the homepage switches to "closed" and the API refuses new bookings until you set a later time. Quick "set from now" fields set it in days and hours.
- **Access window**: a consultation opens 10 minutes before the patient's preferred time and ends after the package duration (4 h, 8 h, 1 week...). Admin can extend, terminate, reopen, or reassign the doctor from the booking.
- **Privacy**: each booking has its own room and a 256-bit random link. Doctors only see rooms assigned to them. No card data is stored. Video recordings are not made.
- **Prices** are stored in cents in the currency set in Website Settings. Changing currency does not convert existing prices.
- Refunds from the admin button call Paystack's refund API; check the result in your Paystack dashboard.

## Returning patients
After paying, the patient sees a popup with an **access code** (first name plus 4 digits, for example `Moses4821`) and must tick that they have copied it. To come back later they open **Return to your consultation** on the homepage (`return.html`) and enter the email they booked with plus the code. Five wrong tries lock that email for 30 minutes. Admins can see each booking's code in the booking details. The code is also in the confirmation email.

Existing databases need this once in the Supabase SQL editor: `supabase/migrations/001_access_code.sql`. Also run `002_notifications.sql` and `003_timezone.sql` (patient time zones for emails). Run them **before** deploying the new server code.

## Local development
Node 22 LTS. `cd server && cp .env.example .env && npm install && npm run dev`, then serve the repo root with any static server and point `API_BASE` at `http://localhost:3000` (add that origin to `ALLOWED_ORIGINS`).
