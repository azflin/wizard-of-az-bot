import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });
import { Bot } from "grammy";
import {
  getPoolSlot0,
  getPositionFromChain,
  getPositionsFromDatabase,
  insertPositionIntoDatabase,
  updateDatabasePositionBurned,
  removePositionFromDatabase,
  getUserTrackedPools // Import the new function
} from "./api";

const bot = new Bot(process.env.BOT_KEY || "");

bot.command("start", (ctx) =>
  ctx.reply(
    "Welcome to KingdomBot! Currently we support tracking when your Nile, Nuri, Pharaoh, and Ra CL positions get out of (and back into) range. Made by AzFlin (https://twitter.com/AzFlin).",
  ),
);

bot.command("track", async (ctx) => {
  const userId = ctx.message?.from.id;
  if (!userId) {
    await ctx.reply("No user id.");
    return;
  }
  const username = ctx.message?.from.username;
  const args = ctx.match?.split(" ");
  if (!args || args.length < 2) {
    await ctx.reply("Must provide a position id and exchange name, ie /track 71255 nile.");
    return;
  }

  const positionId = Number(args[0]);
  const exchange = args[1];
  
  if (!(Number.isInteger(positionId) && positionId > 0)) {
    await ctx.reply("Must provide a valid position id.");
    return;
  }

  const onChainPosition = await getPositionFromChain(positionId, exchange);
  if (onChainPosition.status == "error") {
    await ctx.reply("Error calling getPosition().");
    return;
  }

  const databasePositions = await getPositionsFromDatabase(positionId, exchange);
  if (onChainPosition.status == "success") {
    const slot0 = await getPoolSlot0(
      onChainPosition.position!.token0,
      onChainPosition.position!.token1,
      onChainPosition.position!.fee,
      exchange
    );
    if (!slot0) {
      await ctx.reply("Error calling getPoolSlot0().");
      return;
    }
    const inRange =
      onChainPosition.position!.tickLower <= slot0[1] &&
      onChainPosition.position!.tickUpper >= slot0[1];
      
    if (databasePositions.length == 0) {
      await insertPositionIntoDatabase(
        positionId,
        userId.toString(),
        inRange,
        username!.toString(),
        exchange
      );
      await ctx.reply(
        `Now tracking ${exchange} ${onChainPosition.token0Symbol}/${onChainPosition.token1Symbol} CL position ${positionId}. It is currently ${inRange ? "in range." : "out of range."}`,
      );
    } else {
      const userAlreadyTracking = databasePositions.some((pos) => pos.tg_id === userId.toString());
      if (!userAlreadyTracking) {
        await insertPositionIntoDatabase(
          positionId,
          userId.toString(),
          inRange,
          username!.toString(),
          exchange
        );
        await ctx.reply(
          `Now tracking ${exchange} ${onChainPosition.token0Symbol}/${onChainPosition.token1Symbol} CL position ${positionId} for you. It is currently ${inRange ? "in range." : "out of range."}`,
        );
      } else {
        await ctx.reply("This position is already being tracked by you.");
      }
    }
  } else if (onChainPosition.status == "burned") {
    if (databasePositions.length > 0) {
      await updateDatabasePositionBurned(positionId, exchange);
      await ctx.reply("That position has been burned and the tracking information has been updated.");
    } else {
      await ctx.reply("That position has been burned.");
    }
  }
});

bot.command("untrack", async (ctx) => {
  const userId = ctx.message?.from.id;
  if (!userId) {
    await ctx.reply("No user id.");
    return;
  }
  const args = ctx.match?.split(" ");
  if (!args || args.length < 2) {
    await ctx.reply("Must provide a position id and exchange name, ie /untrack 71255 nile.");
    return;
  }

  const positionId = Number(args[0]);
  const exchange = args[1];

  if (!(Number.isInteger(positionId) && positionId > 0)) {
    await ctx.reply("Must provide a valid position id.");
    return;
  }

  const databasePositions = await getPositionsFromDatabase(positionId, exchange);
  const userTrackingPosition = databasePositions.some((pos) => pos.tg_id === userId.toString());

  if (userTrackingPosition) {
    await removePositionFromDatabase(positionId, userId.toString(), exchange);
    await ctx.reply(`Stopped tracking ${exchange} CL position ${positionId} for you.`);
  } else {
    await ctx.reply("You are not tracking this position.");
  }
});

bot.command("pools", async (ctx) => {
  const userId = ctx.message?.from.id;
  if (!userId) {
    await ctx.reply("No user id.");
    return;
  }

  const trackedPools = await getUserTrackedPools(userId.toString());

  if (trackedPools.length === 0) {
    await ctx.reply("You are not tracking any pools.");
  } else {
    let response = "You are tracking the following pools:\n";
    trackedPools.forEach((pool) => {
      response += `- Position ID: ${pool.position_id}, Exchange: ${pool.exchange}\n`;
    });
    await ctx.reply(response);
  }
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "This bot will send you a message when your tracked CL positions move out of range. Type /track <position-id> <exchange-name> to track a position. Type /untrack <position-id> <exchange-name> to stop tracking a position. Type /pools to list all your tracked pools. Contact https://twitter.com/AzFlin for any questions!",
  );
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    `Error while handling update ${ctx.update.update_id}: ${new Date().toISOString()} ${ctx.from?.username}`,
  );
  const e = err.error;
  console.error("Error:", e);
  ctx.reply(`Error: ${e}`);
});

bot.start();
