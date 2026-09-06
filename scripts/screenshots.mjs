// npm run screenshots -- /absolute/path/to/mylight
// Uses a disposable household and never opens your normal database.
import { chromium } from "playwright";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

const binary = path.resolve(process.argv[2] || "./mylight");
const port = process.env.SCREENSHOT_PORT || "3301";
const base = `http://127.0.0.1:${port}`;
// Fail before touching an existing listener's API, even if it has no owner yet.
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(Number(port), "127.0.0.1", resolve);
});
await new Promise((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
);
const data = await mkdtemp(path.join(tmpdir(), "mylight-screenshots-"));
const server = spawn(binary, [], {
  env: {
    ...process.env,
    DATA_DIR: data,
    PORT: port,
    LISTEN_HOST: "127.0.0.1",
    MYLIGHT_TAILSCALE: "false",
    MYLIGHT_TAILSCALE_ONLY: "false",
    COOKIE_SECURE: "false",
    DIST_DIR: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let exited = false;
let serverLog = "";
server.stdout.on("data", (b) => {
  serverLog += b;
});
server.stderr.on("data", (b) => {
  serverLog += b;
});
server.on("exit", () => {
  exited = true;
});
server.on("error", (e) => {
  exited = true;
  serverLog += e.message;
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error(serverLog);
    try {
      ready = (await fetch(`${base}/readyz`)).ok;
    } catch {
      /* Wait for the disposable server to listen. */
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready || exited) throw new Error(`Demo server failed: ${serverLog}`);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1,
    timezoneId: "America/Chicago",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const request = context.request;
  async function post(route, payload) {
    const response = await request.post(`${base}/api/${route}`, {
      headers: { "X-MyLight-Request": "1" },
      data: payload,
    });
    if (!response.ok()) throw new Error(`${route}: ${await response.text()}`);
    return response.json();
  }
  const setup = await request.get(`${base}/api/setup`);
  if (!(await setup.json()).needs_setup)
    throw new Error(
      "Refusing to seed an existing household. Choose an unused SCREENSHOT_PORT.",
    );
  await post("setup", {
    name: "Alex",
    email: "alex@example.test",
    password: "fictional-demo-only-2026",
    family_name: "The Meadow Family",
    timezone: "America/Chicago",
  });
  const family = [{ id: 1, name: "Alex" }];
  for (const [name, color] of [
    ["Jamie", "bg-blue-100 text-blue-800"],
    ["Emma", "bg-pink-100 text-pink-800"],
    ["Leo", "bg-amber-100 text-amber-800"],
  ]) {
    family.push(
      await post("family", { name, color, visible: true, role: "user" }),
    );
  }
  const tasks = [
    ["Walk Maple", "Water the garden", "Pack lunches"],
    ["Make breakfast", "Pick up groceries", "Tidy the kitchen"],
    ["Make my bed", "Read for 20 minutes", "Feed Maple"],
    ["Brush my teeth", "Pack my backpack", "Put toys away"],
  ];
  for (const [i, member] of family.entries()) {
    for (const [j, title] of tasks[i].entries()) {
      const chore = await post("chores", {
        title,
        member_id: member.id,
        time_of_day: j < 2 ? "Morning" : "Evening",
      });
      if (j === 0) await post(`chores/${chore.id}/toggle`, { completed: true });
    }
  }
  const date = (day) => `2026-09-${String(day).padStart(2, "0")}`;
  const events = [
    [6, 11, "Sunday brunch", 0, "At home"],
    [7, 8, "School drop-off", 1, "Oakwood Elementary"],
    [7, 10, "Coffee with Sam", 2, "Little Fern Café"],
    [7, 15, "Soccer practice", 4, "Riverside Park"],
    [7, 16, "Piano lesson", 3, "Music studio"],
    [8, 9, "Library story time", 4, "Town library"],
    [8, 17, "Taco Tuesday", 0, "At home"],
    [9, 15, "Art club", 3, "Oakwood Elementary"],
    [10, 16, "Swim lessons", 4, "Community pool"],
    [11, 18, "Pizza & movie night", 0, "Living room"],
    [12, 9, "Farmers market", 0, "Town square"],
    [13, 11, "Picnic with Grandma", 0, "Riverside Park"],
    [14, 15, "Soccer practice", 4, "Riverside Park"],
    [15, 16, "Piano lesson", 3, "Music studio"],
    [17, 16, "Swim lessons", 4, "Community pool"],
    [19, 10, "Apple picking", 0, "Sunny Hill Orchard"],
    [21, 15, "Soccer practice", 4, "Riverside Park"],
    [23, 15, "Art club", 3, "School"],
    [25, 18, "Family game night", 0, "At home"],
    [27, 11, "Sunday brunch", 0, "At home"],
  ];
  for (const [day, hour, title, member, location] of events)
    await post("events", {
      title,
      start_date: `${date(day)}T${String(hour).padStart(2, "0")}:00:00-05:00`,
      end_date: `${date(day)}T${String(hour + 1).padStart(2, "0")}:00:00-05:00`,
      timezone: "America/Chicago",
      member_ids: member ? [member] : [],
      is_all_day: false,
      location,
    });
  const dinners = [
    "Lemon chicken & rice",
    "Rainbow veggie tacos",
    "Salmon & roasted greens",
    "Homemade pesto pasta",
    "Build-your-own pizza",
    "Burgers in the backyard",
    "Sunday roast",
  ];
  for (let day = 1; day <= 30; day++) {
    const i = (day - 7 + 35) % 7;
    for (const [type, title, color] of [
      [
        "Breakfast",
        ["Berry overnight oats", "Eggs & sourdough", "Banana pancakes"][i % 3],
        "#FDE68A",
      ],
      [
        "Lunch",
        ["Garden wraps", "Tomato soup & toast", "Chicken salad"][i % 3],
        "#BBF7D0",
      ],
      ["Dinner", dinners[i], "#FED7AA"],
    ])
      await post("meals", { title, date: date(day), type, color });
  }
  for (const [title, icon, items] of [
    [
      "This week’s groceries",
      "shopping-cart",
      [
        "Blueberries",
        "Sourdough bread",
        "Fresh basil",
        "Cherry tomatoes",
        "Oat milk",
        "Lemons",
        "Chicken thighs",
      ],
    ],
    [
      "Weekend adventures",
      "list",
      [
        "Visit the farmers market",
        "Pick apples at the orchard",
        "Picnic by the river",
        "Bake something together",
      ],
    ],
  ]) {
    const list = await post("lists", { title, icon });
    for (const text of items) await post("items", { list_id: list.id, text });
  }
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-09-07T09:15:00-05:00"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("docs/images", { recursive: true });
  for (const [route, name] of [
    ["/", "today"],
    ["/calendar", "calendar"],
    ["/chores", "tasks"],
    ["/meals", "meals"],
    ["/lists", "lists"],
  ]) {
    await page.goto(base + route);
    await page.getByRole("navigation").first().waitFor();
    if (route === "/calendar") {
      await page.getByRole("button", { name: /^week$/i }).click();
    }
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/images/${name}.png`, fullPage: false });
    console.log(`Captured ${name}`);
  }
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.goto(base + "/calendar");
  await page.getByRole("button", { name: /^week$/i }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "docs/images/calendar-dark.png" });
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser?.close();
  if (!exited) {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    await stopped;
  }
  await rm(data, { recursive: true, force: true });
}
