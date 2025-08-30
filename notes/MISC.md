TODOs:

* Should the integration tests use a separate traces table that is created new each time rather than overlapping with the production "traces" table?  This would prevent the test cases from clearing production data on accident.  This would require checking for these tables prior to any new test run and truncating those tables or dropping them.
* I don't like the use of complex waiting logic in the integration tests.  It makes them more brittle and harder to read.  Can we simplify this?
* Use the UI tests to generate screen shots for the daily note and blog posts.
* Consolidate ui into src folder
* Tools for each agent to direct the workflow
* Refactor server.ts to simplify
* Code coverage should be across all integration tests and identify any code we can remove
* Identify hardcoded values and replace with a configuration engine, which starts with reasonable defaults
* Prettifier standard per commit
* Coverage agent that runs all tests with coverage and identifies code that isn't used/can be removed
* Integration tests with and without demo - use canned demo data from previous runs with timestamps updated