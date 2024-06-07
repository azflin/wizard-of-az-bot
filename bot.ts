import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });
import { Bot } from "grammy";
import {
  getPoolSlot0,
  getPositionFromChain,
  getPositionsFromDatabase,
  insertPositionIntoDatabase,
} from "./api";

const bot = new Bot(process.env.BOT_KEY || "");

bot.command("start", (ctx) => ctx.reply("Welcome! Up and running."));

bot.command("track", async (ctx) => {
  const userId = ctx.message?.from.id;
  if (!userId) {
    await ctx.reply("No user id.");
    return;
  }
  const args = ctx.match;
  const positionId = Number(args);
  if (!args || !(Number.isInteger(positionId) && positionId > 0)) {
    await ctx.reply("Must provide a Nile position id.");
    return;
  }

  const onChainPosition = await getPositionFromChain(positionId);
  if (onChainPosition.status == "error") {
    await ctx.reply("Error calling getPosition().");
    return;
  }

  const databasePositions = await getPositionsFromDatabase(positionId);
  if (onChainPosition.status == "success") {
    if (databasePositions.length == 0) {
      const slot0 = await getPoolSlot0(
        onChainPosition.position!.token0,
        onChainPosition.position!.token1,
        onChainPosition.position!.fee,
      );
      if (!slot0) {
        await ctx.reply("Error calling getPoolSlot0().");
        return;
      }
      const inRange =
        onChainPosition.position!.tickLower <= slot0[1] &&
        onChainPosition.position!.tickUpper >= slot0[1];
      await insertPositionIntoDatabase(positionId, userId.toString(), inRange);
      await ctx.reply(
        `Now tracking position ${positionId}. Tick Lower: ${onChainPosition.position!.tickLower}, Tick Upper: ${onChainPosition.position!.tickUpper}, Current Tick: ${slot0[1]}`,
      );
    } else {
      // TODO: Check if row contains TG user id. If it doesn't, then insert row into `positions`.
      await ctx.reply("This position is already being tracked.");
    }
  } else if (onChainPosition.status == "burned") {
    // TODO: Update relevant position rows if required
    await ctx.reply("That position has been burned.");
  }
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}: ${(new Date()).toISOString()} ${ctx.from?.username}`);
  const e = err.error;
  console.error("Error:", e);
  ctx.reply(`Error: ${e}`)
})

bot.start();
