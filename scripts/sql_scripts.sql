CREATE TABLE IF NOT EXISTS positions
(
    tg_id text,
    username text,
    position_id integer PRIMARY KEY,
    burned boolean,
    in_range boolean,
    exchange text
);

-- July 15 2024
ALTER TABLE positions
ADD COLUMN token0 text,
ADD COLUMN token1 text,
ADD COLUMN fee INTEGER,
ADD COLUMN date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE positions
DROP CONSTRAINT positions_pkey;

ALTER TABLE positions
ADD COLUMN id SERIAL PRIMARY KEY,
ALTER COLUMN position_id DROP NOT NULL;

ALTER TABLE positions
ADD COLUMN token0Symbol text,
ADD COLUMN token1Symbol text;

ALTER TABLE positions
ADD COLUMN tickLower integer,
ADD COLUMN tickUpper integer;

ALTER TABLE positions
ADD COLUMN positionLiquidity text;

ALTER TABLE positions
ADD COLUMN token0Decimals integer,
ADD COLUMN token1Decimals integer;

ALTER TABLE positions
ADD COLUMN owner text;

ALTER TABLE positions
ADD COLUMN tick_spacing integer;

ALTER TABLE positions
ADD COLUMN pool_address text;