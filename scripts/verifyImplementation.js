const { run } = require("hardhat");

async function main() {
  // Implementation addresses
  const WITHDRAW_MANAGER = "0xc609F1043db4b59F526408AD2B376829Da1BEB1e";
  const STAKE_MANAGER = "0x9331851C484684f1298b877A59C9f822e46E5426";
  const VALIDATOR_SHARE = "0x6B22a6D7267f0ced8DC6e5b828Fc51B229D08327";
  const ERC20_PREDICATE = "0x27Fb5cfBd529aAeDF124f2940dC7E947E0c5a16b";
  const ERC721_PREDICATE = "0xA3ebe23113e320D26C5460Bb59DBC23f76adff3B";

  // Proxy addresses needed for constructor args
  const WITHDRAW_MANAGER_PROXY = "0x5475F5823168bAf8eBe0bC7A195ab0d7BebCAAC5";
  const DEPOSIT_MANAGER_PROXY = "0x78FB39bd541BD09c5e1D47b2bBB28A7279c9d196";

  console.log("Starting contract verifications...");

  // Verify WithdrawManager
  console.log("\nVerifying WithdrawManager...");
  try {
    await run("verify:verify", {
      address: WITHDRAW_MANAGER,
      constructorArguments: []
    });
  } catch (error) {
    console.log("WithdrawManager verification failed:", error.message);
  }

  // Verify StakeManager
  console.log("\nVerifying StakeManager...");
  try {
    await run("verify:verify", {
      address: STAKE_MANAGER,
      constructorArguments: []
    });
  } catch (error) {
    console.log("StakeManager verification failed:", error.message);
  }

  // Verify ValidatorShare
  console.log("\nVerifying ValidatorShare...");
  try {
    await run("verify:verify", {
      address: VALIDATOR_SHARE,
      constructorArguments: []
    });
  } catch (error) {
    console.log("ValidatorShare verification failed:", error.message);
  }

  // Verify ERC20PredicateBurnOnly
  console.log("\nVerifying ERC20PredicateBurnOnly...");
  try {
    await run("verify:verify", {
      address: ERC20_PREDICATE,
      constructorArguments: [
        WITHDRAW_MANAGER_PROXY,
        DEPOSIT_MANAGER_PROXY
      ]
    });
  } catch (error) {
    console.log("ERC20PredicateBurnOnly verification failed:", error.message);
  }

  // Verify ERC721PredicateBurnOnly
  console.log("\nVerifying ERC721PredicateBurnOnly...");
  try {
    await run("verify:verify", {
      address: ERC721_PREDICATE,
      constructorArguments: [
        WITHDRAW_MANAGER_PROXY,
        DEPOSIT_MANAGER_PROXY
      ]
    });
  } catch (error) {
    console.log("ERC721PredicateBurnOnly verification failed:", error.message);
  }

  console.log("\nVerification process completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });