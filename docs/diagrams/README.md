# FinSight C4 architecture diagrams

These diagrams are derived from the repository as of 29 September 2026.

## Files

- `c1-system-context.md` — people and external systems around FinSight.
- `c2-container.md` — deployable/runtime containers and data stores.
- `c3-web-components.md` — components inside the Next.js web container.

## Use in draw.io

1. Open a diagram file and copy only the text inside its `mermaid` code block.
2. In draw.io, select **Arrange → Insert → Advanced → Mermaid**.
3. Paste the text and choose **Diagram** if you want draw.io shapes that can be edited individually.

The diagrams use solid arrows for implemented runtime relationships and dashed
arrows for planned relationships. The source remains the easiest place to make
large structural changes; re-import it after editing.

## Scope and assumptions

- The primary person is called **TSH Group finance user** because the application
  currently uses one authenticated role and the ledger is company-wide. The code
  does not implement separate staff, manager, or director authorization roles.
- Supabase Auth and Supabase Postgres are shown separately because they have
  different responsibilities, even when provisioned in the same Supabase project.
- The FastAPI ML service is deployed and its health endpoint is integrated. Model
  prediction endpoints and their use by financial views are planned, not yet
  implemented.
- The chat pipeline exists as API code and calls Gemini, but the visible Assistant
  page explicitly describes the conversational experience as in development.
- Reports and insights pages are currently presentation placeholders; they are not
  modelled as separate backend systems.
- Browser local storage is shown only at C3 because notification state, thresholds,
  currency, and delivery preferences are stored per account in the browser.
- Offline synthetic-data generation and model training are build/operations
  workflows, not runtime containers, so they are outside the C2 diagram.

