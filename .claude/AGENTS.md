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

Last updated: 2025-10-09
