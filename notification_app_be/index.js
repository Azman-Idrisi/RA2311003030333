const axios = require("axios");
const { Log } = require("logging-middleware");

const BASE_URL = "http://20.207.122.201/evaluation-service";
const AUTH_URL = `${BASE_URL}/auth`;
const NOTIFICATIONS_URL = `${BASE_URL}/notifications`;

const CREDS = {
  email: "ma3079@srmist.edu.in",
  name: "mohd azman",
  rollNo: "ra2311003030333",
  accessCode: "QkbpxH",
  clientID: "e048b624-3848-4843-9033-999c373fae61",
  clientSecret: "tAgbdJQHZGTbrKWZ"
};

// placement is most important, then result, then event
const TYPE_WEIGHT = {
  Placement: 3,
  Result: 2,
  Event: 1
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

async function fetchNotifications(tok) {
  const res = await axios.get(NOTIFICATIONS_URL, {
    headers: { Authorization: `Bearer ${tok}` }
  });
  return res.data.notifications;
}

function getPriority(notif) {
  const w = TYPE_WEIGHT[notif.Type] || 0;
  const ageHrs = (Date.now() - new Date(notif.Timestamp).getTime()) / 3600000;
  const recency = Math.max(0, 1000 - ageHrs);
  // console.log(notif.Type, w * 1000 + recency);
  return w * 1000 + recency;
}

// min-heap capped at size k - keeps top k items efficiently
// each insert is O(log k) so overall O(n log k)
class MinHeap {
  constructor(k) {
    this.data = [];
    this.k = k;
  }

  push(item) {
    if (this.data.length < this.k) {
      this.data.push(item);
      this._up(this.data.length - 1);
    } else if (item.priority > this.data[0].priority) {
      this.data[0] = item;
      this._down(0);
    }
  }

  sorted() {
    return [...this.data].sort((a, b) => b.priority - a.priority);
  }

  _up(i) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.data[p].priority > this.data[i].priority) {
        [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
        i = p;
      } else break;
    }
  }

  _down(i) {
    const n = this.data.length;
    while (true) {
      let min = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l].priority < this.data[min].priority) min = l;
      if (r < n && this.data[r].priority < this.data[min].priority) min = r;
      if (min !== i) {
        [this.data[min], this.data[i]] = [this.data[i], this.data[min]];
        i = min;
      } else break;
    }
  }
}

function topN(notifications, n) {
  const heap = new MinHeap(n);
  for (const notif of notifications) {
    heap.push({ ...notif, priority: getPriority(notif) });
  }
  return heap.sorted();
}

async function main() {
  try {
    await Log("backend", "info", "service", "Priority Inbox started");

    const tok = await getToken();
    await Log("backend", "info", "auth", "Auth successful");

    const notifications = await fetchNotifications(tok);
    await Log("backend", "info", "service", `Fetched ${notifications.length} notifications`);

    console.log("=".repeat(80));
    console.log("PRIORITY INBOX - TOP 10 NOTIFICATIONS");
    console.log("=".repeat(80));
    console.log(`\nTotal fetched: ${notifications.length}\n`);

    const top10 = topN(notifications, 10);

    console.log("#".padEnd(4) + "Type".padEnd(14) + "Message".padEnd(40) + "Timestamp".padEnd(22) + "Score");
    console.log("-".repeat(80));

    top10.forEach((n, i) => {
      console.log(
        String(i + 1).padEnd(4) +
        n.Type.padEnd(14) +
        n.Message.substring(0, 38).padEnd(40) +
        n.Timestamp.padEnd(22) +
        n.priority.toFixed(1)
      );
    });

    console.log("\n" + "=".repeat(80));
    console.log("DETAILS");
    console.log("=".repeat(80));

    top10.forEach((n, i) => {
      console.log(`\n#${i + 1}`);
      console.log(`  ID:        ${n.ID}`);
      console.log(`  Type:      ${n.Type}  (weight: ${TYPE_WEIGHT[n.Type]})`);
      console.log(`  Message:   ${n.Message}`);
      console.log(`  Timestamp: ${n.Timestamp}`);
      console.log(`  Score:     ${n.priority.toFixed(1)}`);
    });

    await Log("backend", "info", "service", "Priority Inbox completed");
  } catch (err) {
    await Log("backend", "error", "service", `Inbox failed: ${err.message}`).catch(() => {});
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
