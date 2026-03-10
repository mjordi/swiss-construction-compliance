# BauCompliance.ch

**SaaS platform for Swiss construction compliance — OR 2026 ready.**

[![CI](https://github.com/mjordi/swiss-construction-compliance/actions/workflows/ci.yml/badge.svg)](https://github.com/mjordi/swiss-construction-compliance/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

BauCompliance.ch helps Swiss construction firms navigate the 2026 revision of the Code of Obligations (Obligationenrecht / OR). Generate legally compliant digital handover protocols, track warranty deadlines, assess canton-specific legislative risk, and securely store evidence — all in one platform.

---

## Features

| Feature | Description |
|---|---|
| **Digital Handover Protocol** | Generate legally binding Abnahmeprotokolle (SIA 118) on-site with digital signatures |
| **Canton Risk Map** | Real-time legislative risk scores for all 26 Swiss cantons |
| **Tech Vault** | Geo-tagged photo evidence storage to defend against unjustified defect claims |
| **PDF Generation** | Cryptographically signed PDF reports via `@react-pdf/renderer` |
| **Multi-language** | Full support for DE / FR / IT / RM / EN |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Animation | Framer Motion |
| PDF | @react-pdf/renderer |
| Language | TypeScript 5 |
| Deployment | Vercel |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Other commands

```bash
npm run build   # Production build
npm run lint    # ESLint
npm run test    # Run tests (Vitest)
```

---

## Deployment

This project is optimized for **Vercel**. Push to `main` and it deploys automatically.

```bash
npx vercel --prod
```

---

## Project Structure

```
app/
  page.tsx                  # Landing page
  dashboard/
    page.tsx                # Handover wizard
    risk/page.tsx           # Canton risk map
    vault/page.tsx          # Evidence vault
    settings/page.tsx       # User settings
locales/index.ts            # All translations (DE/FR/IT/RM/EN)
context/
  AuthContext.tsx           # Auth state
  LanguageContext.tsx       # i18n context
__tests__/
  locales.test.ts           # Translation key parity tests
.github/workflows/ci.yml   # CI pipeline
```

---

## License

MIT © 2026 BauCompliance.ch
