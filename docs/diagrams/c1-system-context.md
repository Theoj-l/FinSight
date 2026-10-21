# C1 — FinSight system context

This level shows FinSight as a single software system and the people/systems it
interacts with.

```mermaid
flowchart LR
    user["TSH Group Finance User<br/>[Person]<br/><br/>Reviews company financial performance,<br/>alerts, reports, and asks financial questions"]

    subgraph boundary["FinSight boundary"]
        finsight["FinSight<br/>[Software System]<br/><br/>Turns TSH Group ledger data into dashboards,<br/>financial analysis, alerts, and planned forecasts"]
    end

    supabase["Supabase<br/>[External System]<br/><br/>Authenticates users and hosts the<br/>company-wide PostgreSQL ledger"]
    gemini["Google Gemini API<br/>[External System]<br/><br/>Classifies financial questions and<br/>generates grounded natural-language answers"]
    fx["Frankfurter / ECB Rates<br/>[External System]<br/><br/>Supplies daily reference exchange rates"]

    user -->|"Uses dashboards and application<br/>[HTTPS]"| finsight
    finsight -->|"Authenticates users and reads financial data<br/>[HTTPS / PostgreSQL TLS]"| supabase
    finsight -->|"Sends questions and grounded results<br/>[HTTPS / JSON]"| gemini
    finsight -->|"Retrieves daily currency rates<br/>[HTTPS / JSON]"| fx

    classDef person fill:#8bbceb,stroke:#315c85,color:#102438,stroke-width:2px;
    classDef system fill:#5da7e8,stroke:#224e72,color:#0b2033,stroke-width:2px;
    classDef external fill:#9992a4,stroke:#5f5968,color:#17141a,stroke-width:2px;
    class user person;
    class finsight system;
    class supabase,gemini,fx external;
```

## Relationship notes

- The browser-facing product is FinSight; users do not call the ML service directly.
- Financial answers sent to Gemini include database results selected by FinSight.
- Supabase contains both identity and financial data responsibilities, but remains
  outside the FinSight codebase.

