# C3 — Next.js web application components

This level zooms into the **Web Application** container from C2. Components are
grouped by responsibility rather than by every source directory, keeping the
diagram readable and aligned with the code.

```mermaid
flowchart TB
    browser["Browser Application<br/>[React client]"]

    subgraph web["Web Application — Next.js 16 container"]
        proxy["Session Proxy and Auth Guard<br/>[proxy.ts + Supabase SSR]<br/><br/>Refreshes sessions and protects application routes"]
        ui["Page and UI Components<br/>[React Server/Client Components]<br/><br/>Landing, Home, Dashboard, Assistant,<br/>Insights, Reports, and Settings"]
        authActions["Authentication Actions<br/>[Next.js Server Actions / Route Handler]<br/><br/>Sign in, sign up, sign out, and email confirmation"]
        dashboard["Dashboard Query Components<br/>[TypeScript server modules]<br/><br/>Build KPIs, P&amp;L, margins, revenue,<br/>expense, and filter datasets"]
        api["API Route Handlers<br/>[Next.js Route Handlers]<br/><br/>Chat, classification, FX, health,<br/>and ML-health endpoints"]
        chat["Chat Orchestrator<br/>[TypeScript]<br/><br/>Classifies, validates, dispatches retrieval,<br/>and generates the final answer"]
        retrieval["Financial Data Retrieval Services<br/>[TypeScript + Prisma queries]<br/><br/>Metrics, P&amp;L, A/R, performance,<br/>and management recommendations"]
        geminiAdapter["Gemini Adapter<br/>[@google/genai]<br/><br/>Structured intent classification and<br/>grounded response generation"]
        prisma["Data Access Component<br/>[Prisma Client]<br/><br/>Typed ORM and parameterised SQL access"]
        mlClient["ML Service Client<br/>[TypeScript fetch client]<br/><br/>Adds the shared-secret header and maps responses"]
        fxAdapter["Exchange Rate Adapter<br/>[Next.js fetch cache]<br/><br/>Fetches and caches daily rates for 24 hours"]
    end

    local[("Browser Local Storage<br/>Preferences, thresholds,<br/>notification state")]
    auth["Supabase Auth<br/>[External system]"]
    db[("Supabase PostgreSQL<br/>[External database]")]
    gemini["Google Gemini API<br/>[External system]"]
    fx["Frankfurter API<br/>[External system]"]
    ml["ML Service<br/>[FastAPI container]"]

    browser -->|"Page/API requests [HTTPS]"| proxy
    proxy -->|"Allows or redirects request"| ui
    proxy -->|"Validates / refreshes session [HTTPS]"| auth
    browser -->|"Submits credentials [HTTPS]"| authActions
    authActions -->|"Identity operations [HTTPS]"| auth
    ui -->|"Loads server-rendered financial views"| dashboard
    dashboard -->|"Financial queries"| prisma
    browser -->|"Chat, FX, and health calls [HTTPS/JSON]"| api
    api -->|"Chat request"| chat
    chat -->|"Validated question parameters"| retrieval
    chat -->|"Classification and response prompts"| geminiAdapter
    retrieval -->|"Financial queries"| prisma
    geminiAdapter -->|"Generate content [HTTPS/JSON]"| gemini
    prisma -->|"Read ledger tables [PostgreSQL TLS]"| db
    api -->|"Rate request"| fxAdapter
    fxAdapter -->|"Daily reference rates [HTTPS/JSON]"| fx
    api -->|"Health request"| mlClient
    mlClient -->|"Authenticated service call [HTTP/JSON]"| ml
    browser -->|"Reads/writes client-only state"| local
    ui -.->|"Planned forecast/prediction flow"| mlClient

    classDef caller fill:#8bbceb,stroke:#315c85,color:#102438,stroke-width:2px;
    classDef component fill:#247aa8,stroke:#124967,color:#061c27,stroke-width:2px;
    classDef external fill:#9992a4,stroke:#5f5968,color:#17141a,stroke-width:2px;
    classDef database fill:#278fb7,stroke:#14536d,color:#071f29,stroke-width:2px;
    class browser caller;
    class proxy,ui,authActions,dashboard,api,chat,retrieval,geminiAdapter,prisma,mlClient,fxAdapter component;
    class auth,gemini,fx,ml external;
    class db,local database;
```

## Code mapping

| Diagram component | Main implementation locations |
|---|---|
| Session Proxy and Auth Guard | `web/proxy.ts`, `web/lib/supabase/proxy.ts`, `web/lib/auth/require-user.ts` |
| Page and UI Components | `web/app/**/page.tsx`, `web/app/**/components/*.tsx` |
| Authentication Actions | `web/app/auth/actions.ts`, `web/app/auth/confirm/route.ts` |
| Dashboard Query Components | `web/app/dashboard/data/*.ts`, `web/app/home/overview-data.ts` |
| API Route Handlers | `web/app/api/**/route.ts` |
| Chat Orchestrator | `web/app/api/chat/route.ts`, `web/lib/validators/*` |
| Financial Data Retrieval Services | `web/lib/data-retrieval/**` |
| Gemini Adapter | `web/lib/gemini/**` |
| Data Access Component | `web/lib/db.ts`, generated Prisma client |
| ML Service Client | `web/lib/ml-client.ts` |
| Exchange Rate Adapter | `web/app/api/fx/route.ts` |

