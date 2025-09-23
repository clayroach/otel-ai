TODOs:

* Should the integration tests use a separate traces table that is created new each time rather than overlapping with the production "traces" table?  This would prevent the test cases from clearing production data on accident.  This would require checking for these tables prior to any new test run and truncating those tables or dropping them.
* Tools for each agent to direct the workflow
* Refactor server.ts to simplify
* Code coverage should be across all integration tests and identify any code we can remove
* Identify hardcoded values and replace with a configuration engine, which starts with reasonable defaults
* Prettifier standard per commit
* Coverage agent that runs all tests with coverage and identifies code that isn't used/can be removed
* Integration tests with and without demo - use canned demo data from previous runs with timestamps updated
* Topology enhacements - Time window top right, model default is LLama/Local, Analysis Type is all done at once so can remove, auto-update period can be "Manual", "1m", "5m"
* Telemetry data, processing speed, AI Processing are all great system health metrics and can move to it's own menu
* Critical Paths should generate additional queries that can be used to create visualizations automatically - should include 2 queries along with descriptions of the queries
* Counter for how many queries are being made against an LLM
* llm-manager refactor: sql-generation should have proper order defined by .env.  dotenv to read env.  makeLocalModelClient shouldn't have OpenAI code.  llm-query-generator should be using the llm manager via a layer, and not "const llmManager = createLLMManager".  Tests that use the llm-manager-mock.ts, ideally the ones from ui-generator.  Effect.Adaptor seems like a workaround for circumventing typesafe calls to functions?  Test cases for llm-manager should be using the layers.
* Stringly-typed dates/timestamps.  Those all need to be normalized to a standard format at the edges.
* Remove use of unknown's as much as possible
* Move developer stuff from README.md to DEVELOPER.md
* TestContainers for unit tests?
* Fast failures and remove all the fallbacks.  
* Align use of .env with .env.docker
* prune unnecessary .env configuration
* pnpm commands as built-in tools
* Consistent use of ANTHROPIC_API_KEY and CLAUDE_API_KEY
* Version control prompts for better outcomes and tuning
* portkey to route when using Clickhouse sql, not manually.  Should use similar prompting for Clickhouse and standard models
* portkey testcontainer unit tests
* coverage for integration tests
* Use github issues for feature and design docs
* Demo SITE!
* DRY-NESS agent daily scan to look for optimizations
* ai-analyzer is really just the static analyzer?