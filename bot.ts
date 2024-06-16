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
  removeAllPositionsFromDatabase,
  getUserTrackedPools
} from "./api";

const bot = new Bot(process.env.BOT_KEY || "");

bot.command("start", (ctx) =>
  ctx.reply(
    "Welcome to KingdomBot!\n" +  
    "Currently we support tracking when your Ramses, Nile, Nuri, Pharaoh, Cleo, and Ra CL positions get out of (and back into) range.\n\n" +
    "Made by AzFlin (https://twitter.com/AzFlin).\n\n" +
    "Type /commands to see the list of available commands.",
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
  if (args.length === 1 && args[0] === "all") {
    await removeAllPositionsFromDatabase(userId.toString());
    await ctx.reply("Stopped tracking all positions for you.");
    return;
  }
  if (args.length < 2) {
    await ctx.reply("Must provide a position id and exchange name, ie /untrack 71255 nile or use /untrack all to stop tracking all positions.");
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
    const onChainPosition = await getPositionFromChain(positionId, exchange);
    if (onChainPosition.status === "success") {
      await removePositionFromDatabase(positionId, userId.toString(), exchange);
      await ctx.reply(`Stopped tracking ${exchange} ${onChainPosition.token0Symbol}/${onChainPosition.token1Symbol} CL position ${positionId} for you.`);
    } else {
      await ctx.reply("Error fetching position data. Please try again.");
    }
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
    for (const pool of trackedPools) {
      const onChainPosition = await getPositionFromChain(pool.position_id, pool.exchange);
      if (onChainPosition.status === "success") {
        const inRangeText = pool.in_range ? "In Range" : "Out of Range";
        response += `- ${onChainPosition.token0Symbol}/${onChainPosition.token1Symbol} on ${pool.exchange} (#${pool.position_id}), ${inRangeText}\n`;
      } else {
        response += `- ${pool.exchange} (#${pool.position_id}), Error fetching token symbols\n`;
      }
    }
    await ctx.reply(response);
  }
});

bot.command("commands", async (ctx) => {
  await ctx.reply(
    "Available commands:\n" +
    "/start - Welcome message\n" +
    "/track <position-id> <exchange-name> - Track a position\n" +
    "/untrack <position-id> <exchange-name> - Stop tracking a position\n" +
    "/untrack all - Stop tracking all positions\n" +
    "/pools - List all your tracked pools\n" +
    "/help - Get help about the bot\n" +
    "/commands - List all available commands\n\n" + 
    "exchanges: ramses, nile, nuri, ra, cleo, pharaoh"
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "This bot will send you a message when your tracked CL positions move out of range.\n\n" + 
    "Type /commands for the command list.\n\n" + 
    "Contact https://twitter.com/AzFlin for any questions!",
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
