# PostPin

## Getting Started

The documentation lives at [docs.postpin.io](https://docs.postpin.io): the user guide, the editor
plugins, the REST API and [self-hosting PostPin](https://docs.postpin.io/self-hosting) on your own
server.

## System Architecture

![System Architecture](./architecture/architecture.svg)

## Development

### Requirements

- Node.js
- pnpm
- protobuf (`brew install protobuf` on macOS)

### Setup

```bash
pnpm -r run setup
```

### Development Commands

- `pnpm dev` - Starts the development server for the frontend and backend.
