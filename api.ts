import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });
import { ethers, JsonRpcProvider } from "ethers";
import NonFungiblePositionManager from "./abi/NonFungiblePositionManager.json";
import ClPool from "./abi/ClPool.json";
import CLPoolAerodrome from "./abi/CLPoolAerodrome.json";
import ERC20 from "./abi/ERC20.json";
import ERC721 from "./abi/ERC721.json";
import GaugeV2 from "./abi/GaugeV2.json";
import ClGaugeFactory from "./abi/ClGaugeFactory.json";
import { computeAerodromeClPoolAddress } from "./helpers";
import { Pool as RamsesPool } from "ramsesexchange-v3-sdk";
import { Token } from "@uniswap/sdk-core";
import { Pool } from "@uniswap/v3-sdk";
import { Pool as PgPool } from "pg";
import { VELO_EXCHANGES, KINGDOM_EXCHANGES } from "./helpers";
import {
  RPC_URLS,
  NFPM_ADDRESSES,
  CHAIN_IDS,
  POOL_INIT_CODE_HASHES,
  FACTORIES,
} from "./config";

let numRpcCalls = 0;

class LoggingJsonRpcProvider extends JsonRpcProvider {
  constructor(url: string, network: any, options: any) {
    super(url, network, options);
  }

  async send(method: string, params: any) {
    // Log the method and parameters
    // console.log(`RPC Call: ${method}`, params);
    numRpcCalls += 1;
    // Call the original send method
    return super.send(method, params);
  }
}

export const PROVIDERS: Record<string, JsonRpcProvider> = {
  nile: new LoggingJsonRpcProvider(RPC_URLS["nile"], null, {
    staticNetwork: ethers.Network.from(59144),
  }),
  pharaoh: new LoggingJsonRpcProvider(RPC_URLS["pharaoh"], null, {
    staticNetwork: ethers.Network.from(43114),
  }),
  nuri: new LoggingJsonRpcProvider(RPC_URLS["nuri"], null, {
    staticNetwork: ethers.Network.from(534352),
  }),
  ra: new LoggingJsonRpcProvider(RPC_URLS["ra"], null, {
    staticNetwork: ethers.Network.from(252),
  }),
  cleo: new LoggingJsonRpcProvider(RPC_URLS["cleo"], null, {
    staticNetwork: ethers.Network.from(5000),
  }),
  ramses: new LoggingJsonRpcProvider(RPC_URLS["ramses"], null, {
    staticNetwork: ethers.Network.from(42161),
  }),
  aerodrome: new LoggingJsonRpcProvider(RPC_URLS["aerodrome"], null, {
    staticNetwork: ethers.Network.from(8453),
  }),
  velodrome: new LoggingJsonRpcProvider(RPC_URLS["velodrome"], null, {
    staticNetwork: ethers.Network.from(10),
  }),
  uniswap: new LoggingJsonRpcProvider(RPC_URLS["uniswap"], null, {
    staticNetwork: ethers.Network.from(1),
  }),
};

const nfpmContract = (exchange: string) =>
  new ethers.Contract(
    NFPM_ADDRESSES[exchange],
    NonFungiblePositionManager,
    PROVIDERS[exchange],
  );

const pool = new PgPool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT) : 25060,
  // if connecting to local database, do NOT enable SSL. Otherwise, do enable SSL.
  ssl: process.env.LOCAL_DB ? undefined : { rejectUnauthorized: false },
  max: 10, // max number of clients in the pool
});
// GAUGE_FACTORIES is used to query rewards for Kingdom Dexs
const GAUGE_FACTORIES: Record<string, string> = {
  nile: "0xAAA2D4987EEd427Ba5E2c933EeFCD75C84b446B7",
  nuri: "0xAAA2D4987EEd427Ba5E2c933EeFCD75C84b446B7",
  cleo: "0xAAA11500dDdB2B67a90d1a154dfB7eaBB518EAE6",
  ramses: "0xAA2fBD0C9393964aF7c66C1513e44A8CAAae4FDA",
  pharaoh: "0xAAA2D4987EEd427Ba5E2c933EeFCD75C84b446B7",
};
// Kingdom DEXs may have multiple reward tokens (ie ARB+RAM for Ramses)
export const KINGDOM_REWARD_TOKENS: Record<string, Array<string>> = {
  nile: ["0xAAAac83751090C6ea42379626435f805DDF54DC8"],
  nuri: ["0xaaae8378809bb8815c08d3c59eb0c7d1529ad769"],
  cleo: ["0xc1e0c8c30f251a07a894609616580ad2ceb547f2"],
  // RAM, ARB
  ramses: [
    "0xaaa6c1e32c55a7bfa8066a6fae9b42650f262418",
    "0x912CE59144191C1204E64559FE8253a0e49E6548",
  ],
  // PHAR, sAVAX, ggAVAX
  pharaoh: [
    "0xAAAB9D12A30504559b0C5a9A5977fEE4A6081c6b",
    "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
    "0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3",
  ],
};
export const VELO_NFT_ADDRESSES: Record<string, string> = {
  aerodrome: "0x827922686190790b37229fd06084350e74485b72",
  velodrome: "0x416b433906b1b72fa758e166e239c43d68dc6f29",
};
export type DatabasePosition = {
  position_id: number;
  in_range: boolean;
  exchange: string;
  token0: string;
  token1: string;
  token0symbol: string;
  token1symbol: string;
  fee: number;
  ticklower: number;
  tickupper: number;
  positionliquidity: string;
  token0decimals: number;
  token1decimals: number;
  owner: string;
  tick_spacing: number;
  pool_address: string;
};

