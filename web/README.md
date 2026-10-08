This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing

We run two test suites. They answer different questions — pick based on **what
you changed**, not on which one you know better. Most changes need only one.

| You changed... | Write a... | Because |
|----------------|-----------|---------|
| A `lib/` helper, a util, a pure function | **Vitest** test | It's isolated logic — verify inputs → outputs directly, no app needed. |
| A route handler (`app/api/**/route.ts`) — status codes, error mapping, response shape | **Vitest** test | Call the exported `GET`/`POST` with mocked deps and assert on the `Response`. |
| A server action's validation / branching (`app/**/actions.ts`) | **Vitest** test | Mock Supabase + `next/*`, assert the returned error or the redirect target. |
| A page, a component, navigation, a form the user submits | **Playwright** spec | Only a real browser against the running app proves it renders and is wired up. |
| Middleware / auth redirects, a full sign-in → dashboard flow | **Playwright** spec | Needs the real server, cookies, and routing running end to end. |

If a change has both a tricky bit of logic **and** a user-facing effect, cover
the logic in Vitest (fast, exhaustive on edge cases) and add **one** Playwright
spec for the happy path.

### Where the files go

**Vitest — colocated with the code it tests.** Same folder, same basename, add
`.test.ts`:

```
lib/ml-client.ts            ->  lib/ml-client.test.ts
app/api/health/route.ts     ->  app/api/health/route.test.ts
app/auth/actions.ts         ->  app/auth/actions.test.ts
```

**Playwright — one folder, grouped by user-facing area**, not by source file:

```
e2e/home.spec.ts       # the landing page
e2e/auth.spec.ts       # sign in / sign up / route protection
e2e/<area>.spec.ts     # add a file per feature area
```

Discovery is by name and is mutually exclusive: `*.test.ts` is Vitest (anywhere
except `e2e/`), `e2e/**/*.spec.ts` is Playwright. Neither runner sees the other's
files — enforced in `vitest.config.ts` and `playwright.config.ts`.

### Running

```bash
npm test                 # Vitest, once (CI mode)
npm run test:watch       # Vitest, re-run on change

npx playwright install chromium webkit firefox   # one-time, downloads the browser
npm run test:e2e         # Playwright, headless
npm run test:e2e:ui      # Playwright, interactive debugger
npm run test:e2e:report  # open the last HTML report
```

Vitest needs nothing — Supabase and the ML service are mocked, so runs are fast
and offline. Playwright starts `next dev` for you (reusing one that's already
running) and waits for it; that dev server reads `web/.env`, so the same env you
need for `npm run dev` is required here too. To run the suite against an
already-deployed URL instead, set `PLAYWRIGHT_BASE_URL` and the local server is
skipped:

```bash
PLAYWRIGHT_BASE_URL=https://finsight.example.com npm run test:e2e
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Landing-page carousel regression checks

The landing, login and carousel suites run in Chromium, WebKit and Firefox.
Run `npm run test:e2e -- e2e/carousel.spec.ts e2e/home.spec.ts e2e/auth.spec.ts`.
Carousel checks cover 375/768/1440/2560px layouts, one visible feature at rest,
forward/reverse wrapping, animation-frame clipping and continuous coverage,
rapid clicks, keyboard/swipe controls, autoplay/pause/resume, reduced motion,
resize/reload, and containment when its stylesheet rules are missing.
The stylesheet-loss check deliberately removes only carousel rules from the
bundled CSS; it must not disable unrelated page styles.

Carousel geometry and hidden-slide state are also defined on the elements so
that a missing or delayed development stylesheet cannot expose all features.
Only the incoming and outgoing slides participate in a 700ms transition; a
short fallback timer settles it if the animation event is interrupted.
