# Claude Code Custom Agents

This directory contains custom agent definitions for specialized tasks in the copilot-instructions-mcp project.

## Available Agents

### github-agent

**Purpose**: Handle all GitHub CLI (`gh`) operations including PR management, issue tracking, and repository interactions.

**When to use**:
- Creating or managing pull requests
- Creating or managing issues
- Fetching PR/issue comments or metadata
- Changing PR base branches
- Merging PRs
- Creating releases
- Managing labels and assignments
- Interacting with GitHub API via `gh api`

**Example usage**:
```
User: "Create a PR for this branch targeting develop"
Assistant: [Uses Task tool with github-agent]

User: "Add the 'bug' label to issue #15"
Assistant: [Uses Task tool with github-agent]

User: "What are the latest comments on PR #11?"
Assistant: [Uses Task tool with github-agent]
```

**Key features**:
- ✅ Structured PR/issue creation with proper Markdown formatting
- ✅ PR comment fetching and analysis
- ✅ Label and assignee management
- ✅ Branch and base management
- ✅ Release creation
- ✅ GitHub API interactions
- ✅ Error handling for auth and rate limits

**Constraints**:
- Read-only for repository files (defers to parent for commits)
- Requires user confirmation for destructive operations
- Uses `--force-with-lease` instead of `--force` for safety

### typescript-pro

**Purpose**: Write idiomatic TypeScript with advanced type system features, strict typing, and modern patterns.

**When to use**:
- Complex TypeScript type definitions and generics
- Advanced type system features (conditional types, mapped types, template literals)
- TypeScript migration from JavaScript
- Strict type checking configuration and optimization
- Type-safe API design and error handling
- Build performance optimization

**Example usage**:
```
User: "Help me design a type-safe builder pattern for this API"
Assistant: [Uses Task tool with typescript-pro]

User: "Migrate this JavaScript module to strict TypeScript"
Assistant: [Uses Task tool with typescript-pro]

User: "Optimize our tsconfig for better compilation performance"
Assistant: [Uses Task tool with typescript-pro]
```

**Key features**:
- ✅ Advanced type system expertise (mapped types, conditional types, template literals)
- ✅ Generic constraints and type inference optimization
- ✅ Strict tsconfig.json configuration
- ✅ Build performance and compilation speed optimization
- ✅ Custom utility types and type helpers
- ✅ Declaration files and module augmentation

**Model**: Uses Sonnet for optimal performance on complex type operations

**Tools**: Read, Write, Edit, Bash

### architect-reviewer

**Purpose**: Review code for architectural consistency and patterns. Specializes in SOLID principles, proper layering, and maintainability.

**When to use**:
- Reviewing structural changes in pull requests
- Designing new services or components
- Refactoring code to improve architecture
- Ensuring API modifications align with existing design
- Validating service boundaries and dependencies

**Example usage**:
```
User: "Please review the architecture of this new feature"
Assistant: [Uses Task tool with architect-reviewer]

User: "Can you check if this new service is designed correctly?"
Assistant: [Uses Task tool with architect-reviewer]

User: "Review this refactoring for SOLID compliance"
Assistant: [Uses Task tool with architect-reviewer]
```

**Key features**:
- ✅ Pattern adherence verification (MVC, Microservices, CQRS)
- ✅ SOLID principles compliance checking
- ✅ Dependency analysis and circular dependency detection
- ✅ Abstraction level verification
- ✅ Service boundary and separation of concerns analysis
- ✅ Long-term maintainability and scalability assessment

**Review Process**:
1. Map the change within overall system architecture
2. Identify architectural boundaries being crossed
3. Check consistency with existing patterns
4. Evaluate impact on modularity and coupling
5. Suggest architectural improvements

**Output Format**:
- Architectural Impact assessment (High/Medium/Low)
- Pattern compliance checklist
- Specific violations with explanations
- Recommended refactoring or design changes
- Long-term implications for maintainability

**Model**: Uses Opus for deep architectural analysis

**Color**: Gray (in UI)

---

## Advisory Agents

These agents provide specialized advisory perspectives when the primary assistant needs to confer on important technical decisions. They offer multi-perspective analysis to support better decision-making.

### technical-counsel

**Purpose**: Multi-perspective technical analysis for complex decisions with comprehensive trade-off evaluation.

**When to use**:
- Complex technical decisions with multiple viable approaches
- Technology or framework selection decisions
- Architecture pattern choices (microservices vs. monolith, event-driven vs. request-response)
- Algorithm or data structure selection
- Evaluating conflicting design approaches

**Example usage**:
```
Assistant: "I need to evaluate whether to use PostgreSQL or MongoDB for this feature. Let me consult technical-counsel."
[Uses Task tool with technical-counsel]

User: "Should we refactor this to use dependency injection?"
Assistant: [Uses Task tool with technical-counsel]
```

**Key features**:
- ✅ Multi-perspective analysis (performance, maintainability, complexity, ecosystem)
- ✅ Systematic trade-off evaluation across key dimensions
- ✅ Evidence-based recommendations grounded in CS principles
- ✅ Comparative analysis of multiple options
- ✅ Confidence-rated recommendations (high/medium/low)
- ✅ Identifies scenarios where each approach excels

**Analysis Framework**:
1. Context clarification and constraint identification
2. Enumeration of all viable options
3. Systematic evaluation across technical dimensions
4. Comparative analysis with critical differentiators
5. Clear recommendation with confidence level

