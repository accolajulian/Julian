# LiftBrary

A small phone app for saving workout videos (YouTube, TikTok, Instagram Reels) by body part.
Everything is stored on the phone. No accounts, no backend.

## Run it on your phone (Expo Go)

1. Install **Expo Go** on your phone (App Store / Google Play).
2. On your computer, install Node.js LTS from https://nodejs.org if you don't have it.
3. In a terminal:
   ```bash
   cd liftbrary
   npm install
   npx expo start
   ```
4. A QR code appears in the terminal.
   - **iPhone:** open the Camera app and point it at the QR code.
   - **Android:** open Expo Go and tap "Scan QR code".
5. Phone and computer must be on the same Wi-Fi. If it won't connect, stop it (Ctrl+C) and run
   `npx expo start --tunnel` instead.

## Where things live

- `src/app/` — the screens (each file is one screen)
  - `index.tsx` — home: body-part list with counts and the + button
  - `category/[id].tsx` — the workout cards for one body part
  - `add.tsx` — paste a link, pick body parts, save
  - `edit/[id].tsx` — rename, move to other body parts, delete
- `src/lib/` — logic: categories, saving to the phone, fetching titles/thumbnails
- `src/components/` — reusable pieces (cards, category chips)
