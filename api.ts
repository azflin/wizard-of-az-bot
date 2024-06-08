import * as dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });
import { ethers } from "ethers";
import NonFungiblePositionManager from "./abi/NonFungiblePositionManager.json";
import ClPool from "./abi/ClPool.json";
import { Pool } from "@uniswap/v3-sdk";
import { Token } from "@uniswap/sdk-core";
import { Pool as PgPool } from "pg";

const RPC_URL = "https://rpc.linea.build";
const NFPM_ADDRESS = "0xAAA78E8C4241990B4ce159E105dA08129345946A";
const CHAIN_ID = 59144;
const POOL_INIT_CODE_HASH =
  "0x1565b129f2d1790f12d45301b9b084335626f0c92410bc43130763b69971135d";
const FACTORY = "0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const nfpmContract = new ethers.Contract(
  NFPM_ADDRESS,
  NonFungiblePositionManager,
  provider,
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

export const getPositionFromChain = async (
  positionId: number,
): Promise<{
  status: string;
  position?: {
    tickLower: number;
    tickUpper: number;
    token0: string;
    token1: string;
    fee: number;
  };
}> => {
  let position;
  try {
    position = await nfpmContract.positions(positionId);
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("!VALID ID")) {
      return { status: "burned" };
    } else {
      console.log(`Error with getPosition: ${e}`);
      return { status: "error" };
    }
  }
  return { status: "success", position };
};

// slot0[1] is tick
export const getPoolSlot0 = async (
  token0: string,
  token1: string,
  fee: number,
): Promise<null | any[]> => {
  const tokenA = new Token(CHAIN_ID, token0, 18);
  const tokenB = new Token(CHAIN_ID, token1, 18);
  const poolAddress = Pool.getAddress(
    tokenA,
    tokenB,
    fee,
    POOL_INIT_CODE_HASH,
    FACTORY,
  );
  const clPoolContract = new ethers.Contract(poolAddress, ClPool, provider);
  let slot0;
  try {
    slot0 = await clPoolContract.slot0();
  } catch (e) {
    console.log(`Error with getPoolSlot0: ${e}`);
    return null;
  }
  return slot0;
};

export const getPositionsFromDatabase = async (positionId: number) => {
  let result = await pool.query(
    `SELECT tg_id, position_id, burned FROM positions WHERE position_id = $1 AND burned IS FALSE;`,
    [positionId],
  );
  return result.rows;
};

// Get all non burned positions from the database
export const getAllPositionsFromDatabase = async (): Promise<
  { tg_id: string; position_id: number; burned: boolean; in_range: boolean }[]
> => {
  let result = await pool.query(
    `SELECT tg_id, position_id, burned, in_range FROM positions WHERE burned IS FALSE;`,
  );
  return result.rows;
};

export const insertPositionIntoDatabase = async (
  positionId: number,
  tgId: string,
  inRange: boolean,
  username: string
) => {
  await pool.query(`INSERT INTO positions VALUES ($1, $2, $3, $4, $5)`, [
    tgId,
    username,
    positionId,
    false,
    inRange,
  ]);
};

export const updateDatabasePositionInRange = async (
  positionId: number,
  inRange: boolean,
) => {
  await pool.query(
    `UPDATE positions SET in_range = $1 WHERE position_id = $2`,
    [inRange, positionId],
  );
};

export const updateDatabasePositionBurned = async (
  positionId: number
) => {
  await pool.query(
    `UPDATE positions SET burned = TRUE WHERE position_id = $1`,
    [positionId],
  );
}