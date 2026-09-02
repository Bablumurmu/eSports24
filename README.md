# eSports24 BGMI Tournament App — URL Image Edition

Mobile-friendly Firebase + GitHub starter for eSports24.

## Storage dependency removed
This version does **not use Firebase Storage**. There is no `storage.rules` file and no Storage SDK/upload code.

All images are URL-based:
- Admin logo URL
- Splash image URL
- Payment QR image URL
- Tournament image URL

Use direct `https://...` image URLs from an image host/CDN you control or trust. The URLs are stored in Firestore.

## Firebase services
Enable only:
- Authentication: Email/Password and Google
- Firestore Database
- Hosting
- Cloud Functions

Firebase Storage is **not required**.

## 1. Firebase project
Create a Firebase project and enable the services above.

## 2. Firebase web config
Open `firebase-config.js` and replace every `YOUR_*` value with the Web App config from:
Firebase Console -> Project settings -> Your apps -> Web app.

This file intentionally has no `storageBucket` setting because this build does not use Firebase Storage.

## 3. Install Firebase CLI (phone/Termux)
```bash
npm install -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
```

## 4. Install Functions dependencies
```bash
cd functions
npm install
cd ..
```

## 5. Deploy
```bash
firebase deploy --only firestore:rules
firebase deploy --only functions
firebase deploy --only hosting
```

Or deploy everything:
```bash
firebase deploy
```

## 6. Create the first admin
Create an admin user in Firebase Authentication.

Copy that user's UID.

Firestore:
`users/{ADMIN_UID}`

Fields:
```json
{
  "email": "your-admin-email",
  "name": "eSports24 Admin",
  "role": "admin"
}
```

Admin role changes are not allowed from the website.

## 7. URL-based images
In Admin -> Brand & Payment, paste direct HTTPS URLs for:
- Logo
- Splash image
- Payment QR

In Admin -> Create Tournament, paste a direct HTTPS URL for the tournament image.

The app validates image URLs as HTTPS URLs before sending them to the server. The server validates them again.

## 8. Prize JSON
Use position keys such as `1st`, `2nd`, `3rd`, or ranges such as `4th-6th`. Example:
```json
{"1st":1000,"2nd":700,"3rd":500,"4th-6th":250,"7th-10th":150}
```
The server validates prize keys and amounts and stores the calculated `prizeTotal`.

## 9. Wallet security
The browser is NOT allowed to directly modify `walletBalance`.
- Deposit approval -> Cloud Function
- Tournament entry deduction -> Cloud Function
- Wallet ledger -> Cloud Function
- Tournament join -> Cloud Function

Never implement wallet deduction with only client-side JavaScript.

## 10. Room ID/password timing
The provided updateRoomCredentials endpoint permits an admin to publish room credentials only 30 minutes before match time through 30 minutes after match time.

For stronger privacy, production UI should also hide room credentials from non-participants and enforce the same time window in the read architecture. Do not expose room credentials in a public tournament document if they must be private.

## 11. Support email
Support form stores messages in supportMessages.
The visible support email is:
alesihelpdesk@gmail.com

Firestore alone does not send email. To automatically forward support requests, configure a trusted email/SMTP/extension service or a dedicated mail provider. Do not put SMTP passwords in frontend code.

## 12. Security / legal
This project is a technical starter, not legal advice. Before operating paid gaming/tournament features in India, review applicable central/state gaming laws, tax/GST requirements, consumer-protection obligations, data-protection requirements, payment-provider rules and BGMI/KRAFTON/platform terms with qualified professionals.

Never collect UPI PIN, OTP, card PIN, banking password or other authentication secrets.

## 13. GitHub
Upload the project to a GitHub repository. Do not commit service-account private keys, API secrets, .env files, passwords or Firebase Admin SDK credentials.

The Firebase Web API key is not a secret by itself; authorization must be enforced by Firebase Auth + Firestore Rules + server-side Functions.
