# Playwright Test Case Template — Helix Health Portal

Use this prompt when adding new test cases to an existing spec file, or when
creating a new spec file for a feature. Fill in every bracketed placeholder
before submitting.

---

## Prompt template

```
I am writing Playwright tests for the Helix Health Portal **[FEATURE NAME]** feature.

**Project details**
- Base URL: http://localhost:5173
- Page under test: /[PAGE PATH]
- Spec file: tests/[filename].spec.ts
- Fixtures: import testUsers from '../fixtures/auth.fixtures'
  (do NOT hardcode credentials)

**Verified selectors**
Add `data-testid` attributes first. Fall back to `id` if data-testid is absent.
Flag any selector that relies on CSS classes or DOM structure with a FRAGILE comment
and a TODO requesting the correct data-testid from the dev team.

| Element              | Selector                          | Status         |
|----------------------|-----------------------------------|----------------|
| [Element name]       | [data-testid="x" or #id]          | stable/FRAGILE |
| [Element name]       | [data-testid="x" or #id]          | stable/FRAGILE |

**Scenarios to cover**

Happy path:
- [Describe the primary success flow]

Error / edge cases:
- [Describe each failure mode, e.g. missing field, server error, permission denied]

Security scenarios (always include for auth-adjacent features):
- [e.g. unauthenticated access redirects, role isolation, token not leaked in URL]

**Requirements**
1. Group tests with `describe()` blocks by scenario type (happy path / errors /
   security / session lifecycle).
2. Follow the AAA pattern with a blank line separating each phase:
   ```
   // Arrange
   ...

   // Act
   ...

   // Assert
   ...
   ```
3. Extract repeated navigation + form-fill steps into a named helper function
   at the top of the file.
4. For any behavior you are not certain the app implements (lockout timing,
   exact error text, redirect target), write the test but add:
   `// VERIFY: [what to confirm with the developer]`
5. Do NOT add `data-testid` attributes to the app yourself — flag missing ones
   in a comment so the dev team can add them.
6. Do NOT hardcode email/password strings — always pull from testUsers.
7. Each test must be independently runnable (no shared mutable state between tests).

**Output**
Generate [a new describe() block to append to tests/[filename].spec.ts]
OR
[a complete new file at tests/[filename].spec.ts].
```

---

## Checklist before submitting

- [ ] All selectors confirmed in the running app (browser DevTools or Playwright codegen)
- [ ] Fragile selectors flagged with FRAGILE comment and VERIFY/TODO note
- [ ] Credentials pulled from `testUsers` fixture, not hardcoded
- [ ] Each describe block covers exactly one scenario type
- [ ] AAA phases separated by blank lines
- [ ] Unverified behavior flagged with `// VERIFY: ...` comment
- [ ] No test depends on the side effects of a previous test

---

## Example: adding a "forgot password" describe block

```
I am writing Playwright tests for the Helix Health Portal **forgot password** feature.

Page under test: /forgot-password
Spec file: tests/login.spec.ts (append a new describe block)

Selectors:
| Element              | Selector                        | Status   |
|----------------------|---------------------------------|----------|
| Email input          | #email                          | stable   |
| Submit button        | data-testid="reset-submit-btn"  | stable   |
| Success banner       | data-testid="reset-success-msg" | stable   |
| Error message        | data-testid="error-message"     | stable   |

Scenarios:
- Happy path: registered email shows success banner without revealing delivery status
- Error: unregistered email shows the same generic success banner (no user enumeration)
- Error: malformed email does not submit the form
- Security: success message does not reveal whether the email is registered
```

---

## Reference: selector priority order

1. `data-testid="…"` — preferred, intent-stable
2. `#id` — good for form inputs that also need it for accessibility (`<label for>`)
3. `[name="…"]` — acceptable for form fields when id is absent
4. `role` + accessible name — `page.getByRole('button', { name: 'Sign in' })` — use for
   elements where accessible name is a stable contract (e.g. nav buttons)
5. Element text — only for copy that will not change with localization
6. CSS class — never; Tailwind classes are not a stable test contract

---

## Reference: describe block categories used in this project

| Block name                         | What goes in it                                              |
|------------------------------------|--------------------------------------------------------------|
| `Login — happy path by role`       | Successful login for each role, correct redirect             |
| `Login — invalid credentials`      | Wrong password, empty form, malformed email                  |
| `Login — account lockout`          | Repeated failures trigger lockout; correct creds still fail  |
| `Login — role isolation`           | Patient/provider/admin cannot access each other's routes     |
| `Login — session lifecycle`        | Unauth redirect, logout clears session, back-nav after logout|

Add new describe blocks following the pattern:
`[Feature] — [scenario type]`
