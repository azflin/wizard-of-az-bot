import * as dotenv from "dotenv";
dotenv.config();
import { Pool as PgPool } from "pg";
import { getPoolSlot0AndLiquidity, getPositionFromChain } from "../api";

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

async function backfill_token_and_liquidities() {
  const result = await pool.query(
    `SELECT id, position_id, exchange FROM positions WHERE burned IS FALSE`,
  );
  const positionsToBackfill = result.rows;
  for (const position of positionsToBackfill) {
    const positionFromChain = await getPositionFromChain(
      position.position_id,
      position.exchange,
    );

    // Update the position in the database
    await pool.query(
      `UPDATE positions 
     SET 
       token0 = $1,
       token1 = $2,
       fee = $3,
       tickLower = $4,
       tickUpper = $5,
       positionLiquidity = $6,
       token0Decimals = $7,
       token1Decimals = $8,
       token0Symbol = $9,
       token1Symbol = $10
     WHERE id = $11`,
      [
        positionFromChain.position!.token0,
        positionFromChain.position!.token1,
        positionFromChain.position!.fee,
        positionFromChain.position!.tickLower,
        positionFromChain.position!.tickUpper,
        positionFromChain.position!.liquidity,
        positionFromChain.token0Decimals,
        positionFromChain.token1Decimals,
        positionFromChain.token0Symbol,
        positionFromChain.token1Symbol,
        position.id,
      ],
    );

    console.log(`Updated position ${position.id}`);
  }
}

async function backfill_owners() {
  const result = await pool.query(
    `SELECT id, position_id, exchange FROM positions WHERE burned IS FALSE`,
  );
  const positionsToBackfill = result.rows;
  for (const position of positionsToBackfill) {
    const positionFromChain = await getPositionFromChain(
      position.position_id,
      position.exchange,
    );

    // Update the position in the database
    await pool.query(
      `UPDATE positions 
     SET 
       owner = $1
     WHERE id = $2`,
      [positionFromChain.owner, position.id],
    );

    console.log(`Updated position ${position.id}`);
  }
}

async function backfill_velo_owners() {
  const result = await pool.query(
    `SELECT id, position_id, exchange FROM positions WHERE burned IS FALSE AND exchange IN ('velodrome', 'aerodrome')`,
  );
  const positionsToBackfill = result.rows;
  for (const position of positionsToBackfill) {
    const positionFromChain = await getPositionFromChain(
      position.position_id,
      position.exchange,
    );

    // Update the position in the database
    await pool.query(
      `UPDATE positions 
     SET 
       owner = $1
     WHERE id = $2`,
      [positionFromChain.owner, position.id],
    );

    console.log(`Updated position ${position.id}`);
  }
}

async function backfill_pool_address() {
  const result = await pool.query(
    `SELECT * FROM positions WHERE burned IS FALSE`,
  );
  const positionsToBackfill = result.rows;
  for (const position of positionsToBackfill) {
    const x = await getPoolSlot0AndLiquidity(
      position.token0,
      position.token1,
      position.fee,
      position.exchange,
      position.tick_spacing,
    );

    // Update the position in the database
    await pool.query(
      `UPDATE positions 
     SET 
       pool_address = $1
     WHERE id = $2`,
      [x?.poolAddress, position.id],
    );

    console.log(`Updated position ${position.id}`);
  }
}

backfill_pool_address()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err); // Writes to stderr
    process.exit(1);
  });
