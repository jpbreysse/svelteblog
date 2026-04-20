# Third-Party Notices

ArborSpace incorporates third-party open source components. This file lists
those components, their authors or maintainers, and the licence under which
each is used.

ArborSpace is licensed under the Business Source License 1.1. Nothing in this
file modifies the terms of that licence. Each component listed below is used
in compliance with its respective licence; those licences are reproduced in
full in the [LICENSES/](./LICENSES/) directory of this repository.

Your rights to use each component are governed solely by its own licence, not
by the ArborSpace BSL.

---

## Application Framework

### SvelteKit
- **Repository:** https://github.com/sveltejs/kit
- **Licence:** MIT
- **Copyright:** Copyright (c) 2020–2026 Svelte contributors
- **Use in ArborSpace:** Full-stack web application framework; server-side
  rendering, routing, and API routes.

### Svelte
- **Repository:** https://github.com/sveltejs/svelte
- **Licence:** MIT
- **Copyright:** Copyright (c) 2016–2026 Svelte contributors
- **Use in ArborSpace:** UI component framework underlying SvelteKit.

---

## Rich Text Editor

### Tiptap
- **Repository:** https://github.com/ueberdosis/tiptap
- **Licence:** MIT
- **Copyright:** Copyright (c) 2020–2026 überdosis GbR and contributors
- **Use in ArborSpace:** Rich text editor with ProseMirror foundation; document
  authoring and content editing with native JSON output stored as JSONB.

### ProseMirror (via Tiptap)
- **Repository:** https://github.com/ProseMirror/prosemirror
- **Licence:** MIT
- **Copyright:** Copyright (c) 2013–2026 Marijn Haverbeke and contributors
- **Use in ArborSpace:** Underlying document model and rendering engine for
  the Tiptap editor.

---

## Database & Vector Search

### PostgreSQL
- **Website:** https://www.postgresql.org
- **Licence:** PostgreSQL Licence (BSD-style permissive)
- **Copyright:** Copyright (c) 1996–2026 The PostgreSQL Global Development Group
- **Use in ArborSpace:** Primary relational database; stores documents,
  metadata, embeddings, and knowledge graph nodes.

### pgvector
- **Repository:** https://github.com/pgvector/pgvector
- **Licence:** PostgreSQL Licence (BSD-style permissive)
- **Copyright:** Copyright (c) 2021–2026 Andrew Kane
- **Use in ArborSpace:** PostgreSQL extension providing vector similarity
  search; used for HNSW-indexed embedding retrieval in the RAG pipeline.

---

## AI Inference

### Ollama
- **Repository:** https://github.com/ollama/ollama
- **Licence:** MIT
- **Copyright:** Copyright (c) 2023–2026 Ollama contributors
- **Use in ArborSpace:** Local LLM inference runtime; runs Mistral Nemo and
  Nomic Embed Text V2 on-premise with no external API dependency.

### Mistral Nemo (model weights)
- **Source:** https://mistral.ai / served via Ollama
- **Licence:** Apache License 2.0
- **Copyright:** Copyright (c) 2024 Mistral AI
- **Use in ArborSpace:** Default generative model for RAG synthesis and
  knowledge extraction tasks. Weights are downloaded and run locally via
  Ollama; ArborSpace does not bundle or redistribute the model weights.

### Nomic Embed Text V2
- **Source:** https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe
- **Licence:** Apache License 2.0
- **Copyright:** Copyright (c) 2024 Nomic AI
- **Use in ArborSpace:** Default embedding model; produces 768-dimensional
  dense vectors used for semantic search and retrieval. Mixture-of-Experts
  architecture. Weights are served locally via Ollama; ArborSpace does not
  bundle or redistribute the model weights.

---

## Node.js Runtime & Tooling

### Node.js
- **Website:** https://nodejs.org
- **Licence:** MIT (core); individual bundled modules carry their own licences
- **Copyright:** Copyright Node.js contributors
- **Use in ArborSpace:** JavaScript runtime for the SvelteKit server-side
  environment and build tooling.

### Vite
- **Repository:** https://github.com/vitejs/vite
- **Licence:** MIT
- **Copyright:** Copyright (c) 2019–2026 Evan You and Vite contributors
- **Use in ArborSpace:** Build tool and development server underlying SvelteKit.

---

## Database Connectivity

### postgres (npm package — porsager/postgres)
- **Repository:** https://github.com/porsager/postgres
- **Licence:** MIT
- **Copyright:** Copyright (c) 2020–2026 Rasmus Porsager
- **Use in ArborSpace:** PostgreSQL client for Node.js; used for all database
  queries from the SvelteKit server layer.

---

## Containerisation & Infrastructure

### Docker / Docker Compose
- **Website:** https://www.docker.com
- **Licence:** Apache License 2.0 (Docker Engine); Docker Desktop subject to
  separate commercial terms — see https://www.docker.com/pricing
- **Copyright:** Copyright (c) 2013–2026 Docker, Inc.
- **Use in ArborSpace:** Local development environment orchestration.
  ArborSpace does not bundle or redistribute Docker.

---

## Licences Directory

Full licence texts are available in the `LICENSES/` directory:

```
LICENSES/
  MIT.txt
  Apache-2.0.txt
  PostgreSQL.txt
```

If a licence text is missing from that directory, please open an issue at
https://github.com/arborspace/arborspace/issues

---

## Reporting Missing Attributions

If you identify a third-party component used in ArborSpace that is not listed
here, please open an issue or submit a pull request. Correct attribution is
important to us and to the open source community whose work ArborSpace builds on.

---

*Last updated: 2026-04-20 — corresponds to ArborSpace v0.1.0*
