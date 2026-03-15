# 🌟 Sora: The Intelligent Hyper-Assistant ⚡

[![GitHub stars](https://img.shields.io/github/stars/mayank-kumar-jha/sora.ai?style=for-the-badge&color=FFD700)](https://github.com/mayank-kumar-jha/sora.ai)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React Native](https://img.shields.io/badge/React_Native-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev/)
[![Gemini](https://img.shields.io/badge/Gemini_3.1-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)

> **Sora is not just an AI; it's your digital executive assistant.** Built with the latest SOTA models, Sora bridges the gap between frontier intelligence and your daily tools like WhatsApp, Google Calendar, and more.

---

## 🚀 Core Features

### 🟢 WhatsApp Integration
*   **Deep Link**: Connect via QR or **Pairing Code** for zero-friction setup.
*   **Memory Tracking**: Watch in real-time as Sora re-indexes your contacts and chats.
*   **Scheduled Messaging**: Tell Sora to "remind me to text Mom in 5 min" and she handles the rest.

### 🌐 Google Workspace Mastery
*   **Calendar**: Native creation and management of events.
*   **Gmail**: Read, draft, and send emails directly from the chat.
*   **Drive**: List and upload files with simple natural language commands.

### 🧠 Advanced AI & RAG
*   **Gemini 3.1 Pro**: Powered by Google's latest reasoning model for complex tasks.
*   **Flash Fallback**: Seamless transition to high-speed models if primary limits are hit.
*   **Personal Memory**: Uses Vector Embeddings (Pinecone) to remember your past preferences and data.

### 📱 Premium Mobile Experience
*   **Dynamic Island**: Real-time status updates and micro-interactions.
*   **Sora Face**: Lifelike animations that react to your conversations.
*   **Waveform Visualization**: Interactive audio feedback systems.

---

## 🛠️ Tooling & Tech Stack

| Category | Technology |
| :--- | :--- |
| **Backend** | Node.js, Express, Prisma (PostgreSQL) |
| **Messaging** | Baileys (WhatsApp Web API) |
| **Async Tasks** | BullMQ & Redis |
| **AI Processing** | Google Generative AI (Gemini), Groq (Llama-3) |
| **Vector DB** | Retrieval Augmented Generation (RAG) |
| **Frontend** | React Native (Expo), TypeScript |

---

## ⚙️ Quick Start (Backend)

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/mayank-kumar-jha/sora.ai.git
    cd sora.ai
    ```

2.  **Environment Setup**
    Create a `.env` file based on `.env.example`:
    ```env
    PORT=10000
    DATABASE_URL="your-postgresql-url"
    REDIS_URL="rediss://your-secure-redis-url"
    GEMINI_API_KEY="your-google-api-key"
    ```

3.  **Install & Start**
    ```bash
    npm install
    npx prisma generate
    npm run start
    ```

---

## 🛡️ Architecture & Reliability

Sora is built for the **Render Cloud Environment**, featuring:
*   **SSL/TLS Redis**: Secure production-ready connections.
*   **Session Guard**: Built-in "Hard Reset" tools to fix ephemeral filesystem corruption on the fly.
*   **Worker Queues**: Background processing for embeddings and mail to keep the main thread snappy.

---

## 🤝 Contributing

We welcome contributions! Please feel free to submit a Pull Request.

---

Developed with ❤️ by **Mayank Kumar Jha** & **Sora AI**
