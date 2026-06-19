<div align="center">

# 🗣️ KODI Backend — Forum Service (Template B)

**The community forum, groups & messaging microservice behind the KODI / Template B city app.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.x-4479A1?style=flat-square&logo=mysql&logoColor=white)](https://www.mysql.com)
[![License](https://img.shields.io/badge/License-EUPL%201.2-green?style=flat-square)](LICENSE)

_Template B backend forum service — open-sourced from **KODI-Kommunen-Digital**. Licensed under the [EUPL-1.2](LICENSE)._

</div>

---

## Overview

This service powers the **forum, groups, and messaging** features of the Template B city app. It is one of three backend services:

| Service | Role |
|---|---|
| `kodi-backend-template-B` | Main REST API — listings, categories, events, waste calendar, citizen services, auth |
| **`kodi-backend-forum-template-B`** *(this repo)* | Forums, posts, comments, group membership, and chat (including encrypted chat) |
| WebsocketServer | Realtime transport for chat messages |

It runs as a standalone Express service against its own MySQL schema and shares the JWT auth scheme with the main API.

---

## Features

| Area | Endpoints |
|---|---|
| **Forums** | Create / list / update forums (groups), membership rules |
| **Members** | Join, leave, roles; member-request approval / rejection flow with email notifications |
| **Posts** | Forum posts, comments, and post reports (moderation) |
| **Chat** | Forum chat (`forumChat`) and **encrypted chat** (`forumChatV2` + `forumKeyService` key exchange) |
| **Post chat** | Per-post 1-to-1 messaging (`postChat`) |
| **Users** | Forum-scoped user profile + lookups |

Versioned API: legacy routes at the root, plus `v1/` and `v2/` (current). Outbound mail via templated transactional emails (`emailTemplates/`).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + Express |
| Database | MySQL (`mysql2`) |
| Auth | RS256 JWT (key pair via env) — shared with the main API |
| Push | `firebase-admin` |
| Email | `nodemailer` + templated emails |
| Object storage | Huawei OBS (`eSDK_Storage_OBS`) for media |
| Realtime | Delegates to the WebsocketServer (`WEBSOCKET_SERVER_ADDR`) |

---

## Getting Started

### Prerequisites

- Node.js **18+**
- A reachable **MySQL** database
- (Optional) Firebase service account for push, an SMTP account for email, and a running WebsocketServer for realtime chat

### Installation

```bash
git clone https://github.com/Kodi-Entwicklergemeinschaft/kodi-backend-forum-template-B.git
cd kodi-backend-forum-template-B
npm install
```

### Configuration

Copy the example env and fill in your own values:

```bash
cp .env.example .env
```

| Key | Description |
|---|---|
| `ENVIRONMENT`, `REGION`, `WEBSITE_DOMAIN` | Deployment identity |
| `DATABASE_HOST` / `DATABASE_PORT` / `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` | MySQL connection |
| `PORT`, `BASE_URL` | Service bind + public base URL |
| `ACCESS_PRIVATE` / `ACCESS_PUBLIC` / `REFRESH_PRIVATE` / `REFRESH_PUBLIC` | RS256 JWT key pairs (PEM body, no header/footer) |
| `AUTH_EXPIRATION`, `REFRESH_EXPIRATION`, `SALT` | Token TTLs + bcrypt salt rounds |
| `WEBSOCKET_SERVER_ADDR` / `WEBSOCKET_ENABLED` / `WEBSOCKET_ACCESS_TOKEN` | Realtime chat transport |

> `.env` is gitignored — never commit real credentials. Generate JWT key pairs with `openssl`.

### Database

```bash
node migrationscript.js   # apply the forum schema migration
```

### Run

```bash
npm start        # nodemon index.js
```

The API starts on `PORT` (from your `.env`).

---

## Related Services

- **Main API:** [`kodi-backend-template-B`](https://github.com/Kodi-Entwicklergemeinschaft/kodi-backend-template-B)
- **Mobile app:** [`kodi-mobile-template-B`](https://github.com/Kodi-Entwicklergemeinschaft/kodi-mobile-template-B)

---

## License

Licensed under the **European Union Public Licence v1.2 (EUPL-1.2)**. See [LICENSE](LICENSE).
