import { ethers, AbiCoder } from "ethers";
import CLFactoryAerodrome from "./abi/CLFactoryAerodrome.json";

export const VELO_EXCHANGES = ["aerodrome", "velodrome"];
const EXCHANGES_WITHOUT_URLS = VELO_EXCHANGES.concat(["uniswap"]);
export const KINGDOM_EXCHANGES = [
  "nile",
  "nuri",
  "cleo",
  "ramses",
  "pharaoh",
  "ra",
];
export const DEXSCREENER_CHAIN_IDS: Record<string, string> = {
  aerodrome: "base",
  velodrome: "optimism",
};

//Got code from https://github.com/aerodrome-finance/slipstream/blob/f10953a777ae53a8f230028122420949508b5357/test/periphery/shared/computePoolAddress.ts#L4
export async function computeAerodromeClPoolAddress(
  factoryAddress: string,
  [tokenA, tokenB]: [string, string],
  tickSpacing: number,
  provider: any,
): Promise<string> {
  const [token0, token1] =
    tokenA.toLowerCase() < tokenB.toLowerCase()
      ? [tokenA, tokenB]
      : [tokenB, tokenA];
  const defaultAbiCoder = AbiCoder.defaultAbiCoder();
  const constructorArgumentsEncoded = defaultAbiCoder.encode(
    ["address", "address", "int24"],
    [token0, token1, tickSpacing],
  );
  const poolFactory = new ethers.Contract(
    factoryAddress,
    CLFactoryAerodrome,
    provider,
  );
  const implementationAddress = (
    await poolFactory.poolImplementation()
  ).toString();
  const initCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implementationAddress.replace(
    "0x",
    "",
  )}5af43d82803e903d91602b57fd5bf3`;
  const initCodeHash = ethers.keccak256(initCode);

  const create2Inputs = [
    "0xff",
    factoryAddress,
    // salt
    ethers.keccak256(constructorArgumentsEncoded),
    // init code hash
    initCodeHash,
  ];
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join("")}`;
  return ethers.getAddress(`0x${ethers.keccak256(sanitizedInputs).slice(-40)}`);
}

export function getUrl(databasePosition: {
  exchange: string;
  position_id: number;
}) {
  let url = "";
  if (!EXCHANGES_WITHOUT_URLS.includes(databasePosition.exchange)) {
    url = `https://${databasePosition.exchange}.${databasePosition.exchange == "nile" ? "build" : "exchange"}/liquidity/v2/${databasePosition.position_id}`;
  }
  return url;
}
