import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });
import {
  getPositionFromChain,
  getAllPositionsFromDatabase,
  getPoolSlot0,
  updateDatabasePositionInRange,
  updateDatabasePositionBurned,
} from "./api";
import { Bot } from "grammy";

// every 2 minutes, run
const INTERVAL = 120000;

const main = async () => {
  const bot = new Bot(process.env.BOT_KEY || "");
  while (true) {
    try {
      console.log(`Running loop at ${new Date()}`);
      const positions = await getAllPositionsFromDatabase();
      for (const databasePosition of positions) {
        const onchainPosition = await getPositionFromChain(
          databasePosition.position_id,
        );
        // if there is a position, then get the current tick. If current tick has moved in or out of position's range,
        // then update the `inRange` column of `positions` table for that position
        if (onchainPosition.position) {
          const slot0 = await getPoolSlot0(
            onchainPosition.position!.token0,
            onchainPosition.position!.token1,
            onchainPosition.position!.fee,
          );
          const currentTick = slot0![1];
          const inRange =
            onchainPosition.position.tickLower <= currentTick &&
            currentTick <= onchainPosition.position.tickUpper;
          if (!inRange) {
            // Only update database and send message if position was out of range and then moves back into range
            if (databasePosition.in_range) {
              await updateDatabasePositionInRange(
                databasePosition.position_id,
                false,
              );
              await bot.api.sendMessage(
                databasePosition.tg_id,
                `Nile CL position ${onchainPosition.token0Symbol}/${onchainPosition.token1Symbol} #${databasePosition.position_id} (https://www.nile.build/liquidity/v2/${databasePosition.position_id}) has moved out of range.`,
              );
              console.log(`Sent message for ${databasePosition.tg_id}`);
            }
          } else {
            if (!databasePosition.in_range) {
              await updateDatabasePositionInRange(
                databasePosition.position_id,
                true,
              );
              await bot.api.sendMessage(
                databasePosition.tg_id,
                `Nile CL position ${onchainPosition.token0Symbol}/${onchainPosition.token1Symbol} #${databasePosition.position_id} (https://www.nile.build/liquidity/v2/${databasePosition.position_id}) has moved into range.`,
              );
              console.log(`Sent message for ${databasePosition.tg_id}`);
            }
          }
        } else {
          if (onchainPosition.status == "burned") {
            await updateDatabasePositionBurned(databasePosition.position_id);
            console.log(
              `Position ${databasePosition.position_id} has been burned.`,
            );
          }
        }
      }
      await new Promise((r) => setTimeout(r, INTERVAL));
    } catch (error) {
      console.error("Error occurred in the loop:", error);
      await new Promise((r) => setTimeout(r, 100000));
    }
  }
};

(async function () {
  await main();
})();
