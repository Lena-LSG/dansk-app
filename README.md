# DANSK — Citizenship Test Prep App

React Native (Expo) app for preparing for the Danish Indfødsretsprøven.

## Features
- 120 questions: history, government, geography, culture, rights, values, current affairs
- Practice Quiz, Full Mock Test, Exam Simulator (45 min timer), Weak Spots, Flashcards
- Bilingual EN/DA
- Progress tracking with spaced repetition
- Daily streak counter
- Per-category mastery bars
- Dark mode
- Full session history

## Build

### Prerequisites
```bash
npm install -g eas-cli
eas login
```

### Install dependencies
```bash
npm install
```

### Build APK (free EAS cloud build)
```bash
npm run build:preview
```
Expo emails you a download link when done (~10 min).

## Development
```bash
npm start
```
Then scan QR code with Expo Go app on Android.
