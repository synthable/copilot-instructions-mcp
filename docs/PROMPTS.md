# Bootstrap Prompts Usage Guide

## Overview

These bootstrap prompts enable AI models to dynamically generate specialized system prompts using the MCP Instruction Modules server. The AI can discover, search, and compile instruction modules to create purpose-built personas and enhance its capabilities on-demand.

## Available Bootstrap Prompts

### 1. **Full Bootstrap Prompt** (`bootstrap-prompt.md`)
Comprehensive guide explaining the entire module system, search strategies, and compilation best practices. Use this for:
- Training new AI instances
- Understanding the complete system
- Reference documentation

### 2. **System Prompt Generator** (`system-prompt-generator.md`)
Focused prompt that enables dynamic capability enhancement. Use this for:
- Production AI assistants
- Dynamic expertise adaptation
- Real-time persona switching

### 3. **Concise Integration** (`concise-mcp-prompt.md`)
Minimal prompt for space-constrained contexts. Use this for:
- Adding MCP capabilities to existing prompts
- Quick integration testing
- Embedded systems

### 4. **Persona Builder Specialist** (`persona-builder-prompt.md`)
Specialized for creating well-structured personas. Use this for:
- Persona development workflows
- Following the four-tier philosophy
- Validating module compositions

## Implementation Patterns

### Pattern 1: Static Persona Generation
1. Use the bootstrap prompt to generate a persona
2. Save the compiled modules as a static system prompt
3. Deploy without MCP dependency

```
Human: Create a senior backend developer persona focused on Node.js and microservices

AI: [Uses MCP to discover and compile relevant modules]
AI: Here's your compiled system prompt: [2000 lines of instructions]
```

### Pattern 2: Dynamic Enhancement
1. Start with a base prompt + MCP integration
2. Dynamically load modules based on conversation context
3. Adapt expertise in real-time

```
Human: I need help with Kubernetes deployment

AI: [Discovers Kubernetes modules and enhances capabilities]
AI: I've loaded specialized Kubernetes modules. Here's how to...
```

### Pattern 3: Hybrid Approach
1. Core persona compiled statically
2. MCP integration for specialized requests
3. Best of both worlds

```
Base: Senior Developer (static)
Dynamic: +Security modules when discussing vulnerabilities
         +Performance modules when optimizing
         +Testing modules when writing tests
```

## Configuration Examples

### Claude Desktop Configuration
```json
{
  "mcpServers": {
    "instruction-modules": {
      "command": "node",
      "args": ["/path/to/mcp-instruction-modules/dist/index.js"]
    }
  },
  "systemPrompt": "paste-your-chosen-bootstrap-prompt-here"
}
```

### API Integration
```python
# Include bootstrap prompt in system message
system_prompt = open('system-prompt-generator.md').read()

response = client.messages.create(
    model="claude-3",
    system=system_prompt,
    messages=[...]
)
```

## Best Practices

1. **Start Simple**: Begin with the concise prompt, upgrade to full version as needed

2. **Test Module Combinations**: Not all modules work well together—test your compilations

3. **Cache Common Personas**: Save frequently-used combinations to avoid recompilation

4. **Monitor Usage**: Track which modules are most valuable for your use cases

5. **Iterate**: Refine module selections based on actual performance

## Common Use Cases

### 1. Specialized Code Review
```
Modules: clean-code + review-process + language-specific + testing
Result: Thorough, constructive code reviews with specific suggestions
```

### 2. Architecture Consultation
```
Modules: systems-thinking + patterns + scalability + decision-making
Result: Well-reasoned architectural recommendations
```

### 3. Debugging Assistant
```
Modules: root-cause + binary-search + debugging-playbooks + logging
Result: Systematic debugging approach with clear steps
```

### 4. Learning Companion
```
Modules: feynman-technique + scaffolding + clear-communication
Result: Patient, adaptive teaching with comprehension checks
```

## Troubleshooting

**Q: AI can't find relevant modules**
- Try broader search terms
- Check module list manually
- Verify MCP server is running

**Q: Compiled prompt is too long**
- Focus on essential modules only
- Remove redundant capabilities
- Use the concise integration prompt

**Q: Persona lacks coherence**
- Review four-tier philosophy
- Ensure proper module ordering
- Check for conflicting instructions

**Q: Dynamic loading is slow**
- Pre-compile common combinations
- Cache search results
- Minimize discovery calls

## Next Steps

1. Choose appropriate bootstrap prompt for your needs
2. Configure MCP server access
3. Test with simple persona generation
4. Iterate based on results
5. Deploy in production

Remember: The power of this system lies in its flexibility. Start with proven patterns, then experiment to find what works best for your specific use cases.
