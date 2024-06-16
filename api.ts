import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });
import { ethers } from "ethers";
import NonFungiblePositionManager from "./abi/NonFungiblePositionManager.json";
import ClPool from "./abi/ClPool.json";
import ERC20 from "./abi/ERC20.json";
import { Pool } from "@uniswap/v3-sdk";
import { Token } from "@uniswap/sdk-core";
import { Pool as PgPool } from "pg";
import {
  RPC_URLS,
  NFPM_ADDRESSES,
  CHAIN_IDS,
  POOL_INIT_CODE_HASHES,
  FACTORIES
} from "./config";

const provider = (exchange: string) => new ethers.JsonRpcProvider(RPC_URLS[exchange]);
const nfpmContract = (exchange: string) => new ethers.Contract(NFPM_ADDRESSES[exchange], NonFungiblePositionManager, provider(exchange));

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

export const getPositionFromChain = async (
  positionId: number,
  exchange: string
): Promise<{
  status: string;
  position?: {
    tickLower: number;
    tickUpper: number;
    token0: string;
    token1: string;
    fee: number;
  };
  token0Symbol?: string;
  token1Symbol?: string;
}> => {
  let position;
  let token0Symbol;
  let token1Symbol;
  try {
    const nfpm = nfpmContract(exchange);
    position = await nfpm.positions(positionId);
    const token0Contract = new ethers.Contract(position.token0, ERC20, provider(exchange));
    token0Symbol = await token0Contract.symbol();
    const token1Contract = new ethers.Contract(position.token1, ERC20, provider(exchange));
    token1Symbol = await token1Contract.symbol();
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("!VALID ID")) {
      return { status: "burned" };
    } else {
      console.log(`Error with getPosition: ${e}`);
      return { status: "error" };
    }
  }
  return { status: "success", position, token0Symbol, token1Symbol };
};

// slot0[1] is tick
export const getPoolSlot0 = async (
  token0: string,
  token1: string,
  fee: number,
  exchange: string
): Promise<null | any[]> => {
  const tokenA = new Token(CHAIN_IDS[exchange], token0, 18);
  const tokenB = new Token(CHAIN_IDS[exchange], token1, 18);
  const poolAddress = Pool.getAddress(tokenA, tokenB, fee, POOL_INIT_CODE_HASHES[exchange], FACTORIES[exchange]);
  const clPoolContract = new ethers.Contract(poolAddress, ClPool, provider(exchange));
  let slot0;
  try {
    slot0 = await clPoolContract.slot0();
  } catch (e) {
    console.log(`Error with getPoolSlot0: ${e}`);
    return null;
  }
  return slot0;
};

export const getPositionsFromDatabase = async (positionId: number, exchange: string) => {
  let result = await pool.query(
    `SELECT tg_id, position_id, burned FROM positions WHERE position_id = $1 AND exchange = $2 AND burned IS FALSE;`,
    [positionId, exchange],
  );
  return result.rows;
};

// Get all non burned positions from the database
export const getAllPositionsFromDatabase = async (): Promise<
  { tg_id: string; position_id: number; burned: boolean; in_range: boolean; exchange: string }[]
> => {
  let result = await pool.query(
    `SELECT tg_id, position_id, burned, in_range, exchange FROM positions WHERE burned IS FALSE;`,
  );
  return result.rows;
};

export const insertPositionIntoDatabase = async (
  positionId: number,
  tgId: string,
  inRange: boolean,
  username: string,
  exchange: string
) => {
  await pool.query(`INSERT INTO positions (tg_id, username, position_id, burned, in_range, exchange) VALUES ($1, $2, $3, $4, $5, $6)`, [
    tgId,
    username,
    positionId,
    false,
    inRange,
    exchange,
  ]);
};

export const updateDatabasePositionInRange = async (
  positionId: number,
  inRange: boolean,
  exchange: string
) => {
  await pool.query(
    `UPDATE positions SET in_range = $1 WHERE position_id = $2 AND exchange = $3`,
    [inRange, positionId, exchange],
  );
};

export const updateDatabasePositionBurned = async (positionId: number, exchange: string) => {
  await pool.query(
    `UPDATE positions SET burned = TRUE WHERE position_id = $1 AND exchange = $2`,
    [positionId, exchange],
  );
};

export const removePositionFromDatabase = async (
  positionId: number,
  tgId: string,
  exchange: string
) => {
  await pool.query(
    `DELETE FROM positions WHERE position_id = $1 AND tg_id = $2 AND exchange = $3`,
    [positionId, tgId, exchange]
  );
};

export const getUserTrackedPools = async (tgId: string) => {
  const result = await pool.query(
    `SELECT position_id, exchange FROM positions WHERE tg_id = $1 AND burned IS FALSE`,
    [tgId]
  );
  return result.rows;
};

export const removeAllPositionsFromDatabase = async (tgId: string) => {
  await pool.query(
    `DELETE FROM positions WHERE tg_id = $1`,
    [tgId]
  );
};
