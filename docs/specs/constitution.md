# Spec Constitution

## Principles

- Spec first, code second.
- The spec is the source of truth for intended behavior.
- Plans must be decision complete before implementation starts.
- Use repository evidence, not guesswork, to define the behavior.
- Keep changes incremental. Do not refactor the whole system unless the spec requires it.
- Update the spec whenever behavior changes.

## Required spec content

- Objective
- Current state
- Scope
- Behavior rules
- Inputs and outputs
- Error cases
- Acceptance criteria
- Test plan

## Out of scope by default

- Broad rewrites without a behavior reason
- Unrelated cleanup
- Style-only changes without a spec when the behavior is unchanged

