const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  // Contract addresses
  const REGISTRY = "0xC4d2Cf0423c326BC9d97A914B7FDf503805C37c7"; //puppynet
  const GOVERNANCE = "0x1FFEdE2984dd324C0E63EdFfc44d5b6795826bfC"; //puppynet
  const DEPOSIT_MANAGER_PROXY = "0x78FB39bd541BD09c5e1D47b2BBB28A7279c9d196"; //puppynet
  const WITHDRAW_MANAGER_PROXY = "0x5475F5823168bAf8eBe0bC7A195ab0d7BebCAAC5"; //puppynet
  const STAKE_MANAGER_PROXY = "0xC0568572887E9687D7b57c1fC83332F8d1d38A6a"; // puppynet
  
  console.log("Starting deployments...");

  // Get the deployer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // STEP 1: Deploy new WithdrawManager version
  const WithdrawManager = await ethers.getContractFactory("WithdrawManager");
  const withdrawManager = await WithdrawManager.deploy();
  await withdrawManager.deployed();
  console.log("Deployed WithdrawManager implementation at:", withdrawManager.address);

  // STEP 2: Deploy new StakeManager version
  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stakeManager = await StakeManager.deploy();
  await stakeManager.deployed();
  console.log("Deployed StakeManager implementation at:", stakeManager.address);

  // STEP 3: Deploy new ValidatorShare version
  const ValidatorShare = await ethers.getContractFactory("ValidatorShare");
  const validatorShare = await ValidatorShare.deploy();
  await validatorShare.deployed();
  console.log("Deployed ValidatorShare implementation at:", validatorShare.address);

  // STEP 4: Deploy new ERC20PredicateBurnOnly version
  const ERC20PredicateBurnOnly = await ethers.getContractFactory("ERC20PredicateBurnOnly");
  const erc20PredicateBurnOnly = await ERC20PredicateBurnOnly.deploy(
    WITHDRAW_MANAGER_PROXY,
    DEPOSIT_MANAGER_PROXY
  );
  await erc20PredicateBurnOnly.deployed();
  console.log("Deployed ERC20PredicateBurnOnly implementation at:", erc20PredicateBurnOnly.address);

  // STEP 5: Deploy new ERC721PredicateBurnOnly version
  const ERC721PredicateBurnOnly = await ethers.getContractFactory("ERC721PredicateBurnOnly");
  const erc721PredicateBurnOnly = await ERC721PredicateBurnOnly.deploy(
    WITHDRAW_MANAGER_PROXY,
    DEPOSIT_MANAGER_PROXY
  );
  await erc721PredicateBurnOnly.deployed();
  console.log("Deployed ERC721PredicateBurnOnly implementation at:", erc721PredicateBurnOnly.address);

  console.log("\nGenerating payloads...");

  // Get contract interfaces
  const governance = await ethers.getContractAt("Governance", GOVERNANCE);
  const registry = await ethers.getContractAt("Registry", REGISTRY);
  const withdrawManagerProxy = await ethers.getContractAt("WithdrawManagerProxy", WITHDRAW_MANAGER_PROXY);
  const stakeManagerProxy = await ethers.getContractAt("StakeManagerProxy", STAKE_MANAGER_PROXY);

  // STEP 1: Update ValidatorShare registry entry
  const updateValidatorSharePayload = await governance.interface.encodeFunctionData(
    "update",
    [
      REGISTRY,
      registry.interface.encodeFunctionData(
        "updateContractMap",
        [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("validatorShare")), validatorShare.address]
      )
    ]
  );
  console.log("\nUpdate ValidatorShare Registry Payload:");
  console.log("Send to:", GOVERNANCE);
  console.log("Data:", updateValidatorSharePayload);

  // STEP 2: Update StakeManager implementation
  const updateStakeManagerPayload = await stakeManagerProxy.interface.encodeFunctionData(
    "updateImplementation",
    [stakeManager.address]
  );
  console.log("\nUpdate StakeManager Implementation Payload:");
  console.log("Send to:", STAKE_MANAGER_PROXY);
  console.log("Data:", updateStakeManagerPayload);

  // STEP 3: Remove old predicates payloads
  const removePredicatePayload1 = await governance.interface.encodeFunctionData(
    "update",
    [
      REGISTRY,
      registry.interface.encodeFunctionData(
        "removePredicate",
        ["0x367a6722F2e2b09b6024A1C05deAD45e68CE385A"]  // ERC20PredicateBurnOnly
      )
    ]
  );
  console.log("\nRemove Predicate Payload 1:");
  console.log("Send to:", GOVERNANCE);
  console.log("Data:", removePredicatePayload1);

  const removePredicatePayload2 = await governance.interface.encodeFunctionData(
    "update",
    [
      REGISTRY,
      registry.interface.encodeFunctionData(
        "removePredicate",
        ["0x12398F6FD9c9131891DD1621715DF11Ca0eDDd0e"] // ERC721PredicateBurnOnly
      )
    ]
  );
  console.log("\nRemove Predicate Payload 2:");
  console.log("Send to:", GOVERNANCE);
  console.log("Data:", removePredicatePayload2);

  // STEP 4: Add new predicates payloads
  const addErc20PredicatePayload = await governance.interface.encodeFunctionData(
    "update",
    [
      REGISTRY,
      registry.interface.encodeFunctionData(
        "addErc20Predicate",
        [erc20PredicateBurnOnly.address]
      )
    ]
  );
  console.log("\nAdd ERC20 Predicate Payload:");
  console.log("Send to:", GOVERNANCE);
  console.log("Data:", addErc20PredicatePayload);

  const addErc721PredicatePayload = await governance.interface.encodeFunctionData(
    "update",
    [
      REGISTRY,
      registry.interface.encodeFunctionData(
        "addErc721Predicate",
        [erc721PredicateBurnOnly.address]
      )
    ]
  );
  console.log("\nAdd ERC721 Predicate Payload:");
  console.log("Send to:", GOVERNANCE);
  console.log("Data:", addErc721PredicatePayload);

  // STEP 5: Update WithdrawManager implementation
  const updateWithdrawManagerPayload = await withdrawManagerProxy.interface.encodeFunctionData(
    "updateImplementation",
    [withdrawManager.address]
  );
  console.log("\nUpdate WithdrawManager Implementation Payload:");
  console.log("Send to:", WITHDRAW_MANAGER_PROXY);
  console.log("Data:", updateWithdrawManagerPayload);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });