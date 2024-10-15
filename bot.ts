import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });
import { Bot } from "grammy";
import {
  getPoolSlot0AndLiquidity,
  getPositionFromChain,
  getPositionsFromDatabase,
  insertPositionIntoDatabase,
  updateDatabasePositionBurned,
  removePositionFromDatabase,
  removeAllPositionsFromDatabase,
  getUserTrackedPositions,
  getKingdomPositionRewards,
  KINGDOM_REWARD_TOKENS,
  getFees,
  getAerodromePositionRewards,
  getDexscreenerPrices,
} from "./api";
import { Pool, Position } from "ramsesexchange-v3-sdk";
import JSBI from "jsbi";
import { Token } from "@uniswap/sdk-core";
import { ethers } from "ethers";
import { DatabasePosition } from "./api";
import { DEXSCREENER_CHAIN_IDS, getUrl, KINGDOM_EXCHANGES } from "./helpers";
import { VELO_EXCHANGES } from "./helpers";

const bot = new Bot(process.env.BOT_KEY || "");
const API_URLS: Record<string, string> = {
  nile: "https://nile-api-production.up.railway.app/mixed-pairs",
  nuri: "https://nuri-api-production.up.railway.app/mixed-pairs",
  ra: "https://ra-api-production.up.railway.app/mixed-pairs",
  cleo: "https://cleopatra-api-production.up.railway.app/mixed-pairs",
  pharaoh: "https://pharaoh-api-production.up.railway.app/mixed-pairs",
  ramses: "https://api-v2-production-a6e6.up.railway.app/mixed-pairs",
};
// Include all Kingdom Exchanges except for 'ra', which is tokenless at the moment
const KINGDOM_EXCHANGES_WITH_API = [
  "nile",
  "nuri",
  "ramses",
  "cleo",
  "pharaoh",
];
const VELO_REWARD_TOKENS: Record<string, any> = {
  aerodrome: {
    reward_token: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    pair: "0x6cDcb1C4A4D1C3C6d054b27AC5B77e89eAFb971d",
  },
  velodrome: {
    reward_token: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db",
    pair: "0x8134A2fDC127549480865fB8E5A9E8A8a95a54c5",
  },
};

bot.command("start", (ctx) =>
  ctx.reply(
    "<b>Welcome to the Wizard of Az Bot 🪄!</b> \n" +
      "Track when your CL positions (currently supporting Ramses, Nile, Nuri, Uniswap (mainnet), Cleopatra, Aerodrome, Velodrome, Ra, Pharaoh) CL positions get out of range.\n\n" +
      "Follow us on twitter: https://x.com/Wizard_of_Az_ and join our discussion/support TG: https://t.me/WizardOfAz\n\n" +
      "Type /commands to see the list of available commands.",
    { parse_mode: "HTML" },
  ),
);

