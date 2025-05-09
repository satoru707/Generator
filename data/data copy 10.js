const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

puppeteer.use(StealthPlugin());

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
  );
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });

  const URL =
    "https://us.soccerway.com/national/argentina/prim-b-metro/2025/apertura/r86270/";
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 100000 });

  // Wait for the game week dropdown to appear
  await page.waitForSelector(
    "#page_competition_1_block_competition_matches_summary_10_page_dropdown",
    { timeout: 15000 }
  );

  // Select Game Week 1 (value="0")
  await page.select(
    "#page_competition_1_block_competition_matches_summary_10_page_dropdown",
    "9"
  );

  // Wait for the matches to reload
  await delay(2000); // Adjust this delay if needed
  await page.waitForSelector(".matches", { timeout: 15000 });

  // Rest of your existing scraping code...
  const matches = await page.evaluate(() => {
    const data = [];
    const rows = Array.from(document.querySelectorAll(".matches tr"));

    let currentMatchday = "";
    let currentDate = "";

    rows.forEach((row) => {
      if (row.classList.contains("gameweek-head")) {
        const title = row.querySelector("h4")?.innerText.trim();
        if (title) currentMatchday = title;
      } else if (row.classList.contains("no-date-repetition-new")) {
        const date = row.querySelector(".date")?.innerText.trim();
        if (date) currentDate = date;
      } else if (row.classList.contains("match")) {
        const homeTeam = row.querySelector(".team-a a")?.innerText.trim();
        const awayTeam = row.querySelector(".team-b a")?.innerText.trim();
        const score = row.querySelector(".score-time span")?.innerText.trim();
        const linkPath = row
          .querySelector(".score-time a")
          ?.getAttribute("href");
        const fullLink = linkPath
          ? `https://us.soccerway.com${linkPath}`
          : null;

        if (homeTeam && awayTeam && fullLink) {
          data.push({
            matchday: currentMatchday,
            date: currentDate,
            homeTeam,
            awayTeam,
            score,
            matchLink: fullLink,
          });
        }
      }
    });

    return data;
  });

  // ... rest of your existing code for scraping match details
  const enrichedMatches = [];
  for (const match of matches) {
    try {
      console.log(`🔍 Scraping match: ${match.homeTeam} vs ${match.awayTeam}`);

      const matchPage = await browser.newPage();
      await matchPage.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
      );
      await matchPage.goto(match.matchLink, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });

      const matchDetails = await matchPage.evaluate(() => {
        try {
          const getGoals = () => {
            const goals = [];
            document.querySelectorAll(".scorer-info li").forEach((li) => {
              const name = li.querySelector("a")?.innerText.trim() || "";
              const minute =
                li.querySelector(".minute")?.innerText.trim() || "";
              const score = li.querySelector(".score")?.innerText.trim() || "";
              if (name && minute) goals.push({ name, minute, score });
            });
            return goals;
          };

          const getLineup = (containerClass) => {
            const players = [];
            const container = document.querySelector(containerClass);
            if (!container) return players;

            container.querySelectorAll("tbody tr").forEach((row) => {
              const name = row.querySelector(".player a")?.innerText.trim();
              if (!name) return;

              const bookingsCell = row.querySelector(".bookings");
              const events = [];

              if (bookingsCell) {
                bookingsCell.querySelectorAll("img").forEach((img) => {
                  const type = img.getAttribute("src").includes("YC")
                    ? "Yellow Card"
                    : img.getAttribute("src").includes("RC")
                    ? "Red Card"
                    : img.getAttribute("src").includes("G.png")
                    ? "Goal"
                    : img.getAttribute("src").includes("SO")
                    ? "Substituted"
                    : "Other";
                  const minuteText = img.nextSibling?.textContent.trim() || "";
                  events.push({ type, minute: minuteText });
                });
              }

              players.push({ name, events });
            });

            return players;
          };

          return {
            goals: getGoals(),
            homeLineup: getLineup(".container.left .playerstats.lineups"),
            awayLineup: getLineup(".container.right .playerstats.lineups"),
          };
        } catch (err) {
          return null;
        }
      });

      await matchPage.close();

      if (!matchDetails) {
        console.log(
          `⚠️ No data found for ${match.homeTeam} vs ${match.awayTeam}`
        );
        continue;
      }

      enrichedMatches.push({
        ...match,
        goals: matchDetails.goals,
        homeLineup: matchDetails.homeLineup,
        awayLineup: matchDetails.awayLineup,
      });

      console.log(`✅ Done: ${match.homeTeam} vs ${match.awayTeam}`);
    } catch (err) {
      console.log(
        `❌ Error processing match: ${match.homeTeam} vs ${match.awayTeam}`
      );
      console.error(err);
    }

    await delay(1500);
  }

  fs.writeFileSync(
    "prim_b_metro_2025_gw10_matches.json",
    JSON.stringify(enrichedMatches, null, 2)
  );

  console.log(`✅ ${enrichedMatches.length} matches saved!`);
  await browser.close();
})();
