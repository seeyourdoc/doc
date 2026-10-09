# SeeYourDoctor

Online doctor consultations: patients book a package, pay with Paystack (card, Apple Pay), then chat or video-call the doctor in a private room. Admin and doctor dashboards included.

```
web/       static site (GitHub Pages)      server/    Node + Express API (Render)
supabase/  schema.sql (run once)
```

## 1. Database (Supabase)
1. Create a project. In **SQL Editor**, run `supabase/schema.sql`. It creates all tables, locks them with row-level security (only the server can read or write), and seeds the 3 default packages.
2. **Authentication > Users > Add user**: create your admin account (email + password). Copy its UUID, then run:
   `insert into admins (auth_user_id, email) values ('<uuid>', 'you@example.com');`
3. From **Project Settings > API**, copy the URL, `anon` key and `service_role` key.

## 2. Video (LiveKit)
Create a LiveKit Cloud project and copy the WebSocket URL, API key and API secret. Rooms are created on demand per booking; recording is never started.

## 3. Email (Resend)
Create an API key and verify a sending domain. Without a key the app still works and logs emails as "skipped" in the `notifications` table.

## 4. Paystack
- Enable **USD** on your account, and **Apple Pay** under Settings > Preferences > Payment channels (if available for your account).
- Webhook URL (Settings > API Keys & Webhooks): `https://YOUR-API.onrender.com/api/webhooks/paystack`
- Use test keys first. Payments are only activated after the server verifies them with Paystack (webhook, callback page, or the background check), never because the browser came back from checkout.

## 5. Deploy the API (Render)
New **Web Service** from this repo: root directory `server`, build `npm install`, start `npm start`. Add the variables from `server/.env.example`. `FRONTEND_URL` must be your exact GitHub Pages address, and `ALLOWED_ORIGINS` its origin (e.g. `https://yourname.github.io`). Check `https://YOUR-API.onrender.com/health`.

## 6. Deploy the site (GitHub Pages)
Edit `web/js/config.js` and set `API_BASE` to your Render URL. Publish the contents of `web/` (for example a `docs/` folder, or a `gh-pages` branch).

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

## Local development
Node 20 LTS. `cd server && cp .env.example .env && npm install && npm run dev`, then serve `web/` with any static server and point `API_BASE` at `http://localhost:3000` (add that origin to `ALLOWED_ORIGINS`).
