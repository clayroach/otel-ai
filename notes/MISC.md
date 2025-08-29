Should the integration tests use a separate traces table that is created new each time rather than overlapping with the production "traces" table?  This would prevent the test cases from clearing production data on accident.  This would require checking for these tables prior to any new test run and truncating those tables or dropping them.

I don't like the use of complex waiting logic in the integration tests.  It makes them more brittle and harder to read.  Can we simplify this?

Use the UI tests to generate screen shots for the daily note and blog posts.

consolidate ui into src folder

Tools for each agent to direct the workflow