bot.command("track", async (ctx) => {
  const userId = ctx.message?.from.id;
  if (!userId) {
    await ctx.reply("No user id.");
    return;
  }
  const username = ctx.message?.from.username;
  if (!username) {
    await ctx.reply("You must set a telegram username to use this bot.");
    return;
  }
  const args = ctx.match?.split(" ");
  if (!args || args.length < 2) {
    await ctx.reply(
      "Must provide a position id and exchange name, ie /track 71255 nile.",
    );
    return;
  }

  const positionId = Number(args[0]);
  const exchange = args[1];

  if (!(Number.isInteger(positionId) && positionId > 0)) {
    await ctx.reply("Must provide a valid position id.");
    return;
  }

  const onChainPosition = await getPositionFromChain(
    positionId,
    exchange,
    true,
  );
  if (onChainPosition.status == "error") {
    await ctx.reply(
      "Error calling getPosition() - you probably are calling the track command incorrectly.",
    );
    throw new Error("Something went wrong with the track command!");
  }

  const databasePositions = await getPositionsFromDatabase(
    positionId,
    exchange,
  );
  if (databasePositions.length > 0) {
    const userAlreadyTracking = databasePositions.some(
      (pos) => pos.tg_id === userId.toString(),
    );
    if (userAlreadyTracking) {
      await ctx.reply("This position is already being tracked by you.");
      return;
    }
  }
  if (onChainPosition.status == "success") {
    const poolInfo = await getPoolSlot0AndLiquidity(
      onChainPosition.position!.token0,
      onChainPosition.position!.token1,
      onChainPosition.position!.fee,
      exchange,
      VELO_EXCHANGES.includes(exchange) ? onChainPosition.position![4] : null,
    );
    if (!poolInfo) {
      await ctx.reply("Error calling getPoolSlot0().");
      return;
    }
    const { slot0, liquidity, poolAddress } = poolInfo;
    const inRange =
      onChainPosition.position!.tickLower <= slot0[1] &&
      onChainPosition.position!.tickUpper > slot0[1];
    await insertPositionIntoDatabase(
      positionId,
      userId.toString(),
      inRange,
      username.toString(),
      exchange,
      onChainPosition.position!.token0,
      onChainPosition.position!.token1,
      onChainPosition.position!.fee,
      onChainPosition.token0Symbol!,
      onChainPosition.token1Symbol!,
      onChainPosition.position!.tickLower,
      onChainPosition.position!.tickUpper,
      onChainPosition.position!.liquidity,
      onChainPosition.token0Decimals!,
      onChainPosition.token1Decimals!,
      onChainPosition.owner!,
      poolInfo.tickSpacing,
      poolAddress,
    );
    await ctx.reply(
      `Now tracking ${exchange} ${onChainPosition.token0Symbol}/${onChainPosition.token1Symbol} CL position ${positionId}. It is currently ${inRange ? "in range." : "out of range."}`,
    );
    console.log(
      `Tracking ${exchange} ${onChainPosition.token0Symbol}/${onChainPosition.token1Symbol} CL position ${positionId} for ${username} on ${new Date().toLocaleString()}`,
    );
  } else if (onChainPosition.status == "burned") {
    if (databasePositions.length > 0) {
      await updateDatabasePositionBurned(positionId, exchange);
      await ctx.reply(
        "That position has been burned and the tracking information has been updated.",
      );
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
    await ctx.reply(
      "Must provide a position id and exchange name, ie `/untrack 71255 nile` or use `/untrack all` to stop tracking all positions.",
    );
    return;
  }

  const positionId = Number(args[0]);
  const exchange = args[1];

  if (!(Number.isInteger(positionId) && positionId > 0)) {
    await ctx.reply("Must provide a valid position id.");
    return;
  }

  const databasePositions = await getPositionsFromDatabase(
    positionId,
    exchange,
  );
  const userTrackingPosition = databasePositions.some(
    (pos) => pos.tg_id === userId.toString(),
  );

  if (userTrackingPosition) {
    const onChainPosition = await getPositionFromChain(positionId, exchange);
    if (onChainPosition.status === "success") {
      await removePositionFromDatabase(positionId, userId.toString(), exchange);
      await ctx.reply(
        `Stopped tracking ${exchange} ${onChainPosition.token0Symbol}/${onChainPosition.token1Symbol} CL position ${positionId} for you.`,
      );
    } else {
      await ctx.reply("Error fetching position data. Please try again.");
    }
  } else {
    await ctx.reply("You are not tracking this position.");
  }
});

// Given a user's database position, get its text response when calling "/pools". Gets the mint amounts and
// reward amounts (kingdom DEXs only) and fee amounts (kingdom DEXs only).
const getTextResponseFromUserPosition = async (
  pool: DatabasePosition,
  kingdomApiResults: any,
  dexscreenerPrices: any,
) => {
  const poolInfo = await getPoolSlot0AndLiquidity(
    pool.token0,
    pool.token1,
    pool.fee,
    pool.exchange,
    pool.tick_spacing,
  );
  const inRangeText = pool.in_range ? "In Range ✅" : "Out of Range 🚫";

  const poolLiquidity = poolInfo!.liquidity.toString();
  const currentTick = Number(poolInfo!.slot0[1]);
  const sqrtRatiox96 = poolInfo!.slot0[0].toString();

  // Get the mintAmounts
  // I believe chainId can be anything when instantiating Tokens
  const token0 = new Token(1, pool.token0, pool.token0decimals);
  const token1 = new Token(1, pool.token1, pool.token1decimals);
  const position = new Position({
    pool: new Pool(
      token0,
      token1,
      pool.fee,
      JSBI.BigInt(sqrtRatiox96),
      poolLiquidity,
      currentTick,
      undefined,
      // This used to be pool.tick_spacing, but the ramses sdk default fee -> tickSpacings were not lining up.
      // Setting this to 1 permanently is ok as tickSpacing is only used for invariant check
      1,
    ),
    liquidity: JSBI.BigInt(pool.positionliquidity),
    tickLower: pool.ticklower,
    tickUpper: pool.tickupper,
  });
  const { amount0, amount1 } = position.mintAmounts;

  const apiResult = kingdomApiResults.find(
    (x: any) => x.exchange == pool.exchange,
  );

  let rewardsString;
  let response = "";
  response += `<b>${pool.exchange} (#${pool.position_id})</b>: ${pool.token0symbol} (${Number(ethers.formatUnits(amount0.toString(), pool.token0decimals)).toFixed(2)}) + ${pool.token1symbol} (${Number(ethers.formatUnits(amount1.toString(), pool.token1decimals)).toFixed(2)}) from ${pool.owner ? pool.owner.substring(0, 6) + "..." + pool.owner.slice(-4) : "unknown"}\n`;
  const url = getUrl(pool);
  if (url) {
    response += `    • ${getUrl(pool)}\n`;
  }

  const rangeWidth = (pool.tickupper - pool.ticklower) / 100;
  let pricePercentText;
  if (pool.in_range) {
    pricePercentText = `${(currentTick - pool.ticklower) / 100}% higher than lower tick.`;
  } else {
    if (currentTick > pool.tickupper) {
      pricePercentText = `${(currentTick - pool.tickupper) / 100}% higher than your range.`;
    } else {
      pricePercentText = `${(pool.ticklower - currentTick) / 100}% lower than your range.`;
    }
  }
  response += `    • ${rangeWidth}% width and <b>${inRangeText}</b>, ${pricePercentText}\n`;

  // Get TVL & rewards for Kingdom exchanges only (except ra)
  if (KINGDOM_EXCHANGES.includes(pool.exchange)) {
    // If there is NO apiResult, this means the exchange is pre-token. Currently
    // only "ra"
    if (apiResult) {
      const tokens = apiResult.data.tokens;
      const token0FromApi = tokens.find(
        (x: { id: string }) => x.id.toLowerCase() == pool.token0.toLowerCase(),
      );
      const token1FromApi = tokens.find(
        (x: { id: string }) => x.id.toLowerCase() == pool.token1.toLowerCase(),
      );
      const totalValue = Math.round(
        Number(ethers.formatUnits(amount0.toString(), pool.token0decimals)) *
          token0FromApi.price +
          Number(ethers.formatUnits(amount1.toString(), pool.token1decimals)) *
            token1FromApi.price,
      );

      let rewardsValue = 0;
      for (const rewardToken of KINGDOM_REWARD_TOKENS[pool.exchange]) {
        let numRewards = await getKingdomPositionRewards(
          poolInfo!.poolAddress,
          pool.exchange,
          pool.position_id,
          rewardToken,
        );
        numRewards = Number(ethers.formatEther(numRewards));
        const rewardTokenFromApi = tokens.find(
          (x: any) => x.id.toLowerCase() == rewardToken.toLowerCase(),
        );
        rewardsValue += numRewards * rewardTokenFromApi.price;
      }
      rewardsString = `$${rewardsValue.toFixed(2)}`;

      // Get fees
      let feeValue;
      if (pool.owner) {
        const fees = await getFees(pool.position_id, pool.exchange, pool.owner);
        feeValue =
          Number(ethers.formatUnits(fees[0], pool.token0decimals)) *
            token0FromApi.price +
          Number(ethers.formatUnits(fees[1], pool.token1decimals)) *
            token1FromApi.price;
      }

      response += `    • <b>TVL :</b>$${totalValue.toLocaleString()}${rewardsString ? ` / <b>Rewards</b>: ${rewardsString}` : ""} / <b>Fees:</b> $${feeValue ? feeValue.toFixed(2) : "N/A"}\n\n`;
    } else {
      response += "\n";
    }
  } else if (VELO_EXCHANGES.includes(pool.exchange)) {
    const pair = dexscreenerPrices.find((x: any) =>
      [pool.token0.toLowerCase(), pool.token1.toLowerCase()].includes(
        x.baseToken.address.toLowerCase(),
      ),
    );
    let token0PriceUsd;
    let token1PriceUsd;
    if (pool.token0.toLowerCase() == pair.baseToken.address.toLowerCase()) {
      token0PriceUsd = pair.priceUsd;
      token1PriceUsd = pair.priceUsd / pair.priceNative;
    } else {
      token1PriceUsd = pair.priceUsd;
      token0PriceUsd = pair.priceUsd / pair.priceNative;
    }
    const totalValue = Math.round(
      Number(ethers.formatUnits(amount0.toString(), pool.token0decimals)) *
        token0PriceUsd +
        Number(ethers.formatUnits(amount1.toString(), pool.token1decimals)) *
          token1PriceUsd,
    );

    // Calculate reward tokens value
    let rewardsValue;
    if (pool.owner) {
      let numRewards = await getAerodromePositionRewards(
        poolInfo!.poolAddress,
        pool.exchange,
        pool.position_id,
        pool.owner,
      );
      const rewardPair = dexscreenerPrices.find(
        (x: any) =>
          x.baseToken.address.toLowerCase() ==
          VELO_REWARD_TOKENS[pool.exchange].reward_token.toLowerCase(),
      );
      rewardsValue = (
        rewardPair.priceUsd *
        Number(ethers.formatUnits(numRewards.toString(), 18))
      ).toFixed(2);
    }

    response += `    • <b>TVL :</b>$${totalValue.toLocaleString()} / <b>Rewards</b>: $${rewardsValue ? rewardsValue : " N/A"}\n\n`;
  } else {
    response += "\n";
  }

  return response;
};

bot.command("pools", async (ctx) => {
  const userId = ctx.message?.from.id;
  if (!userId) {
    await ctx.reply("No user id.");
    return;
  }

  const userPositions = await getUserTrackedPositions(userId.toString());

  if (userPositions.length === 0) {
    await ctx.reply("You are not tracking any pools.");
  } else {
    let response = "";

    // At the moment, we only make API calls for kingdom exchanges
    let uniqueKingdomExchanges = [
      ...new Set(userPositions.map((pool) => pool.exchange)),
    ];
    uniqueKingdomExchanges = uniqueKingdomExchanges.filter((x) =>
      KINGDOM_EXCHANGES_WITH_API.includes(x),
    );
    const kingdomUrlsToFetch = [];
    for (const exchange of uniqueKingdomExchanges) {
      const apiUrl = API_URLS[exchange];
      kingdomUrlsToFetch.push({ apiUrl, exchange });
    }
    const fetchPromises = kingdomUrlsToFetch.map(async (url) => {
      const res = await fetch(url.apiUrl);
      const data = await res.json();
      return { exchange: url.exchange, data };
    });
    const kingdomApiResults = await Promise.all(fetchPromises);

    // Get list of all tokens from aerodrome + velodrome and get their prices
    // from DEXScreener
    const aeroPositions = userPositions.filter((x) =>
      VELO_EXCHANGES.includes(x.exchange),
    );
    const pairsWithChainId = new Set<[string, string]>();
    for (const aeroPosition of aeroPositions) {
      pairsWithChainId.add([
        DEXSCREENER_CHAIN_IDS[aeroPosition.exchange],
        aeroPosition.pool_address,
      ]);
      // Must include the AERO + VELO pools for rewards
      if (aeroPosition.exchange == "aerodrome") {
        pairsWithChainId.add(["base", VELO_REWARD_TOKENS["aerodrome"]["pair"]]);
      }
      if (aeroPosition.exchange == "velodrome") {
        pairsWithChainId.add([
          "optimism",
          VELO_REWARD_TOKENS["velodrome"]["pair"],
        ]);
      }
    }
    const dexscreenerPrices = await getDexscreenerPrices(
      Array.from(pairsWithChainId),
    );

    let responses = await Promise.all(
      userPositions.map((userPosition) =>
        getTextResponseFromUserPosition(
          userPosition,
          kingdomApiResults,
          dexscreenerPrices,
        ),
      ),
    );
    response = responses.join("");
    const username = ctx.message?.from.username;
    console.log(
      `${username} just called /pools on ${new Date().toLocaleString()}`,
    );
    await ctx.reply(response, {
      disable_web_page_preview: true,
      parse_mode: "HTML",
    } as any);
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
      "exchanges: ramses, nile, nuri, aerodrome, velodrome, uniswap, ra, cleo, pharaoh",
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "This bot will send you a message when your tracked CL positions move out of range.\n\n" +
      "Type /commands for the command list.\n\n" +
      "Join our support channel https://t.me/WizardOfAz for any questions!",
  );
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    `Error while handling update ${ctx.update.update_id}: ${new Date().toISOString()} ${ctx.from?.username}. The message was: "${ctx.message?.text}"`,
  );
  const e = err.error;
  console.error("Error:", e);
  ctx.reply(`Error: ${e}`);
});

bot.start();
