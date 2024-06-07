import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });
import {
  getPositionFromChain,
  getAllPositionsFromDatabase,
  getPoolSlot0,
  updateDatabasePositionInRange,
} from "./api";
import { Bot } from "grammy";

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
            if (databasePosition.in_range) {
              await updateDatabasePositionInRange(
                databasePosition.position_id,
                false,
              );
            }
            await bot.api.sendMessage(
              databasePosition.tg_id,
              `Position ID: ${databasePosition.position_id} has moved out of range. Current tick is ${currentTick}, while your range is ${onchainPosition.position.tickLower} -> ${onchainPosition.position.tickUpper}`,
            );
            console.log(`Sent message for ${databasePosition.tg_id}`);
          } else {
            if (!databasePosition.in_range) {
              await updateDatabasePositionInRange(
                databasePosition.position_id,
                true,
              );
              await bot.api.sendMessage(
                databasePosition.tg_id,
                `Position ID: ${databasePosition.position_id} has moved into range. Current tick is ${currentTick}, while your range is ${onchainPosition.position.tickLower} -> ${onchainPosition.position.tickUpper}`,
              );
              console.log(`Sent message for ${databasePosition.tg_id}`);
            }
          }
        }
      }
      await new Promise((r) => setTimeout(r, 300000));
    } catch (error) {
      console.error("Error occurred in the loop:", error);
      await new Promise((r) => setTimeout(r, 100000));
    }
  }
};

(async function () {
  await main();
})();
