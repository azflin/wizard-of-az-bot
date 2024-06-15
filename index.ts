import { ethers } from "ethers";
import NonFungiblePositionManager from "./abi/NonFungiblePositionManager.json";
import ClPool from "./abi/ClPool.json";
import { getPositionsFromDatabase } from "./api";
import { RPC_URLS } from "./config";

async function main() {
  const exchanges = Object.keys(RPC_URLS);
  for (const exchange of exchanges) {
    const positions = await getPositionsFromDatabase(70897, exchange);
    console.log({ exchange, positions });
  }
}

// POSIX compliant apps should report an exit status
main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err); // Writes to stderr
    process.exit(1);
  });
