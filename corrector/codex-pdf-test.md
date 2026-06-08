# Codex PDF Rendering Test

This document tests how Corrector converts **Markdown** into a formatted PDF.
Codex is an AI coding agent that can help developers *write*, review, and ship code.

[Learn more about Codex](https://openai.com/codex/)

---

## Inline Formatting

This sentence includes **bold text**, *italic text*, `inline code`, and a [link to OpenAI](https://openai.com/).

Markdown can combine **bold text with `inline code` nearby** while leaving ordinary text readable.

### Strong Ideas

Codex works best when a request includes:

- A clear objective
- Relevant repository context
- Expected behavior
- Verification requirements
- Constraints that must remain unchanged

#### Smaller Heading

This section checks a fourth-level heading.

##### Fifth-Level Heading

This section checks a fifth-level heading.

###### Sixth-Level Heading

This section checks the smallest supported heading.

---

## Ordered Workflow

1. Inspect the existing codebase.
2. Understand the established patterns.
3. Implement the requested change.
4. Run focused tests.
5. Review the final diff.

## Nested-Looking List

- Plan the task
  - Identify affected files
  - Check existing tests
- Implement the change
  - Keep edits focused
  - Preserve unrelated work
- Verify the result

> Codex should treat verification as part of implementation, not as an optional final step.

---

## Capability Table

| Capability | Example Request | Expected Result |
| --- | --- | --- |
| Code understanding | Explain how authentication works | A concise explanation with relevant file references |
| Feature development | Add PDF export | Working implementation with focused verification |
| Bug fixing | Fix mobile overflow | A scoped CSS or layout correction |
| Code review | Review this pull request | Findings ordered by severity |
| Testing | Add regression coverage | Tests that protect the changed behavior |
| Documentation | Document the deployment flow | Clear instructions using the repository's actual commands |

## Longer Table For Pagination

| Step | Codex Action | Verification |
| --- | --- | --- |
| 1 | Read the request carefully | Confirm the intended outcome |
| 2 | Inspect repository status | Avoid overwriting unrelated changes |
| 3 | Search for relevant files | Find existing patterns and ownership boundaries |
| 4 | Read the implementation | Understand current behavior before editing |
| 5 | Check related styles | Identify shared and app-specific rules |
| 6 | Design a focused solution | Limit unnecessary changes |
| 7 | Apply the implementation | Preserve existing conventions |
| 8 | Run syntax checks | Catch parsing errors |
| 9 | Run focused tests | Confirm the requested behavior |
| 10 | Test edge cases | Check empty, long, and unusual input |
| 11 | Inspect the diff | Detect accidental edits |
| 12 | Report the result | Summarize changes and verification |

---

## Code Block

```javascript
async function askCodex(task) {
  const result = await codex.run({
    objective: task,
    verify: true,
  });

  return result;
}
```

## Configuration Example

```json
{
  "agent": "codex",
  "mode": "focused",
  "verify": true,
  "output": "pdf"
}
```

---

## Long Paragraph

Codex can support software work across planning, implementation, debugging, testing, review, and documentation. A useful request explains the desired outcome and provides enough context for the agent to inspect the existing system. The resulting work should follow the repository's established patterns, remain focused on the requested behavior, and include verification appropriate to the risk of the change.

## Final Checklist

- **Headings:** six levels included
- **Inline formatting:** bold, italic, code, and links included
- **Lists:** unordered, ordered, and indented items included
- **Quote:** included
- **Horizontal rules:** included
- **Tables:** short and long tables included
- **Code blocks:** JavaScript and JSON included
- **Long paragraph:** included

> End of the Codex PDF rendering test.
