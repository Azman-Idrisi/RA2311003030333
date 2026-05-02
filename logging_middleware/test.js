const { Log } = require("./index");

async function main() {
  try {
    console.log("Testing Log middleware...\n");

    const result1 = await Log("backend", "error", "handler", "received string, expected bool");
    console.log("Log 1 response:", result1);

    const result2 = await Log("backend", "info", "service", "User login successful");
    console.log("Log 2 response:", result2);

    const result3 = await Log("backend", "fatal", "db", "Critical database connection failure.");
    console.log("Log 3 response:", result3);

    console.log("\nAll logs sent successfully!");
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

main();
