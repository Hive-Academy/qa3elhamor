# Owner profile — source for `content/*.json`

> Provided by the owner on 2026-10-01 (résumé text). Transcribed with obvious OCR fixes
> ("Al" → "AI", "ODD" → "DDD", "HITO" → "HITL", "socket.10" → "Socket.IO", etc.).
> **Deliberately omitted:** the phone number (not to be published).
> Items marked ⚠ need the owner's confirmation before publishing.

## Identity

- **Name:** Abdallah Khalil (عبدالله خليل)
- **Headline:** AI Solutions Architect · Senior Full Stack Engineer · Open Source Creator
- **Location:** Giza, Egypt
- **Email:** abdallah.khalil.nada@gmail.com ⚠ (résumé OCR read "abdallah.khall.nada" — confirm spelling)
- **LinkedIn:** linkedin.com/in/abdallah-khalil-nada ⚠ (OCR read "abddlah-khalil-nada" — confirm)
- **GitHub:** github.com/Abdallah-khalil (verified via `gh`)

## Summary

Expert software architect and founder with 12+ years designing scalable SaaS platforms and
intelligent AI systems. Deeply specialised in agentic AI, context engineering and Model
Context Protocol (MCP) implementations. Recently architected and shipped two production,
AI-native platforms — Pro-Estate (a multi-agent real-estate operating system) and Ptah (a
provider-agnostic AI coding orchestration platform) — leading engineering teams and bridging
traditional software engineering and autonomous AI agents.

## Skills (grouped)

- **AI & LLM Ops:** LangChain, LangGraph, deepagents, Model Context Protocol (MCP), context
  engineering, RAG pipelines (embeddings, RRF reranking), multi-agent orchestration,
  human-in-the-loop (HITL), provider-agnostic LLM harnesses (Anthropic / OpenAI / Ollama)
- **Architecture:** Hexagonal (ports & adapters), Clean Architecture, DDD, multi-tenancy,
  policy-based access control, event-driven architecture, CQRS, repository pattern, DI
- **Backend:** NestJS 11, Node.js, TypeScript, Prisma & ZenStack, Bull/Redis queues,
  Socket.IO, Zod, Express, TypeORM
- **Databases:** PostgreSQL, MS SQL Server, MongoDB, Neo4j / Memgraph, sqlite-vec, ChromaDB,
  Redis, MinIO (S3)
- **Frontend:** Angular 21 (signals, SSR, zoneless), Nx monorepos, NgRx Signal Store, RxJS,
  Electron, micro-frontends, Tailwind CSS / DaisyUI, SASS/LESS
- **DevOps & tooling:** Docker, Kubernetes, GitHub Actions, CI/CD, Nx, esbuild,
  electron-builder, Playwright, Stryker (mutation testing), Husky, Commitlint

## Featured projects

1. **Pro-Estate — AI operating system for real estate** (pro-estate.net) · Founder & Lead Architect
   - ~400K-LOC, 146-project Nx monorepo: NestJS 11 backend + four Angular 21 SSR frontends
     (admin CRM, tenant marketplace, marketing site), ESLint-enforced module boundaries under
     a locked architecture contract.
   - Multi-tenant B2B SaaS on a 75-model PostgreSQL schema with ZenStack policy-based access
     control (113 migrations), Redis/Bull queues, MinIO storage, Socket.IO real-time inbox.
   - Hierarchical multi-agent AI platform on LangGraph + deepagents: an orchestrator
     delegating to 12 specialised subagents across 23 tool suites, graph long-term memory
     (Neo4j/Memgraph), RAG (embeddings + RRF), human-in-the-loop interrupts, SSE streaming.
   - Meta / Instagram Graph API, WhatsApp Business (unified inbox, broadcasts, Flows) and Meta
     Ads via resilient clients (circuit breaker, retry/backoff, rate limiting); an AI visual
     website builder; Arabic-first bilingual RTL/LTR experience.
2. **Ptah — provider-agnostic AI coding orchestration platform** (ptah.live ⚠ confirm URL) · Creator & Lead Architect
   - One AI-orchestration core shipping as a VS Code extension, Electron desktop app and
     headless CLI, from a 68-project Nx monorepo with a hexagonal ports-and-adapters design.
   - Provider-agnostic harness unifying Claude, GitHub Copilot, OpenAI Codex, Cursor and local
     Ollama models (5 provider families, 6 CLI adapters, multi-strategy auth).
   - Built-in MCP server (~40 tools, 14 namespaces): AST parsing, LSP navigation, dependency
     graphs, symbol indexing, sqlite-vec vector memory, CDP browser automation; plus a stdio
     MCP server for external orchestrators.
   - Parallel multi-agent orchestration (up to 9 concurrent agents), trajectory-based skill
     synthesis, SQLite cron scheduler, Telegram/Discord/Slack bridges, NestJS + Prisma
     licensing backend (Paddle, WorkOS).
3. **Anubis MCP — intelligent guidance for AI workflows** (open source) · Creator & Lead Architect
   - MCP-compliant guidance system that steers AI agents (Cursor, Claude) to follow enforced
     architectural patterns; the organisation's most-starred project. ⚠ Résumé reads "125k";
     earlier notes say 7k+ npm installs and 120+ stars — confirm the figure before publishing.
   - NestJS + Prisma backend with a structured anti-hallucination workflow that verifies agent
     output against codebase facts.

## Experience

| Role | Company | Period | Location |
|---|---|---|---|
| Co-Founder | Miramar Staffing | Jan 2020 – present | Giza, Egypt |
| Lead Software Development Engineer | Prio | Jan 2019 – Oct 2024 | Remote |
| Senior Full Stack Developer | Freelance / self-employed | Aug 2016 – May 2022 | Remote |
| Full Stack Web Developer | Khabeer Group | May 2015 – Dec 2015 | Egypt |

- **Miramar Staffing:** co-founded the company and lead its technical direction, building and
  mentoring the engineering team behind its AI-native SaaS platforms; architect production
  SaaS end to end (NestJS 11, Angular 21, Nx, LangGraph); set engineering principles around
  reliability, type safety, enforced module boundaries and rigorous automated testing.
- **Prio:** directed the SDLC for key enterprise products, owning architecture and deployment;
  drove adoption of micro-frontends and strictly typed backends; mentored senior engineers and
  implemented CI/CD pipelines to shorten time to market.
- **Freelance:** high-performance web apps with Node.js, NestJS and .NET Core for international
  startups; complex Angular/RxJS UIs; modernised legacy systems for clients such as World of
  Systems & Softwares (Saudi Arabia).
- **Khabeer Group:** data-intensive web apps with AngularJS and ASP.NET Web API; Windows
  services for real-time data tracking and monitoring automation.
