### nile-bot

A telegram bot that pings you when your Nile (https://x.com/NileExchange) concentrated liquidity positions move out (and back in) of range.

To set up locally, you must create a SQL table by running `scripts/sql_scripts.sql`. Complete your `.env` and then:

1. `yarn`
2. `npx tsc`
3. Run `bot.js` to start the telegram bot and run `notifier.js` to start the notification service.
