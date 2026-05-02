const axios = require("axios");
const { Log } = require("logging-middleware");

const BASE_URL = "http://20.207.122.201/evaluation-service";
const AUTH_URL = `${BASE_URL}/auth`;
const DEPOTS_URL = `${BASE_URL}/depots`;
const VEHICLES_URL = `${BASE_URL}/vehicles`;

const CREDS = {
  email: "ma3079@srmist.edu.in",
  name: "mohd azman",
  rollNo: "ra2311003030333",
  accessCode: "QkbpxH",
  clientID: "e048b624-3848-4843-9033-999c373fae61",
  clientSecret: "tAgbdJQHZGTbrKWZ"
};

let cachedToken = null;
let tokenExp = 0;

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExp - 60) return cachedToken;

  const res = await axios.post(AUTH_URL, CREDS);
  cachedToken = res.data.access_token;
  tokenExp = res.data.expires_in;
  return cachedToken;
}

async function fetchDepots(tok) {
  const res = await axios.get(DEPOTS_URL, {
    headers: { Authorization: `Bearer ${tok}` }
  });
  return res.data.depots;
}

async function fetchVehicles(tok) {
  const res = await axios.get(VEHICLES_URL, {
    headers: { Authorization: `Bearer ${tok}` }
  });
  return res.data.vehicles;
}

// knapsack - pick tasks that maximize impact without going over hour budget
// using bottom-up DP, O(n*W)
function knapsack(tasks, capacity) {
  const n = tasks.length;
  if (n === 0 || capacity === 0) return { selectedTasks: [], totalImpact: 0, totalDuration: 0 };

  const dp = [];
  for (let i = 0; i <= n; i++) {
    dp.push(new Array(capacity + 1).fill(0));
  }

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = tasks[i - 1];
    for (let w = 0; w <= capacity; w++) {
      if (Duration <= w) {
        dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - Duration] + Impact);
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }

  // trace back which tasks were picked
  const picked = [];
  let rem = capacity;
  for (let i = n; i > 0; i--) {
    if (dp[i][rem] !== dp[i - 1][rem]) {
      picked.push(tasks[i - 1]);
      rem -= tasks[i - 1].Duration;
    }
  }

  picked.reverse();

  let totalImpact = 0;
  let totalDuration = 0;
  for (const t of picked) {
    totalImpact += t.Impact;
    totalDuration += t.Duration;
  }

  return { selectedTasks: picked, totalImpact, totalDuration };
}

async function main() {
  try {
    await Log("backend", "info", "service", "Maintenance Scheduler started");

    const tok = await getToken();
    await Log("backend", "info", "auth", "Authentication successful");

    const depots = await fetchDepots(tok);
    await Log("backend", "info", "service", `Fetched ${depots.length} depots`);

    const vehicles = await fetchVehicles(tok);
    await Log("backend", "info", "service", `Fetched ${vehicles.length} vehicles/tasks`);

    console.log("=".repeat(70));
    console.log("VEHICLE MAINTENANCE SCHEDULER - OPTIMIZATION RESULTS");
    console.log("=".repeat(70));
    console.log(`\nTotal depots: ${depots.length}`);
    console.log(`Total vehicle tasks: ${vehicles.length}\n`);

    const results = [];

    for (const depot of depots) {
      console.log("-".repeat(70));
      console.log(`DEPOT ${depot.ID} | Available Mechanic-Hours: ${depot.MechanicHours}`);
      console.log("-".repeat(70));

      const result = knapsack(vehicles, depot.MechanicHours);

      console.log(`Selected Tasks: ${result.selectedTasks.length}`);
      console.log(`Total Duration: ${result.totalDuration} hours`);
      console.log(`Total Impact Score: ${result.totalImpact}`);
      console.log(`Remaining Hours: ${depot.MechanicHours - result.totalDuration}`);
      console.log("\nSelected Task Details:");
      console.log("TaskID".padEnd(40) + "Duration".padEnd(12) + "Impact");

      for (const task of result.selectedTasks) {
        console.log(
          task.TaskID.padEnd(40) +
          String(task.Duration).padEnd(12) +
          String(task.Impact)
        );
      }

      results.push({
        depotId: depot.ID,
        mechanicHours: depot.MechanicHours,
        ...result
      });

      await Log("backend", "info", "service",
        `Depot ${depot.ID}: ${result.selectedTasks.length} tasks, impact=${result.totalImpact}`
      );
    }

    console.log("\n" + "=".repeat(70));
    console.log("SUMMARY");
    console.log("=".repeat(70));
    for (const r of results) {
      console.log(`Depot ${r.depotId}: ${r.selectedTasks.length} tasks | Impact: ${r.totalImpact} | Used: ${r.totalDuration}/${r.mechanicHours}h`);
    }

    await Log("backend", "info", "service", "Scheduler completed successfully");
  } catch (err) {
    await Log("backend", "fatal", "service", `Scheduler failed: ${err.message}`).catch(() => {});
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
