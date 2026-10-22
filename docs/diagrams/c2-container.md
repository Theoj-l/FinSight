# C2 — FinSight containers

This level shows the runtime/deployment units that make up FinSight.

```mermaid
flowchart TB
    user["TSH Group Finance User<br/>[Person]"]

    subgraph finsight["FinSight — Software System"]
        browser["Browser Application<br/>[React 19 / HTML / CSS]<br/><br/>Renders interactive views, charts, filters,<br/>notifications, and user preferences"]
        web["Web Application<br/>[Next.js 16 / TypeScript / Node.js]<br/><br/>Serves the UI and API routes, enforces sessions,<br/>queries financial data, and orchestrates chat"]
        ml["ML Service<br/>[FastAPI / Python / Uvicorn]<br/><br/>Provides health checks; intended to serve<br/>trained-model inference endpoints"]
    end

    auth["Supabase Auth<br/>[External identity service]<br/><br/>Email/password identity and session validation"]
    db[("Supabase PostgreSQL<br/>[External database]<br/><br/>17 company-wide AutoCount ledger tables")]
    gemini["Google Gemini API<br/>[External AI service]"]
    fx["Frankfurter API<br/>[External exchange-rate service]"]

    user -->|"Uses<br/>[HTTPS]"| browser
    browser -->|"Loads pages and calls same-origin APIs<br/>[HTTPS]"| web
    browser -->|"Signs in and maintains session<br/>[HTTPS]"| auth
    web -->|"Validates users / refreshes sessions<br/>[HTTPS]"| auth
    web -->|"Reads financial and reference data via Prisma<br/>[PostgreSQL TLS]"| db
    web -->|"Classifies questions and generates answers<br/>[HTTPS / JSON]"| gemini
    web -->|"Fetches daily SGD-based rates<br/>[HTTPS / JSON]"| fx
    web -->|"Health check with shared-secret header<br/>[HTTP / JSON]"| ml
    web -.->|"Planned prediction requests<br/>[HTTP / JSON]"| ml
    ml -.->|"Planned inference-time feature reads<br/>[PostgreSQL TLS]"| db

    classDef person fill:#8bbceb,stroke:#315c85,color:#102438,stroke-width:2px;
    classDef container fill:#5da7e8,stroke:#224e72,color:#0b2033,stroke-width:2px;
    classDef external fill:#9992a4,stroke:#5f5968,color:#17141a,stroke-width:2px;
    classDef database fill:#278fb7,stroke:#14536d,color:#071f29,stroke-width:2px;
    class user person;
    class browser,web,ml container;
    class auth,gemini,fx external;
    class db database;
```

## Container responsibilities

| Container | Deployed as | Current responsibility |
|---|---|---|
| Browser Application | User's browser | Client-side interaction, charts, currency selection, thresholds, preferences, and notification history |
| Web Application | Vercel or `finsight-web` Docker image | Next.js pages, server components/actions, route handlers, auth guards, Prisma queries, chat orchestration, FX proxy |
| ML Service | Railway or `finsight-ml-service` Docker image | Stateless FastAPI service with health endpoints; inference API is planned |

Supabase Postgres is external to the Docker Compose network. In local/container
development, only the web and ML services are built by this repository.

