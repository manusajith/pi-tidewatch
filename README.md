# pi-tidewatch

See every [Tidewave](https://tidewave.ai) call your [pi](https://pi.dev) agent makes in an Elixir or Phoenix project.

Tidewave gives the agent a live line into your running app: it evaluates code, runs SQL, reads logs, and looks up docs and source. Those calls are easy to lose in the transcript, and when they run inside a codemode script you never see them at all. Tidewatch keeps a running trace of them next to the editor.

Tidewatch only draws UI. It never sends messages or registers tools, so nothing it does reaches the model's context. The one thing it writes to the session is a small marker when you clear the trace, which the model never sees.

## Features

- Live rows above the editor with the five most recent calls: status, duration, and the code, query, or reference they ran
- A status bar summary with the call count, error count, and the latest call
- A dock for browsing every call in the session, newest first, with full arguments and results
- Calls made from codemode scripts are traced too, and marked `(script)`
- The trace is rebuilt from the session on resume, `/reload`, and `/tree` navigation

## Requirements

- pi 1.4 or later
- A Tidewave MCP server configured in pi, for example in `~/.pi/agent/mcp.json`:

```json
{
  "mcpServers": {
    "tidewave": {
      "url": "http://localhost:4000/tidewave/mcp"
    }
  }
}
```

Tidewatch traces tools from any MCP server whose name starts with `tidewave`, so `tidewave_api` and `tidewave_admin` work too.

## Install

```bash
pi install git:github.com/manusajith/pi-tidewatch
```

From a local checkout:

```bash
pi install ./pi-tidewatch
```

## Usage

The live rows and status summary appear as soon as the agent calls a Tidewave tool.

Open the dock with `shift+up` or `/tidewatch`.

| Key                   | List               | Details       |
| --------------------- | ------------------ | ------------- |
| `up` / `down`         | Select a call      | Scroll        |
| `pageUp` / `pageDown` | Move a page        | Scroll a page |
| `g` / `G`             | First / last call  | Top / bottom  |
| `enter` / `right`     | Show details       |               |
| `e`                   | Toggle errors only |               |
| `c`                   | Clear the trace    |               |
| `escape`              | Close              | Back to list  |
| `left`                |                    | Back to list  |
| `q`                   | Close              | Close         |

The selection keys follow your `tui.select.*` keybindings.

Commands:

```text
/tidewatch              open the dock
/tidewatch clear        forget the calls traced so far
/tidewatch widget       toggle the live rows
/tidewatch widget on    show the live rows
/tidewatch widget off   hide the live rows
```

## What the session keeps

Results of direct calls are stored in the session, so a restored trace shows them in full. Calls made from codemode scripts are stored only as a summary with their arguments, status, duration, and error text. Their results show up live but not after a resume or reload.

Clearing the trace is remembered, so cleared calls stay gone after a resume or reload.

Results over 64 KiB are truncated in the dock. The trace keeps the newest 500 calls.

## Development

```bash
npm install
npm run check
npm run format
```

Try it without your other extensions:

```bash
pi --no-extensions -e .
```

Tooling:

- oxlint for linting
- oxfmt for formatting
- tsc for type-checking
- node:test for tests

## License

MIT