// an in memory mapping of token addresses -> {symbol: string, decimals: number}
const tokenSymbols: Record<string, { symbol: string; decimals: number }> = {};

export const getRpcCalls = () => {
  return numRpcCalls;
};

/**
 * get position data using NonFungiblePositionManager.positions() function
 * If it's an aerodrome position, it will have position[4], which is tickSpacing
 * @param positionId
 * @param exchange
 * @param getOwner: If true, then also get the owner of the NFT.
 */
export const getPositionFromChain = async (
  positionId: number,
  exchange: string,
  getOwner: boolean = false,
): Promise<{
  status: string;
  position?: {
    tickLower: number;
    tickUpper: number;
    token0: string;
    token1: string;
    fee: number;
    liquidity: string;
    4?: number; // this is tickSpacing IF exchange == 'aerodrome'
  };
  owner?: string;
  token0Symbol?: string;
  token1Symbol?: string;
  token0Decimals?: number;
  token1Decimals?: number;
}> => {
  let position;
  let token0Symbol;
  let token1Symbol;
  let token0Decimals;
  let token1Decimals;
  let owner;
  try {
    const nfpm = nfpmContract(exchange);
    position = await nfpm.positions(positionId);

    if (getOwner) {
      // Velo exchange NFTs are staked in a gauge, so we must find their
      // owners in a special way
      if (VELO_EXCHANGES.includes(exchange)) {
        owner = await findOwnerOfVeloNft(exchange, positionId);
      } else {
        owner = await nfpm.ownerOf(positionId);
      }
    }
    // TODO: We should account for token addresses PER chain
    if (!(position.token0 in tokenSymbols)) {
      const token0Contract = new ethers.Contract(
        position.token0,
        ERC20,
        PROVIDERS[exchange],
      );
      token0Symbol = await token0Contract.symbol();
      token0Decimals = await token0Contract.decimals();
      tokenSymbols[position.token0] = {
        symbol: token0Symbol,
        decimals: token0Decimals,
      };
      console.log(`Stored symbol ${token0Symbol} on ${exchange}`);
    }
    if (!(position.token1 in tokenSymbols)) {
      const token1Contract = new ethers.Contract(
        position.token1,
        ERC20,
        PROVIDERS[exchange],
      );
      token1Symbol = await token1Contract.symbol();
      token1Decimals = await token1Contract.decimals();
      tokenSymbols[position.token1] = {
        symbol: token1Symbol,
        decimals: token1Decimals,
      };
      console.log(`Stored symbol ${token1Symbol} on ${exchange}`);
    }
    if (position.liquidity == 0) {
      return { status: "burned" };
    }
  } catch (e) {
    const message = (e as Error).message;
    if (
      message.includes("!VALID ID") ||
      message.includes("Invalid token ID") ||
      message.includes('execution reverted: "ID"')
    ) {
      return { status: "burned" };
    } else {
      console.log(`Error with getPosition: ${e}`);
      return { status: "error" };
    }
  }
  return {
    status: "success",
    position,
    owner,
    token0Symbol: tokenSymbols[position.token0].symbol,
    token1Symbol: tokenSymbols[position.token1].symbol,
    token0Decimals: tokenSymbols[position.token0].decimals,
    token1Decimals: tokenSymbols[position.token1].decimals,
  };
};

