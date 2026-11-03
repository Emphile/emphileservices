# Emphile Engineering Services: website, CRM and ERP

- `index.html` is the public website. Its enquiry form saves new leads into the CRM.
- `portal/` is the staff back office (sign in at `portal/login.html`):
  Dashboard, CRM (leads, clients), Jobs & billing (jobs, quotes, invoices, payments),
  Inspections (EICR and certificate tracking, next-due alerts), Staff & finance (staff, rota, expenses).
- `db.js` is the data layer (Firebase). `config.js` holds the Firebase settings.
- `firestore.rules` is the security rule set that protects the data.

Runs on the Firebase free plan (Spark), no card needed.

## One-time setup

1. Go to https://console.firebase.google.com, **Add project**, name it `emphile-engineering`.
   Google Analytics can be turned off.
2. **Build > Firestore Database > Create database**. Choose **production mode** and a UK/EU region
   (for example `europe-west2` London). The region cannot be changed later.
3. **Build > Authentication > Get started > Email/Password > Enable**. Then open the **Users** tab and
   **Add user** with your email and a strong password. Copy the **User UID** shown for that user.
4. **Firestore Database > Rules** tab: delete what is there, paste the whole of `firestore.rules`, press **Publish**.
5. Make yourself an admin: **Firestore Database > Data > Start collection**, Collection ID `admins`,
   Document ID = the User UID you copied, add one field `isAdmin` (boolean) = `true`, Save.
   Anyone who signs in without such a document is refused.
6. **Project settings (cog) > General > Your apps > Web (`</>`)**, register an app, and copy the four values
   `apiKey`, `authDomain`, `projectId`, `appId` into `config.js`. These are public identifiers, not secrets.
7. **Authentication > Settings > Authorized domains**: add the domain the site is hosted on
   (for example `emphile.github.io` or your own domain). `localhost` is already allowed.
8. Commit and push, then sign in at `/portal/login.html`.
9. On the dashboard, fill in business name, address, VAT number, payment details and terms.
   They stay blank until you do, and print on quotes and invoices.

## Notes

- Only admins can read or change data. The public site can only add a new lead (name, contact, service, message).
- VAT rate defaults to 0% on quotes and invoices; set it per document.
- Free plan limits are generous for a small business (about 50,000 reads and 20,000 writes per day).
- Hosting: GitHub Pages works (Settings > Pages > deploy from `main`, root).
- If you later use a custom domain, add it to the Authorized domains list in step 7.
