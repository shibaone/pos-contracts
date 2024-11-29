const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  // const REGISTRY = "0xC4d2Cf0423c326BC9d97A914B7FDf503805C37c7"; //puppynet
  // const GOVERNANCE = "0x1FFEdE2984dd324C0E63EdFfc44d5b6795826bfC"; //puppynet
  // const DEPOSIT_MANAGER_PROXY = "0x78FB39bd541BD09c5e1D47b2bBB28A7279c9d196"; //puppynet
  // const WITHDRAW_MANAGER_PROXY = "0x5475F5823168bAf8eBe0bC7A195ab0d7BebCAAC5"; //puppynet
  // const STAKE_MANAGER_PROXY = "0xC0568572887E9687D7b57c1fC83332F8d1d38A6a"; // puppynet
  const REGISTRY = "0xF486e3B6A432Bdd6EDaAe85a565CD7682A7862BB"; // mainnet
  const GOVERNANCE = "0xC476E20c2F7FA3B35aC242aBE71B59e902242f06"; //mainnent
  const DEPOSIT_MANAGER_PROXY = "0x885fcE983b6a01633f764325B8c3c5D31032C995"; //mainnet
  const WITHDRAW_MANAGER_PROXY = "0x5F683665ca87dbC3D1358913da80e3C71c328Fb0"; //mainnet
  const STAKE_MANAGER_PROXY = "0x65218A41Fb92637254B4f8c97448d3dF343A3064"; // mainnet
  
  console.log("Starting deployments...");
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  let nonce = await deployer.getNonce();
  const gasLimit = 5000000;
  const baseGasPrice = await ethers.provider.getFeeData();
  const gasPrice = baseGasPrice.gasPrice * BigInt(12) / BigInt(10);

  // Contract Deployments
  const WithdrawManager = await ethers.getContractFactory("WithdrawManager");
  const withdrawManager = await WithdrawManager.deploy({
    gasPrice,
    gasLimit,
    nonce: nonce++
  });
  await withdrawManager.waitForDeployment();
  console.log("Deployed WithdrawManager implementation at:", await withdrawManager.getAddress());

  const StakeManager = await ethers.getContractFactory("StakeManager");
  const stakeManager = await StakeManager.deploy({
    gasPrice,
    gasLimit,
    nonce: nonce++
  });
  await stakeManager.waitForDeployment();
  console.log("Deployed StakeManager implementation at:", await stakeManager.getAddress());

  const ValidatorShare = await ethers.getContractFactory("ValidatorShare");
  const validatorShare = await ValidatorShare.deploy({
    gasPrice,
    gasLimit,
    nonce: nonce++
  });
  await validatorShare.waitForDeployment();
  console.log("Deployed ValidatorShare implementation at:", await validatorShare.getAddress());

  const ERC20PredicateBurnOnly = await ethers.getContractFactory("ERC20PredicateBurnOnly");
  const erc20PredicateBurnOnly = await ERC20PredicateBurnOnly.deploy(
    WITHDRAW_MANAGER_PROXY,
    DEPOSIT_MANAGER_PROXY,
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  await erc20PredicateBurnOnly.waitForDeployment();
  console.log("Deployed ERC20PredicateBurnOnly implementation at:", await erc20PredicateBurnOnly.getAddress());

  const ERC721PredicateBurnOnly = await ethers.getContractFactory("ERC721PredicateBurnOnly");
  const erc721PredicateBurnOnly = await ERC721PredicateBurnOnly.deploy(
    WITHDRAW_MANAGER_PROXY,
    DEPOSIT_MANAGER_PROXY,
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  await erc721PredicateBurnOnly.waitForDeployment();
  console.log("Deployed ERC721PredicateBurnOnly implementation at:", await erc721PredicateBurnOnly.getAddress());

  // Get contract instances
  const governance = await ethers.getContractAt("Governance", GOVERNANCE);
  const registry = await ethers.getContractAt("Registry", REGISTRY);
  const withdrawManagerProxy = await ethers.getContractAt("WithdrawManagerProxy", WITHDRAW_MANAGER_PROXY);
  const stakeManagerProxy = await ethers.getContractAt("StakeManagerProxy", STAKE_MANAGER_PROXY);

  console.log("\nExecuting transactions...");

  // Direct implementation updates
  await withdrawManagerProxy.updateImplementation(
    await withdrawManager.getAddress(),
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  console.log("WithdrawManager implementation updated");

  await stakeManagerProxy.updateImplementation(
    await stakeManager.getAddress(),
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  console.log("StakeManager implementation updated");

  // Registry updates through governance
  const validatorShareData = registry.interface.encodeFunctionData(
    "updateContractMap",
    [ethers.keccak256(ethers.toUtf8Bytes("validatorShare")), await validatorShare.getAddress()]
  );
  await governance.update(
    REGISTRY,
    validatorShareData,
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  console.log("ValidatorShare updated in registry");

  // Remove old predicates
  const removePredicateData1 = registry.interface.encodeFunctionData(
    "removePredicate",
    ["0xa700BCC4E31BFE9375f5f55cD6fD133323F911D6"]
  );
  await governance.update(
    REGISTRY,
    removePredicateData1,
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  console.log("Old ERC20 predicate removed");

  const removePredicateData2 = registry.interface.encodeFunctionData(
    "removePredicate",
    ["0x6EF5E716911aEc0EFFECCe9E9b8Be0d8249e2377"]
  );
  await governance.update(
    REGISTRY,
    removePredicateData2,
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  console.log("Old ERC721 predicate removed");

  // Add new predicates
  const addErc20PredicateData = registry.interface.encodeFunctionData(
    "addErc20Predicate",
    [await erc20PredicateBurnOnly.getAddress()]
  );
  await governance.update(
    REGISTRY,
    addErc20PredicateData,
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  console.log("New ERC20 predicate added");

  const addErc721PredicateData = registry.interface.encodeFunctionData(
    "addErc721Predicate",
    [await erc721PredicateBurnOnly.getAddress()]
  );
  await governance.update(
    REGISTRY,
    addErc721PredicateData,
    {
      gasPrice,
      gasLimit,
      nonce: nonce++
    }
  );
  console.log("New ERC721 predicate added");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });