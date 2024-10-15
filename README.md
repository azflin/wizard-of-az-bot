### wizard-of-az-bot 🧙

A telegram bot that notifies you when your Ramses ecosystem (Ramses, Nile, Nuri, Pharaoh, Ra, Cleo) concentrated liquidity positions move out (and back in) of range.

Currently deployed at: https://t.me/WizardOfAzBot

Ramses: https://x.com/RamsesExchange

Nile: https://x.com/NileExchange

Nuri: https://x.com/NuriExchange

To set up locally, you must create a SQL table by running `scripts/sql_scripts.sql`. Complete your `.env` and then:

1. `yarn`
2. `npx tsc`
3. Run `bot.js` to start the telegram bot and run `notifier.js` to start the notification service.
