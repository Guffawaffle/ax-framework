# Example Capability Resolution

## Input

`ax lex frame recall --query recent`

## Parsed path

- toolspace: none
- module: lex
- capability path: frame.recall

## Resolved ID

`global.lex.frame.recall`

## Example execution plan

- adapter type: cli
- command: `lex`
- args: `frame recall --json --query recent`

---

## Input

`ax awa lex frame recall --query recent`

## Parsed path

- toolspace: awa
- module: lex
- capability path: frame.recall

## Resolved ID

`toolspace.awa.lex.frame.recall`

## Example execution plan

- mounted module source: `global.lex`
- adapter type: cli
- command: `lex`
- args: `frame recall --json --query recent --namespace awa`
- extra policy: require workspace binding
