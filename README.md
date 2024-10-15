### wizard-of-az-bot 🧙

A telegram bot that notifies you when your CL positions go out of range. Also provides additional stats about your LPs.
**DEXs currently supported**: Ramses, Nile, Nuri, Pharaoh, Ra, Cleo, Uniswap (mainnet), Aerodrome, Velodrome.

Currently deployed at: https://t.me/WizardOfAzBot. Our twitter is: https://x.com/Wizard_of_Az_


#### Steps
1. Create a SQL table by running `scripts/sql_scripts.sql`
2. Complete your `.env`. Note that you should set `LOCAL_DB=true` for local running, and omit this env variable entirely in prod.
3. `yarn`
4. cd into `node_modules/ramsesexchange-v3-sdk` and run `yarn build`. This is necessary as this repo was from github.
5. `npx tsc`
6. Run `bot.js` to start the telegram bot and run `notifier.js` to start the notification service.

This is an open source project and we welcome all PR contributions to add new chains and integrations.