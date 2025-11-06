# Claude Code Custom Slash Commands

This directory contains custom slash command definitions for the copilot-instructions-mcp project.

## Available Commands

### /architecture-review

**Purpose**: Perform comprehensive system architecture analysis and improvement planning.

**Usage**: `/architecture-review [scope] | --modules | --patterns | --dependencies | --security`

**When to use**:
- Conducting thorough architectural assessments
- Analyzing design patterns across the codebase
- Evaluating dependency architecture and coupling
- Reviewing security architecture and trust boundaries
- Planning architectural improvements and refactoring

**What it does**:
1. **System Structure Assessment** - Maps component hierarchy, identifies architectural patterns, analyzes module boundaries
2. **Design Pattern Evaluation** - Identifies implemented patterns, detects anti-patterns, assesses pattern effectiveness
3. **Dependency Architecture** - Analyzes coupling levels, detects circular dependencies, evaluates boundaries
4. **Data Flow Analysis** - Traces information flow, evaluates state management, validates transformation patterns
5. **Scalability & Performance** - Analyzes scaling capabilities, evaluates caching strategies, assesses bottlenecks
6. **Security Architecture** - Reviews trust boundaries, authentication/authorization patterns, data protection

**Output**: Detailed architecture assessment with specific improvement recommendations, refactoring strategies, and implementation roadmap.

**Model**: Sonnet

**Allowed Tools**: Read, Glob, Grep, Bash

---

### /create-architecture-documentation

**Purpose**: Generate comprehensive architecture documentation with diagrams, ADRs, and interactive visualization.

**Usage**: `/create-architecture-documentation [framework] | --c4-model | --arc42 | --adr | --plantuml | --full-suite`

**When to use**:
- Creating or updating architecture documentation
- Generating architecture diagrams (C4, UML, etc.)
- Documenting architectural decisions (ADRs)
- Setting up automated documentation pipelines
- Onboarding new team members with architecture docs

**Documentation Frameworks Supported**:
- **C4 Model**: Context, Containers, Components, Code diagrams
- **Arc42**: Comprehensive architecture documentation template
- **ADRs**: Architecture Decision Records for decision documentation
- **PlantUML/Mermaid**: Diagram-as-code documentation
- **Structurizr**: C4 model tooling and visualization

**What it does**:
1. **Architecture Analysis** - Analyzes current system architecture and component relationships
2. **System Context** - Creates high-level diagrams and defines system boundaries
3. **Container Architecture** - Documents service architecture and deployment views
4. **Component Documentation** - Creates detailed component diagrams and module structure
5. **Data Architecture** - Documents data models, flows, and storage strategies
6. **Security Architecture** - Documents security patterns, threat models, and compliance
7. **Quality Attributes** - Documents performance, reliability, monitoring architecture
8. **ADRs** - Creates comprehensive decision records and tracking process
9. **Documentation Automation** - Sets up automated diagram generation and validation

**Output**: Complete architecture documentation suite with diagrams, ADRs, and maintenance procedures.

**Model**: Sonnet

**Allowed Tools**: Read, Write, Edit, Bash

---

### /mcp-orchestrator

**Purpose**: Orchestrate all MCP-specialized agents for comprehensive Model Context Protocol server development, testing, security review, and protocol compliance.

**Usage**: `/mcp-orchestrator [scope] | --design | --implement | --test | --secure | --review | --full-suite`

**When to use**:
- Designing new MCP servers from scratch
- Implementing MCP server with protocol compliance
- Running comprehensive testing and validation
- Performing security audits on MCP implementations
- Conducting full reviews of existing MCP servers
- Complete end-to-end MCP development cycles

**Orchestrated Agents**:
- **mcp-expert** - MCP integration and configuration specialist
- **mcp-server-architect** - Server architecture and implementation
- **mcp-protocol-specialist** - Protocol specification and standards
- **mcp-security-auditor** - Security review and vulnerability assessment
- **mcp-testing-engineer** - Testing, protocol compliance, and QA

**Orchestration Modes**:

1. **--design** - Architecture & Planning
   - Design server architecture (mcp-server-architect)
   - Validate protocol compliance (mcp-protocol-specialist)
   - Plan integration strategy (mcp-expert)

2. **--implement** - Full Implementation
   - Implement server core and transport layers (mcp-server-architect)
   - Ensure protocol compliance (mcp-protocol-specialist)
   - Configure integrations (mcp-expert)

3. **--test** - Testing & Validation
   - Protocol compliance tests (mcp-testing-engineer)
   - Transport validation (mcp-testing-engineer)
   - Specification adherence verification (mcp-protocol-specialist)

4. **--secure** - Security Review
   - Security audit (mcp-security-auditor)
   - Vulnerability testing (mcp-testing-engineer)
   - OAuth/RBAC validation (mcp-security-auditor)

5. **--review** - Comprehensive Review (all agents in parallel)
   - Architecture, protocol, security, testing, and integration review
   - Consolidated report with prioritized findings

6. **--full-suite** - Complete Development Cycle (all agents in sequence)
   - Design → Implementation → Testing → Security → Review
   - Production-ready MCP server delivery

**Smart Mode**: When invoked without arguments, analyzes codebase to determine appropriate scope automatically.

**Output**: Consolidated report with executive summary, per-agent findings, prioritized action items, and implementation roadmap. May include architecture docs, implementation code, test results, and security assessments depending on scope.

**Model**: Sonnet

**Allowed Tools**: Task, Read, Glob, Grep, Bash, TodoWrite

---

## Command Structure

Each command is defined in a Markdown file with frontmatter:
- `allowed-tools`: Tools the command can use
- `argument-hint`: Hints for command arguments
- `description`: What the command does
- `model`: Which model to use (sonnet/opus)

## Creating New Commands

1. Create a new Markdown file in `.claude/commands/`: `command-name.md`
2. Add frontmatter with configuration
3. Write the command prompt and instructions
4. Document the command in this README
5. Use the command: `/command-name [arguments]`

## Best Practices

- Keep commands focused on specific workflows
- Use `!` for inline bash command execution
- Use `@` for file references and context injection
- Provide clear argument hints for user guidance
- Document expected outputs and success criteria
- Include examples in command descriptions

---

Last updated: 2025-10-09
