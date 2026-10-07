---
description: Run the repo's checks (frontend lint, typecheck/build, tests; backend build and tests)
---

Run these from the repo root and report a short pass/fail summary per step, with the failing output for anything red. Run independent steps in parallel where you can.

0. `node scripts/check-sites.mjs` (site folders complete, shared code names no business)
1. `cd frontend && npm run lint`
2. `cd frontend && npm run build` (runs `tsc -b`, so it is the typecheck too)
3. `cd frontend && npm test`
4. `cd backend && dotnet build`
5. `cd backend && dotnet test` — needs a running Docker daemon (Testcontainers starts PostgreSQL). If `docker info` fails or the image pull fails (Docker Hub often answers 429 in cloud sessions), instead run only the tests that need no database: `dotnet test --filter "FullyQualifiedName~PhoneNumberTests|FullyQualifiedName~SupplyCalendarTests|FullyQualifiedName~OrderBuilderTests|FullyQualifiedName~AdminPasswordHasherTests|FullyQualifiedName~SiteFolderTests"`, and say plainly that the integration tests were not run.

$ARGUMENTS
