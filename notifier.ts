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
      const startDate = new Date();
      console.log(`Running loop at ${startDate}`);
      const positions = await getAllPositionsFromDatabase();
      for (const databasePosition of positions) {
        const onchainPosition = await getPositionFromChain(
          databasePosition.position_id,
          databasePosition.exchange
        );
        // if there is a position, then get the current tick. If current tick has moved in or out of position's range,
        // then update the `inRange` column of `positions` table for that position
        if (onchainPosition.position) {
          const slot0 = await getPoolSlot0(
            onchainPosition.position!.token0,
            onchainPosition.position!.token1,
            onchainPosition.position!.fee,
            databasePosition.exchange
          );
          if (!slot0) {
            console.log(`Error getting slot0 for ${databasePosition.username}, ${databasePosition.exchange} #${databasePosition.position_id}. Skipping.`);
            continue;
          }
          const currentTick = slot0[1];
          const inRange =
            onchainPosition.position.tickLower <= currentTick &&
            currentTick < onchainPosition.position.tickUpper;
          if (!inRange) {
            if (databasePosition.in_range) {
              await updateDatabasePositionInRange(
                databasePosition.position_id,
                false,
                databasePosition.exchange
              );
              await bot.api.sendMessage(
                databasePosition.tg_id,
                `${databasePosition.exchange} CL position ${onchainPosition.token0Symbol}/${onchainPosition.token1Symbol} #${databasePosition.position_id} has moved out of range.`,
              );
              console.log(`Sent message for ${databasePosition.username} for ${databasePosition.position_id}`);
            }
          } else {
            if (!databasePosition.in_range) {
              await updateDatabasePositionInRange(
                databasePosition.position_id,
                true,
                databasePosition.exchange
              );
              await bot.api.sendMessage(
                databasePosition.tg_id,
                `${databasePosition.exchange} CL position ${onchainPosition.token0Symbol}/${onchainPosition.token1Symbol} #${databasePosition.position_id} has moved into range.`,
              );
              console.log(`Sent message for ${databasePosition.username} for ${databasePosition.position_id}`);
            }
          }
        } else {
          if (onchainPosition.status == "burned") {
            await updateDatabasePositionBurned(databasePosition.position_id, databasePosition.exchange);
            console.log(
              `Position ${databasePosition.position_id} on ${databasePosition.exchange} from ${databasePosition.username} has been burned.`,
            );
          } else if (onchainPosition.status == "error") {
            console.log(`Position ${databasePosition.position_id} on ${databasePosition.exchange} from ${databasePosition.username} errored when calling getPositionFromChain().`)
          }
        }
      }
      const endDate = new Date();
      console.log(`Finished processing ${positions.length} positions in ${(endDate.getTime() - startDate.getTime())/1000} seconds!\n`)
      await new Promise((r) => setTimeout(r, INTERVAL));
    } catch (error) {
      console.error("Error occurred and prematurely exited:", error, '\n');
      await new Promise((r) => setTimeout(r, 100000));
    }
  }
};

(async function () {
  await main();
})();
