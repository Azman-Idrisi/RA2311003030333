const axios = require("axios");

const LOG_URL = "http://20.207.122.201/evaluation-service/logs";
const AUTH_URL = "http://20.207.122.201/evaluation-service/auth";

const VALID_STACKS = ["backend", "frontend"];
const VALID_LEVELS = ["debug", "info", "warn", "error", "fatal"];

const BACKEND_PACKAGES = [
  "cache", "controller", "cron_job", "db", "domain",
  "handler", "repository", "route", "service"
];
const FRONTEND_PACKAGES = [
  "api", "component", "hook", "page", "state", "style"
];
const SHARED_PACKAGES = ["auth", "config", "middleware", "utils"];

const CREDS = {
  email: "ma3079@srmist.edu.in",
  name: "mohd azman",
  rollNo: "ra2311003030333",
  accessCode: "QkbpxH",
  clientID: "e048b624-3848-4843-9033-999c373fae61",
  clientSecret: "tAgbdJQHZGTbrKWZ"
};

let token = null;
let tokenExp = 0;

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiry - 60) {
    return cachedToken;
  }

  try {
    const response = await axios.post(AUTH_URL, CREDENTIALS);
    cachedToken = response.data.access_token;
    tokenExpiry = response.data.expires_in;
    return cachedToken;
  } catch (error) {
    throw new Error(`Failed to get access token: ${error.message}`);
  }
}

function validate(stack, level, pkg) {
  if (!VALID_STACKS.includes(stack)) {
    throw new Error(`invalid stack "${stack}"`);
  }
  if (!VALID_LEVELS.includes(level)) {
    throw new Error(`invalid level "${level}"`);
  }

  const allowed = stack === "backend"
    ? [...BACKEND_PACKAGES, ...SHARED_PACKAGES]
    : [...FRONTEND_PACKAGES, ...SHARED_PACKAGES];

  if (!allowed.includes(pkg)) {
    throw new Error(`package "${pkg}" not allowed for stack "${stack}"`);
  }
}

async function Log(stack, level, pkg, message) {
  stack = stack.toLowerCase();
  level = level.toLowerCase();
  pkg = pkg.toLowerCase();

  validate(stack, level, pkg);

  const token = await getAccessToken();

  const body = { stack, level, package: pkg, message };

  try {
    const response = await axios.post(API_URL, body, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });
    return response.data;
  } catch (err) {
    const msg = err.response
      ? `${err.response.status}: ${JSON.stringify(err.response.data)}`
      : err.message;
    console.error(`[log] failed: ${msg}`);
    throw err;
  }
}

module.exports = { Log, getToken };
