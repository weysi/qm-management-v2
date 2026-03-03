# Template Engine V2

Deterministic backend template engine for document templates.

## Pipeline

1. `tokenize(template) -> Token[]`
2. `parse(tokens, source) -> TemplateAst`
3. `collect_variables(ast) -> set[str]`
4. `collect_variables_with_locations(ast) -> dict[var, ranges]`
5. `render(ast, values, required_variables) -> RenderResult`

## Supported Placeholder Syntax

- Mustache style only: `{{ company.name }}`

## Key Properties

- Immutable AST and node ranges.
- Side-effect free rendering.
- Structured errors with code/message/range/path.
- No expression evaluation, no code execution.
- OOXML bridge for DOCX XML entries.
