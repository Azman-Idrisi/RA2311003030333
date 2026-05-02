# vehicle maintenance scheduler

Fetches depots and vehicle tasks from the API, then figures out the best set of tasks to schedule for each depot — maximizing total impact without going over the hour budget.

Uses 0/1 knapsack (DP) per depot.

## Run

```bash
npm install
node index.js
```

Output shows selected tasks per depot and a summary at the end.

Sample output:
```
DEPOT 1 | Available Mechanic-Hours: 60
Selected Tasks: 17
Total Duration: 60 hours
Total Impact Score: 117
Remaining Hours: 0

TaskID                                  Duration    Impact
15703f0d-dc6b-4620-828b-d5cee4380518    5           10
6b6d43cf-a2a6-4166-9963-fc0e5c0e7d33    2           10
...

SUMMARY
Depot 1: 17 tasks | Impact: 117 | Used: 60/60h
Depot 2: 30 tasks | Impact: 170 | Used: 134/135h
```

## APIs used

- `POST /evaluation-service/auth` — get token
- `GET /evaluation-service/depots` — depot list with mechanic-hour budgets
- `GET /evaluation-service/vehicles` — vehicle tasks with duration and impact