**Model**: Uses Opus for deep multi-perspective analysis

**Tools**: Read, Grep, Glob, Bash

**Color**: Blue (in UI)

### risk-advisor

**Purpose**: Identifies technical risks, edge cases, security implications, and failure modes with mitigation strategies.

**When to use**:
- Security-sensitive implementations (authentication, payment processing, data handling)
- High-stakes deployments or migrations
- Complex integrations with external systems
- Performance-critical code paths
- Evaluating architectural decisions for failure modes

**Example usage**:
```
Assistant: "This authentication implementation needs risk assessment before proceeding."
[Uses Task tool with risk-advisor]

User: "We're planning to migrate to a new database. What could go wrong?"
Assistant: [Uses Task tool with risk-advisor]
```

**Key features**:
- ✅ Systematic risk identification across security, reliability, performance, operational concerns
- ✅ Severity and likelihood assessment (Critical/High/Medium/Low)
- ✅ Edge case and boundary condition enumeration
- ✅ Failure mode and attack surface analysis
- ✅ Specific mitigation strategies (preventive, detective, corrective)
- ✅ Monitoring and alerting recommendations

**Risk Categories**:
- Security risks (injection, auth bypass, data exposure)
- Reliability risks (single points of failure, data corruption, race conditions)
- Performance risks (memory leaks, resource exhaustion, inefficient algorithms)
- Operational risks (deployment failures, configuration errors, monitoring gaps)
- Maintenance risks (technical debt, deprecated dependencies, breaking changes)

**Model**: Uses Sonnet for efficient risk analysis

**Tools**: Read, Grep, Glob, Bash

**Color**: Red (in UI)

### pragmatist

**Purpose**: Balances ideal solutions with practical constraints, shipping priorities, and real-world delivery considerations.

**When to use**:
- Time-constrained delivery situations
- Evaluating scope and MVP definitions
- Balancing technical debt vs. shipping velocity
- Team capacity and skill level considerations
- "Should we build this or use an existing solution?" decisions

**Example usage**:
```
Assistant: "We have a 2-week deadline. Let me consult pragmatist to evaluate the minimal viable approach."
[Uses Task tool with pragmatist]

User: "Should we implement our own authentication or use Auth0?"
Assistant: [Uses Task tool with pragmatist]
```

**Key features**:
- ✅ Reality check against time, team, and resource constraints
- ✅ Minimal Viable Implementation (MVI) identification
- ✅ Incremental delivery and phased rollout strategies
- ✅ Technical debt assessment with paydown timelines
- ✅ Build vs. buy vs. adapt analysis
- ✅ Team skill level and maintenance burden evaluation

**Pragmatic Patterns**:
- The 3-Iteration Rule (make it work → make it right → make it fast)
- When to go simple vs. when to invest in quality
- Identifying over-engineering and analysis paralysis
- Evolution paths from pragmatic to ideal solutions

**Model**: Uses Sonnet for practical analysis

**Tools**: Read, Grep, Glob, Bash

**Color**: Green (in UI)

---

## Using Advisory Agents

The primary assistant can consult these agents when facing important technical decisions:

1. **Consult technical-counsel** for comprehensive technical trade-off analysis
2. **Consult risk-advisor** to identify risks, edge cases, and failure modes
3. **Consult pragmatist** to ground decisions in practical delivery constraints

**Typical Consultation Flow**:
```
Assistant thinks: "This decision has significant technical implications. I should consult advisory agents."

1. Consults technical-counsel for multi-perspective analysis
2. Consults risk-advisor for risk assessment
3. Consults pragmatist for practical reality check
4. Synthesizes perspectives and makes recommendation to user
```

**When to consult**:
- Architectural decisions affecting system design
- Technology selection with long-term implications
- Complex refactoring with multiple approaches
- Security-sensitive implementations
- High-stakes deployments or migrations
- Scope and delivery timeline decisions

**When not to consult**:
- Trivial decisions with clear answers
- Straightforward bug fixes
- Simple code changes with no architectural impact
- User has explicitly chosen an approach (just implement it)

## Agent Structure

Each agent is defined in a Markdown file with frontmatter:

**Frontmatter** (metadata):
- `name`: Unique identifier for the agent
- `description`: What the agent does
- `tools`: Comma-separated list of allowed tools
- `model`: Which model to use (optional: sonnet, opus)
- `color`: UI color hint (optional)
- `autonomy_level`: How autonomous the agent is (optional)

**Body** (natural language prompt):
- Core expertise areas
- Operational guidelines
- Common command patterns
- Input handling rules
- Error handling strategies
- Output format specifications
- Delegation rules
- Safety constraints

## Creating New Agents

1. Create a new Markdown file: `.claude/agents/agent-name.md`
2. Add frontmatter with agent metadata
3. Write natural language prompt defining the agent's behavior
4. Document the agent in this AGENTS.md file
5. Use the Task tool to invoke: `Task(description="...", prompt="...", subagent_type="agent-name")`

**Template**:
```markdown
---
name: agent-name
description: Brief description of what this agent does
tools: Bash, Read, Write
model: sonnet
---

You are an expert in [domain]...
[Natural language instructions]
```

## Best Practices

- Keep agents focused on a specific domain
- Define clear delegation boundaries
- Include comprehensive examples
- Document constraints and safety rules
- Provide error handling guidelines
- Specify autonomy level (low/medium/high)

---

Last updated: 2025-01-21
