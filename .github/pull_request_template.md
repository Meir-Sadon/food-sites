## What and why

<!-- What this changes and why. Link the issue if there is one. -->

## Sites affected

- [ ] All sites (shared code)
- [ ] Only some sites, behind a feature flag: <!-- flag name and which sites turn it on -->
- [ ] One site's folder only (`sites/<id>/`)

## Checklist

- [ ] Frontend: `npm run lint`, `npm run build`, `npm test`
- [ ] Backend: `dotnet build`, `dotnet test` (say if the integration tests could not run)
- [ ] Migration added? It is backward compatible (expand, then contract) and the model snapshot is updated
- [ ] New user-facing text is in `he.json`, and new error codes have Hebrew text
- [ ] API changes are mirrored in `frontend/src/api/*.ts`
- [ ] `docs/MIGRATION-PLAN.md` checkboxes updated, if this completes part of a phase