/**
 * Get the CLPool contract and call slot() and liquidity(). slot0[1] is tick,
 * slot0[0] is sqrtPriceX96
 * @param token0
 * @param token1
 * @param fee
 * @param exchange
 * @param veloTickSpacing Only needed for velo exchanges because you need tick
 * spacing to compute pool address
 */
export const getPoolSlot0AndLiquidity = async (
  token0: string,
  token1: string,
  fee: number,
  exchange: string,
  veloTickSpacing?: number | null,
): Promise<null | {
  slot0: [number, number, number, number, number, number, number, boolean];
  liquidity: number;
  poolAddress: string;
  tickSpacing: number;
}> => {
  const tokenA = new Token(CHAIN_IDS[exchange], token0, 18);
  const tokenB = new Token(CHAIN_IDS[exchange], token1, 18);
  let poolAddress;
  if (VELO_EXCHANGES.includes(exchange)) {
    if (!veloTickSpacing) {
      console.log("You must provide tickSpacing for aerodrome");
      return null;
    }
    poolAddress = await computeAerodromeClPoolAddress(
      FACTORIES[exchange],
      [token0, token1],
      veloTickSpacing,
      PROVIDERS[exchange],
    );
  } else if (exchange == "uniswap") {
    poolAddress = Pool.getAddress(tokenA, tokenB, fee);
  } else {
    poolAddress = RamsesPool.getAddress(
      tokenA,
      tokenB,
      fee,
      POOL_INIT_CODE_HASHES[exchange],
      FACTORIES[exchange],
    );
  }
  // The ABI for aerodrome is slightly different, so it needs its own ABI
  const clPoolContract = new ethers.Contract(
    poolAddress,
    VELO_EXCHANGES.includes(exchange) ? CLPoolAerodrome : ClPool,
    PROVIDERS[exchange],
  );
  let slot0;
  let liquidity;
  let tickSpacing = veloTickSpacing ? veloTickSpacing : 0;
  try {
    slot0 = await clPoolContract.slot0();
    liquidity = await clPoolContract.liquidity();
    if (!tickSpacing) {
      tickSpacing = await clPoolContract.tickSpacing();
    }
  } catch (e) {
    console.log(`Error with getPoolSlot0: ${e}`);
    return null;
  }
  return { slot0, liquidity, poolAddress, tickSpacing };
};

export const getKingdomPositionRewards = async (
  poolAddress: string,
  exchange: string,
  positionId: number,
  rewardToken: string,
) => {
  const correctProvider = PROVIDERS[exchange];
  const clGaugeFactoryContract = new ethers.Contract(
    GAUGE_FACTORIES[exchange],
    ClGaugeFactory,
    correctProvider,
  );
  const gaugeAddress = await clGaugeFactoryContract.getGauge(poolAddress);
  const gaugev2Contract = new ethers.Contract(
    gaugeAddress,
    GaugeV2,
    correctProvider,
  );
  const earned = await gaugev2Contract.earned(rewardToken, positionId);
  return earned;
};

export const getAerodromePositionRewards = async (
  poolAddress: string,
  exchange: string,
  positionId: number,
  account: string,
): Promise<bigint> => {
  const correctProvider = PROVIDERS[exchange];
  const aerodromePoolContract = new ethers.Contract(
    poolAddress,
    CLPoolAerodrome,
    correctProvider,
  );
  const gaugeAddress = await aerodromePoolContract.gauge();
  const gaugeContract = new ethers.Contract(
    gaugeAddress,
    GaugeV2,
    correctProvider,
  );
  const earned = await gaugeContract.earned(account, positionId);
  return earned;
};

export const getPositionsFromDatabase = async (
  positionId: number,
  exchange: string,
) => {
  let result = await pool.query(
    `SELECT tg_id, position_id, burned FROM positions WHERE position_id = $1 AND exchange = $2 AND burned IS FALSE;`,
    [positionId, exchange],
  );
  return result.rows;
};

// Get all non burned positions from the database
export const getAllPositionsFromDatabase = async (): Promise<
  {
    tg_id: string;
    username: string;
    position_id: number;
    burned: boolean;
    in_range: boolean;
    exchange: string;
    tick_spacing: number;
  }[]
> => {
  let result = await pool.query(
    `SELECT tg_id, username, position_id, burned, in_range, exchange, tick_spacing, pool_address FROM positions WHERE burned IS FALSE;`,
  );
  return result.rows;
};

