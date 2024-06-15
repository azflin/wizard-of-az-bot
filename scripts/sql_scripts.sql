CREATE TABLE IF NOT EXISTS positions
(
    tg_id text,
    username text,
    position_id integer PRIMARY KEY,
    burned boolean,
    in_range boolean,
    exchange text
);
