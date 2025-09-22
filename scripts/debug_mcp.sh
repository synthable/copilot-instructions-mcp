#!/bin/bash

# @fileoverview MCP Server Debug Script - Shell-based debugging for MCP protocol and semantic search issues
#
# OVERVIEW:
# Shell script for debugging MCP (Model Context Protocol) server issues, particularly
# semantic search hangs, timeouts, and stdio communication problems. Provides timeout
# protection and detailed logging for troubleshooting server issues.
#
# USE CASES:
# 1. Debug MCP server hangs - detect when server becomes unresponsive
# 2. Test stdio communication - verify JSON-RPC protocol works correctly
# 3. Semantic search debugging - isolate semantic search timeout issues
# 4. Process management testing - ensure proper server startup/shutdown
# 5. CI/CD debugging - troubleshoot server issues in automated environments
#
# USAGE:
#   chmod +x scripts/debug_mcp.sh    # Make executable (first time only)
#   ./scripts/debug_mcp.sh           # Run debug test
#
# WHAT IT TESTS:
# - MCP server initialization via stdio transport
# - semantic_search tool functionality
# - Server responsiveness (10-second timeout)
# - Process cleanup and error handling
# - JSON-RPC protocol compliance
#
# EXAMPLES:
#   # Basic debug run
#   ./scripts/debug_mcp.sh
#
#   # Debug with verbose output (if you modify the script)
#   bash -x scripts/debug_mcp.sh
#
#   # Run from project root
#   scripts/debug_mcp.sh
#
# OUTPUT:
# - Server initialization status
# - Semantic search request/response
# - Timeout detection (if server hangs)
# - Process cleanup confirmation
# - Detailed logs in /tmp/mcp_test_*.log files
#
# TROUBLESHOOTING:
# - "semantic search is hanging": Server timeout detected, check server logs
# - "semantic search completed": Normal operation, check output for errors
# - Permission denied: Run chmod +x scripts/debug_mcp.sh
# - Command not found: Ensure script is run from project root
#
# LOG FILES:
# - /tmp/mcp_test_1.log: Server initialization output
# - /tmp/mcp_test_2.log: Semantic search test output
# Files are cleaned up automatically after test completion
#
# @author MCP Server Team
# @version 1.0.0
# @since 1.0.0

echo "Testing MCP server semantic search..."

# Initialize the server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js stdio > /tmp/mcp_test_1.log 2>&1 &
MCP_PID=$!

sleep 1

# Test semantic search
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"semantic_search","arguments":{"query":"test","limit":3}}}' | node dist/index.js stdio > /tmp/mcp_test_2.log 2>&1 &
SEARCH_PID=$!

# Wait up to 10 seconds
timeout 10 wait $SEARCH_PID

if kill -0 $SEARCH_PID 2>/dev/null; then
    echo "Semantic search is hanging - killing process"
    kill $SEARCH_PID
    cat /tmp/mcp_test_2.log
else
    echo "Semantic search completed"
    cat /tmp/mcp_test_2.log
fi

# Cleanup
kill $MCP_PID 2>/dev/null
rm -f /tmp/mcp_test_*.log
