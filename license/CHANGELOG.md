# Changelog

All notable changes to ArborSpace are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each release entry includes its **BSL Change Date** — the date on which that
version becomes available under the Apache License 2.0, per the terms of the
[LICENSE](./LICENSE) file.

---

## [0.1.0] — 2026-04-20

**BSL Change Date: 2030-04-20**

### Summary

Initial public release of ArborSpace. This release establishes the core
architecture of the platform: an on-premise, open-source AI knowledge
management system targeting regulated industries. The stack is built on
SvelteKit, PostgreSQL with pgvector, and Ollama, and is designed to run
entirely within a customer's own infrastructure with no external API
dependencies.

### Added

**Core Platform**
- SvelteKit application framework with server-side rendering and API routes
- PostgreSQL database layer with pgvector extension for vector similarity search
- Ollama integration for local LLM inference (no external API calls)
- Tiptap rich text editor with native JSON storage in `content JSONB` column
- Dual-column pattern: `content JSONB` (source of truth) + `content_html` (read cache)

**Knowledge & Document Management**
- Document ingestion pipeline with configurable chunking algorithm
- Embedding generation via Nomic Embed Text V2 (768-dimensional, MoE architecture)
- HNSW indexing via pgvector for approximate nearest-neighbour search
- Document quality scoring system applied at ingestion
- Full-text search foundation using PostgreSQL `tsvector`

**Data Model**
- Property graph data model for equipment registers and asset relationships
- Schema designed for regulated-industry document governance
- Metadata tagging and ownership fields per document

**AI Layer**
- Mistral Nemo integration via Ollama for local inference on Apple M-series hardware
- RAG (Retrieval-Augmented Generation) pipeline: chunking → embedding → retrieval → synthesis
- ML model output storage layer — ArborSpace stores and governs model outputs,
  it does not run training workloads

**Infrastructure**
- Single-node deployment target: Apple Mac M4 (24 GB RAM) as primary development platform
- Docker Compose configuration for local development
- Environment variable management for Ollama endpoint and database credentials
- PostgreSQL migration scripts with versioned schema management

### Architecture Notes

ArborSpace is positioned as a knowledge and document governance layer, not a
CMMS or ERP replacement. The v0.1.0 scope targets installations up to
approximately 30 equipment items or document collections of equivalent scale.
Horizontal scaling and multi-tenant support are planned for a future release.

### Known Limitations

- No multi-user authentication in this release (single-user local deployment)
- BM25 hybrid search planned but not yet implemented
- No web UI for administration; configuration is file-based
- Ollama model management (pull, update) is manual in this release

---

## Roadmap (planned, not committed)

The following areas are under active consideration for future releases.
Nothing in this section constitutes a commitment or warranty.

- **v0.2.x** — Multi-user authentication, role-based access control
- **v0.3.x** — BM25 hybrid search, improved retrieval quality
- **v0.4.x** — REST API for external integrations
- **v0.5.x** — Docker-based single-command deployment
- **v1.0.0** — Production-grade release: multi-tenant, audit logging,
  compliance export

---

## Release Policy

Releases are tagged in the format `vMAJOR.MINOR.PATCH`.

The BSL Change Date for each release is set to four (4) years from the
release date and is recorded in this file at the time of tagging. The
Change Date is binding per the terms of the LICENSE file.

Pre-release versions (alpha, beta, release candidates) do not receive
independent Change Dates; they inherit the Change Date of the stable
release they precede.
