import { db } from "./database.js";
import dotenv from "dotenv";
import { trainModel } from "./trainModel.js";

dotenv.config();

// Run training daily
async function scheduleTraining() {
  // First training
  await trainModel();

  // Schedule subsequent trainings (e.g., daily)
  setInterval(async () => {
    console.log("Running scheduled model update...");
    await trainModel();
  }, 24 * 60 * 60 * 1000); // 24 hours
}

scheduleTraining().catch(console.error);