export const insertPositionIntoDatabase = async (
  positionId: number,
  tgId: string,
  inRange: boolean,
  username: string,
  exchange: string,
  token0: string,
  token1: string,
  fee: number,
  token0Symbol: string,
  token1Symbol: string,
  tickLower: number,
  tickUpper: number,
  positionLiquidity: string,
  token0Decimals: number,
  token1Decimals: number,
  owner: string,
  tick_spacing: number | null,
  pool_address: string,
) => {
  await pool.query(
    `INSERT INTO positions (tg_id, username, position_id, burned, in_range, exchange, token0, token1, fee, token0Symbol, token1Symbol, tickLower, tickUpper, positionLiquidity, token0decimals, token1decimals, owner, tick_spacing, pool_address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      tgId,
      username,
      positionId,
      false,
      inRange,
      exchange,
      token0,
      token1,
      fee,
      token0Symbol,
      token1Symbol,
      tickLower,
      tickUpper,
      positionLiquidity,
      token0Decimals,
      token1Decimals,
      owner,
      tick_spacing ? tick_spacing : null,
      pool_address,
    ],
  );
};

export const updateDatabasePositionInRange = async (
  positionId: number,
  inRange: boolean,
  exchange: string,
) => {
  await pool.query(
    `UPDATE positions SET in_range = $1 WHERE position_id = $2 AND exchange = $3`,
    [inRange, positionId, exchange],
  );
};

export const updateDatabasePositionBurned = async (
  positionId: number,
  exchange: string,
) => {
  await pool.query(
    `UPDATE positions SET burned = TRUE WHERE position_id = $1 AND exchange = $2`,
    [positionId, exchange],
  );
};

export const removePositionFromDatabase = async (
  positionId: number,
  tgId: string,
  exchange: string,
) => {
  await pool.query(
    `DELETE FROM positions WHERE position_id = $1 AND tg_id = $2 AND exchange = $3`,
    [positionId, tgId, exchange],
  );
};

export const getUserTrackedPositions = async (
  tgId: string,
): Promise<Array<DatabasePosition>> => {
  const result = await pool.query(
    `SELECT position_id, in_range, exchange, token0, token1, token0symbol, token1symbol, fee, tickLower, tickUpper, positionLiquidity, token0decimals, token1decimals, owner, tick_spacing, pool_address FROM positions WHERE tg_id = $1 AND burned IS FALSE`,
    [tgId],
  );
  return result.rows;
};

export const removeAllPositionsFromDatabase = async (tgId: string) => {
  await pool.query(`DELETE FROM positions WHERE tg_id = $1`, [tgId]);
};

export const getFees = async (
  positionId: number,
  exchange: string,
  owner: string,
) => {
  if (!KINGDOM_EXCHANGES.includes(exchange)) {
    throw new Error("Not a supported exchange to get fees.");
  }
  const nfpm = nfpmContract(exchange);
  const result = await nfpm.collect.staticCall([
    positionId,
    owner,
    "340282366920938463463374607431768211455",
    "340282366920938463463374607431768211455",
  ]);
  return result;
};

/**
 *
 * @param pairsWithChainId: 1st element is pair address, 2nd element is dex screener
 * chainId, ie 'base' or 'optimism'
 */
export const getDexscreenerPrices = async (
  pairsWithChainId: Array<[string, string]>,
) => {
  const fetchPromises = pairsWithChainId.map(async (pair) => {
    const url = `https://api.dexscreener.com/latest/dex/pairs/${pair[0]}/${pair[1]}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.pair;
  });
  let pairsData = await Promise.all(fetchPromises);
  return pairsData;
};

/**
 * The only way to find the owner of a staked velodrome NFT is to query transfer event
 * @param exchange
 * @param positionId
 */
export const findOwnerOfVeloNft = async (
  exchange: string,
  positionId: number,
) => {
  const provider = PROVIDERS[exchange];
  const erc721Contract = new ethers.Contract(
    VELO_NFT_ADDRESSES[exchange],
    ERC721,
    provider,
  );
  const filter = erc721Contract.filters.Transfer(null, null, positionId);
  const events = await erc721Contract.queryFilter(filter, -9900);
  const mostRecentEvent = events[events.length - 1];
  if (mostRecentEvent) {
    const decodedEvent = erc721Contract.interface.decodeEventLog(
      "Transfer",
      mostRecentEvent.data,
      mostRecentEvent.topics,
    );
    // TODO: Assert that `to` is to the gauge
    return decodedEvent.from;
  } else {
    return null;
  }
};
