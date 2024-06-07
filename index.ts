import { ethers } from "ethers";
import NonFungiblePositionManager from "./abi/NonFungiblePositionManager.json";
import ClPool from "./abi/ClPool.json";
import { getPositionsFromDatabase } from "./api";

const RPC_URL = "https://rpc.linea.build";
const NFPM_ADDRESS = "0xAAA78E8C4241990B4ce159E105dA08129345946A";
const POOL_ADDRESS = "0xeFD5Ec2CC043e3bd3C840F7998Cc42EE712700ba";

async function main() {
  const positions = await getPositionsFromDatabase(70897);
  console.log({ positions });
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
