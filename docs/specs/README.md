# Spec-First Workflow

This folder holds the project specs for OP7NEXO front.

## When to create or update a spec

- New feature
- Behavior change
- New endpoint or client-side route
- Integration with another service
- Permission, workspace, or multi-tenant rule change
- Bug fix where the expected behavior must be made explicit

## Workflow

1. Use `graphify` to find the real code path.
2. Read the relevant docs and any existing spec in this folder.
3. Write or update a spec from `spec-template.md`.
4. Switch to `Plan Mode` and produce a decision-complete plan.
5. Implement only after the spec and plan are aligned.
6. Update the spec if the implementation changes behavior.

## Naming

- Use one markdown file per feature or behavior change.
- Recommended name: `YYYY-MM-DD-short-slug.md`
- Keep the spec short, explicit, and testable.

