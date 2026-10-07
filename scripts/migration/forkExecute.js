/**
 * Fork only: send calldata files written by the prepare steps, as their signer, on a local fork.
 *
 * This is how a rehearsal runs exactly the transactions the hardware wallet will sign. It refuses
 * to talk to anything but a local anvil or hardhat node. Each mined hash is printed; check it with
 * the matching `verify --tx <hash> --fork` before sending the next file.
 *
 * Run:
 *   node scripts/migration/forkExecute.js scripts/migration/out/<file>.json [more files...]
 */

const fs = require("fs");
const lib = require("./lib");
const { ethers } = lib;

async function main() {
  const files = lib.parseArgs()._;
  if (!files.length) throw new Error("Pass one or more calldata files from scripts/migration/out/");
  const ctx = await lib.connect({ fork: true });
  const client = await ctx.provider.send("web3_clientVersion", []);
  const method = /anvil/i.test(client) ? "anvil" : "hardhat";

  for (const file of files) {
    const tx = JSON.parse(fs.readFileSync(file, "utf8"));
    await ctx.provider.send(`${method}_impersonateAccount`, [tx.from]);
    await ctx.provider.send(`${method}_setBalance`, [tx.from, ethers.toQuantity(ethers.parseEther("10"))]);
    const signer = new ethers.JsonRpcSigner(ctx.provider, tx.from);
    const sent = await signer.sendTransaction({ to: tx.to, data: tx.data, value: 0, gasLimit: BigInt(tx.gasLimit) });
    const receipt = await sent.wait();
    console.log(`${receipt.status === 1 ? "mined   " : "REVERTED"} ${sent.hash}  gas ${receipt.gasUsed}  ${tx.decoded}  (${file})`);
    if (receipt.status !== 1) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
