# Example: Generating a "Senior TypeScript Developer" System Prompt

Here's a practical example of how an AI would use the MCP server to create a dynamic system prompt:

## Step 1: Initial Discovery
```
AI: "I need to create a system prompt for a Senior TypeScript Developer persona. Let me start by exploring what's available."

Action: list_modules

Result: [Shows all 100+ available modules]

AI: "I can see the module organization. Now let me search for relevant modules."
```

## Step 2: Targeted Searches
```
# Search for TypeScript-specific modules
Action: module_discovery { "query": "typescript" }
Results: 
- technology/language/typescript/effective-generics.md
- technology/language/typescript/types-vs-interfaces.md
- technology/language/typescript/strict-type-checking.md
- technology/language/typescript/utility-types-best-practices.md

# Search for senior developer skills
Action: module_discovery { "query": "architecture" }
Results:
- principle/architecture/hexagonal-architecture.md
- principle/architecture/microservices.md
- principle/architecture/separation-of-concerns.md
[...more results]

# Search for code quality
Action: module_discovery { "query": "clean code" }
Results:
- principle/quality/clean-code-principles.md
- principle/quality/code-review-process.md
- principle/quality/solid-principles.md
```

## Step 3: Foundation Layer Discovery
```
# Get reasoning capabilities
Action: module_discovery { "query": "reasoning" }
Action: module_discovery { "query": "problem solving" }
Action: module_discovery { "query": "analysis" }

AI: "I'll select foundation modules that support architectural thinking and debugging."
```

## Step 4: Compile the System Prompt
```
Action: module_compile {
  "moduleIds": [
    // Foundation Layer 0-1 (Core Logic & Reasoning)
    "foundation/logic/deductive-reasoning.md",
    "foundation/reasoning/systems-thinking.md",
    
    // Foundation Layer 2 (Problem Solving)
    "foundation/problem-solving/root-cause-analysis.md",
    "foundation/problem-solving/problem-deconstruction.md",
    
    // Foundation Layer 3 (Metacognition)
    "foundation/metacognition/self-correction-process.md",
    "foundation/communication/structure-your-arguments.md",
    
    // Principles (Architecture & Quality)
    "principle/architecture/separation-of-concerns.md",
    "principle/architecture/design-for-scalability.md",
    "principle/quality/clean-code-principles.md",
    "principle/quality/solid-principles.md",
    "principle/design-patterns/composition-over-inheritance.md",
    
    // TypeScript Specific
    "technology/language/typescript/strict-type-checking.md",
    "technology/language/typescript/effective-generics.md",
    "technology/language/typescript/utility-types-best-practices.md",
    
    // Testing & Quality
    "principle/testing/design-for-testability.md",
    "technology/testing/vitest/best-practices.md",
    
    // Execution Playbooks
    "execution/playbook/refactor-component.md",
    "execution/playbook/debug-issue.md",
    "execution/playbook/review-pull-request.md"
  ]
}
```

## Step 5: Result
The compiled output would be a comprehensive system prompt with:
- Strong logical reasoning foundation
- TypeScript-specific expertise
- Architectural thinking capabilities
- Code quality focus
- Practical debugging and review skills

## Dynamic Adaptation Example
```
User: "I need help with React and TypeScript integration"

AI thinking: "The current prompt has TypeScript but not React. Let me add React modules."

Action: module_discovery { "query": "react typescript" }
Action: module_discovery { "query": "react hooks" }

Action: module_compile {
  "moduleIds": [
    // Add to existing compilation:
    "technology/framework/react/component-best-practices.md",
    "technology/framework/react/rules-of-hooks.md",
    "technology/framework/react/state-management-decisions.md"
  ]
}

AI: "I've enhanced my capabilities with React-specific guidance. Here's how to properly type your React components..."
```

## Usage Pattern
1. **Baseline Persona**: Start with a broad set of foundational modules
2. **Specialization**: Add domain-specific modules based on the task
3. **Dynamic Enhancement**: Search and add modules as new topics arise
4. **Context Switching**: Compile different module sets for different conversation contexts

This approach enables the AI to dynamically adjust its expertise based on the user's needs while maintaining a strong foundation in reasoning and best practices.
