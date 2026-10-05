// Rotates the leaked testnet admin key (OLD) to the new admin wallet (NEW) on Sepolia and Puppynet.
// Every step is dry-run with eth_call from OLD, then sent, then its resulting on-chain state is re-checked.
// Steps whose end state already holds are skipped, so the script can be re-run after an interruption.
//
//   node scripts/rotation/rotateTestnetAdmin.js plan
//   MODE=fork SEPOLIA_RPC=http://127.0.0.1:8545 PUPPYNET_RPC=http://127.0.0.1:8546 \
//     node scripts/rotation/rotateTestnetAdmin.js run [--fresh]
//   MODE=live CONFIRM=ROTATE-TESTNET-ADMIN node scripts/rotation/rotateTestnetAdmin.js run [--phases 1,2] [--chain sepolia]
//   [SEPOLIA_RPC=.. PUPPYNET_RPC=..] node scripts/rotation/rotateTestnetAdmin.js verify
//
// MODE=live signs with PRIVATE_KEY from .env and refuses to run unless that key is OLD.

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const OLD = "0x8B066912dCDA9c9001A84b28F1aBD06e9E19114B";
const NEW = "0xef87D17a9BC6f809CA56Ac17c9C1f6e351c09BD9";
// Upgrade key + co-admin of the live Sepolia ERC20 predicate since 2025-09-13. OLD cannot move it; left untouched.
const ERC20_PREDICATE_PROXY_OWNER = "0x6Ab974bE871a78530c8CC01C5F3486CE6D167bBE";

const CHAINS = {
  sepolia: { chainId: 11155111n, rpc: process.env.SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com" },
  puppynet: { chainId: 157n, rpc: process.env.PUPPYNET_RPC || "https://rpc.puppynet.shib.io" },
};

const ROLE = {
  DEFAULT_ADMIN: ethers.ZeroHash,
  MANAGER: ethers.id("MANAGER_ROLE"),
  MAPPER: ethers.id("MAPPER_ROLE"),
  PREDICATE: ethers.id("PREDICATE_ROLE"),
  DEPOSITOR: ethers.id("DEPOSITOR_ROLE"),
  STATE_SYNCER: ethers.id("STATE_SYNCER_ROLE"),
  TREAT_CUSTOM: "0x75014bb99fec408c8a7b2db450fbb25a36321ddb19a3db7a162c9126a7a96d06", // extra role on Puppynet TREAT
};
const roleName = (h) => Object.keys(ROLE).find((k) => ROLE[k] === h) || h;

const iface = new ethers.Interface([
  "function owner() view returns (address)",
  "function proxyOwner() view returns (address)",
  "function isOwner() view returns (bool)",
  "function governance() view returns (address)",
  "function transferOwnership(address)",
  "function transferProxyOwnership(address)",
  "function pendingOwner() view returns (address)",
  "function claimOwnership()",
  "function pause()",
  "function hasRole(bytes32,address) view returns (bool)",
  "function grantRole(bytes32,address)",
  "function revokeRole(bytes32,address)",
  "function renounceRole(bytes32,address)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256)",
  "function typeToPredicate(bytes32) view returns (address)",
  "function childChainManagerAddress() view returns (address)",
]);

const A = (x) => ethers.getAddress(x.toLowerCase());
const same = (a, b) => !!a && a.toLowerCase() === b.toLowerCase();
const OUT = path.join(__dirname, "out");
const PHASE_ORDER = ["1", "2", "3", "4", "5", "6", "5n"];

// StakeManager overrides isOwner() to read the proxy-owner slot, which is empty on a bare implementation,
// so onlyOwner on these contracts is unreachable for everyone (OLD included). Nothing to rotate.
const INERT_STAKE_MANAGER_IMPLS = [
  "0xeD458AA6A5E4F7FC8F4ffA5Ff3496F12b58C4067", "0x9331851C484684f1298b877A59C9f822e46E5426",
  "0x9f65025D9B3d39BE6eef28cc6B3C4b654A913c8A", "0x04b339308078Df5346AB5D0b1ba6B14bb4B03c6b",
  "0x3A377B6b9B92eeeA8c7c37D680E3b6d19c6D2791", "0x75E353cc2447bc2e363c885533Cf04007A58d5FB",
  "0xFb61EdaB0fFb6480CFf4BEb4616dc4bb57d47385", "0x8a5E1e3CC7d1c74FF978A0A6a9b3e46aA765f628",
  "0xB7cF93307f1073e131D205471b6991bEe3dc5391",
].map(A);

// Test USDC on Sepolia has owner() + onlyOwner mint/burn but no ownership-transfer function: OLD stays its owner forever.
// Only a replacement token (and a bridge remap) removes this.
const IMMUTABLE_OWNER_SEPOLIA = [A("0x2cFBdDc477876EcEB618eD59F8C742c5292CfC2B")];

const SEPOLIA = {
  RootChainManagerProxy: A("0xe13bE5020FDE8361D84C48dE85f1DD1CfFaC435F"),
  ERC20PredicateProxy: A("0x00BFE037Ad96420a06eb077BE0aE8b1372502F37"),
  ERC721PredicateProxy: A("0x48B9dc0aA5129dfd4B662a4c74F58D1770B1F9CE"),
  MintableERC721PredicateProxy: A("0x11395B79b17CAcC4bE57206131B449D5Bff9913A"),
  ERC1155PredicateProxy: A("0xA281E54b0e722184DA9B1913CF313354a58c0324"),
  EtherPredicateProxy: A("0x29f1d1B330613508fC0cDa6Cf7Ce878c780C5f1C"),
  GovernanceProxy: A("0x1FFEdE2984dd324C0E63EdFfc44d5b6795826bfC"),
  StakeManagerProxy: A("0xC0568572887E9687D7b57c1fC83332F8d1d38A6a"),
  Registry: A("0xC4d2Cf0423c326BC9d97A914B7FDf503805C37c7"),
};
const PUPPYNET = {
  ChildChainManagerProxy: A("0xC4d2Cf0423c326BC9d97A914B7FDf503805C37c7"),
  ChildChain: A("0x69120F2Ad38593c84a80973260B1eCdad4085633"),
  BONE: A("0x0000000000000000000000000000000000001010"),
};
const BRIDGED_CHILD_TOKENS = {
  SHIB: "0xAc720702Df63fa92416B3dEB24Dc4a1854f73330",
  LEASH: "0x367a6722F2e2b09b6024A1C05deAD45e68CE385A",
  DAI: "0x12CF8bf22Be843f8c065a2474d1C439daDD238b6",
  USDT: "0x236a6f60B554813486D84d581747217d77Af05ff",
  USDC: "0x63E22542204dA9978218FbB3C10E1c0f6D1DC2a7",
  WBTC: "0x3a042493688489d3482e39435c2F6C8cF85a9d54",
  MaticWETH: "0x0C477AE2E8E5ce1666468e44b066542Fa46f9F72",
  xFUND: "0x78f022230EaE6E05D8739E83a14b0Cf1D00CfaD5",
  FUND: "0x27Ad57c007fa9Ef6BC4D2846f341e316e0445dEe",
};
// Only the tokens listed in the shibaone/static address book are swept (80%); anything else is ignored.
const KNOWN_TOKENS = {
  sepolia: {
    DAI: "0x090d346d1662313f97d2072cf63c21409f2c848c", SHIB: "0xC6980A4Ad666D111d39Ef9F6e8b36EfeD0985121",
    LEASH: "0xf973D5513028A387f592d05C6F162b8298a407a0", USDT: "0x0048ab82cce2aF4c36d2C6e8Bf7711b8615BE277",
    USDC: "0x2cFBdDc477876EcEB618eD59F8C742c5292CfC2B", WBTC: "0xE950c7eA44A8cd9C0db01F3392Cb284DaA75b1A9",
    BONE: "0xcA94c8B16209CCBAfCFeab9D7649DdaEcD444007", WBONE: "0x41c3F37587EBcD46C0F85eF43E38BcfE1E70Ab56",
    xFUND: "0xb07C72acF3D7A5E9dA28C56af6F93862f8cc8196", FUND: "0xAfE70A1985ebDefbDCaeedba045d66091C38E1B1",
  },
  puppynet: { ...BRIDGED_CHILD_TOKENS, WBONE: "0x41c3F37587EBcD46C0F85eF43E38BcfE1E70Ab56" },
};

// ---------------------------------------------------------------- steps

const steps = [];
// key is stable across edits to the step list; resume state for transfers is stored under it
const add = (s) => steps.push({ id: `P${s.phase}-${String(steps.length + 1).padStart(3, "0")}`, key: `${s.chain}:${s.to}:${s.action}`, ...s });

function transferOwnership(phase, chain, name, addr) {
  const to = A(addr);
  add({ phase, chain, name, to, action: "transferOwnership(NEW)", data: iface.encodeFunctionData("transferOwnership", [NEW]),
    done: async (c) => same(await read(c, to, "owner"), NEW) });
}

// Claimable (two-step) ownership, e.g. test WBTC: OLD nominates NEW, then NEW must call claimOwnership() itself.
// The claim is signed by NEW: simulated in MODE=fork, printed as a manual action in MODE=live.
function transferClaimableOwnership(phase, chain, name, addr) {
  const to = A(addr);
  add({ phase, chain, name, to, action: "transferOwnership(NEW) [sets pendingOwner]", data: iface.encodeFunctionData("transferOwnership", [NEW]),
    done: async (c) => same(await read(c, to, "owner"), NEW) || same(await read(c, to, "pendingOwner"), NEW) });
  add({ phase, chain, name, to, from: "NEW", action: "claimOwnership() signed by NEW", data: iface.encodeFunctionData("claimOwnership", []),
    done: async (c) => same(await read(c, to, "owner"), NEW) });
}

function transferProxyOwnership(phase, chain, name, addr) {
  const to = A(addr);
  add({ phase, chain, name, to, action: "transferProxyOwnership(NEW)", data: iface.encodeFunctionData("transferProxyOwnership", [NEW]),
    done: async (c) => same(await read(c, to, "proxyOwner"), NEW) });
}

// grant DEFAULT_ADMIN (+ mirrored roles) to NEW, revoke listed third parties, then OLD renounces everything, admin last.
function rotateRoles(phase, chain, name, addr, { mirror = [], drop = [], revoke = [] } = {}) {
  const to = A(addr);
  const role = (fn, r, who, whoName, done) =>
    add({ phase, chain, name, to, action: `${fn}(${roleName(r)}, ${whoName})`, data: iface.encodeFunctionData(fn, [r, who]), done });
  role("grantRole", ROLE.DEFAULT_ADMIN, NEW, "NEW", (c) => hasRole(c, to, ROLE.DEFAULT_ADMIN, NEW));
  for (const r of mirror) role("grantRole", r, NEW, "NEW", (c) => hasRole(c, to, r, NEW));
  for (const [r, who] of revoke) role("revokeRole", r, A(who), A(who), async (c) => !(await hasRole(c, to, r, A(who))));
  for (const r of [...mirror, ...drop]) role("renounceRole", r, OLD, "OLD", async (c) => !(await hasRole(c, to, r, OLD)));
  role("renounceRole", ROLE.DEFAULT_ADMIN, OLD, "OLD", async (c) => !(await hasRole(c, to, ROLE.DEFAULT_ADMIN, OLD)));
}

function sweepToken80(phase, chain, symbol, addr) {
  const token = A(addr);
  add({ phase, chain, name: `${symbol} ${token}`, to: token, kind: "transfer", action: "transfer 80% of OLD balance to NEW",
    build: async (c) => {
      const before = await read(c, token, "balanceOf", [OLD]);
      // e.g. the Sepolia LEASH entry: a rebasing token that was never initialised, so balanceOf divides by zero
      if (before === null) return { skip: "balanceOf reverts (unusable token)" };
      const amount = (before * 80n) / 100n;
      if (amount === 0n) return { skip: "zero balance" };
      return { data: iface.encodeFunctionData("transfer", [NEW, amount]), amount, before };
    },
    after: async (c, b, rc) => {
      const data = iface.encodeFunctionData("balanceOf", [OLD]);
      const now = iface.decodeFunctionResult("balanceOf", await c.provider.call({ to: token, data, blockTag: rc.blockNumber }))[0];
      return now === b.before - b.amount;
    } });
}

function sweepNative80(phase, chain, symbol) {
  add({ phase, chain, name: `native ${symbol}`, to: NEW, kind: "transfer", action: "send 80% of OLD native balance to NEW",
    build: async (c) => {
      const amount = ((await c.provider.getBalance(OLD)) * 80n) / 100n;
      if (amount === 0n) return { skip: "zero balance" };
      return { value: amount, amount };
    },
    after: async (c, b, rc) =>
      (await c.provider.getBalance(NEW, rc.blockNumber)) - (await c.provider.getBalance(NEW, rc.blockNumber - 1)) === b.amount });
}

// Phase 1 — Sepolia live control, one call each, highest power first
transferOwnership("1", "sepolia", "GovernanceProxy", SEPOLIA.GovernanceProxy);
transferOwnership("1", "sepolia", "StakeManagerProxy", SEPOLIA.StakeManagerProxy);
transferOwnership("1", "sepolia", "RootChainProxy", "0x282704687674A2adeeBC572AE2947065a0C98607");
transferOwnership("1", "sepolia", "DepositManagerProxy", "0x78FB39bd541BD09c5e1D47b2bBB28A7279c9d196");
transferOwnership("1", "sepolia", "WithdrawManagerProxy", "0x5475F5823168bAf8eBe0bC7A195ab0d7BebCAAC5");
transferOwnership("1", "sepolia", "EventsHubProxy", "0xeb62CAd6C7481d2137B0DF873592581c8abb1baF");
transferOwnership("1", "sepolia", "StateSender", "0x0844c0ca42F24972e89233F476B033F763C2355a");
transferOwnership("1", "sepolia", "StakingInfo", "0xf4A7Ab6dC0A3400f21269E0187022582c3C99969");
transferOwnership("1", "sepolia", "SlashingManager", "0xEb163eeE996923e05d2efDDA28A82d950CBBD9Cb");
transferOwnership("1", "sepolia", "ValidatorRegistry", "0x9ab1fF7a3c395EE09b49aB2f7560145D239dFE15");
transferProxyOwnership("1", "sepolia", "RootChainManagerProxy", SEPOLIA.RootChainManagerProxy);
transferProxyOwnership("1", "sepolia", "ERC721PredicateProxy", SEPOLIA.ERC721PredicateProxy);
transferProxyOwnership("1", "sepolia", "MintableERC721PredicateProxy", SEPOLIA.MintableERC721PredicateProxy);
transferProxyOwnership("1", "sepolia", "ERC1155PredicateProxy", SEPOLIA.ERC1155PredicateProxy);
transferProxyOwnership("1", "sepolia", "EtherPredicateProxy", SEPOLIA.EtherPredicateProxy);

// Phase 2 — Sepolia live roles. RootChainManagerProxy already holds MANAGER on every predicate, so OLD's MANAGER is dropped.
rotateRoles("2", "sepolia", "RootChainManagerProxy", SEPOLIA.RootChainManagerProxy, { mirror: [ROLE.MAPPER] });
rotateRoles("2", "sepolia", "ERC20PredicateProxy", SEPOLIA.ERC20PredicateProxy, { drop: [ROLE.MANAGER] });
rotateRoles("2", "sepolia", "ERC721PredicateProxy", SEPOLIA.ERC721PredicateProxy, {
  drop: [ROLE.MANAGER],
  revoke: [
    "0x7e148a0B21c6b27a40C08E8F9C01E39312157DA9", "0x8a648dD2EC58f50240ccD1C164CB75535c569dF4",
    "0xe19227bc4dfBC589080893A8534F1E50423EA74b", "0x32c995dD6d3Dcf79CF22ad378447FCd55e33dB5A",
    "0x0bA26F57E80ece3e8e75e23dB701446acD7F2882", "0x0CE73ea67ab575B6621d9c643D458B32353B1851",
  ].map((a) => [ROLE.MANAGER, a]),
});
rotateRoles("2", "sepolia", "MintableERC721PredicateProxy", SEPOLIA.MintableERC721PredicateProxy, { drop: [ROLE.MANAGER] });
rotateRoles("2", "sepolia", "ERC1155PredicateProxy", SEPOLIA.ERC1155PredicateProxy, { drop: [ROLE.MANAGER] });
rotateRoles("2", "sepolia", "EtherPredicateProxy", SEPOLIA.EtherPredicateProxy, { drop: [ROLE.MANAGER] });

// Phase 3 — Puppynet live
transferProxyOwnership("3", "puppynet", "ChildChainManagerProxy", PUPPYNET.ChildChainManagerProxy);
transferOwnership("3", "puppynet", "ChildChain (owns native BONE 0x1010)", PUPPYNET.ChildChain);
for (const [sym, addr] of Object.entries(BRIDGED_CHILD_TOKENS)) rotateRoles("3", "puppynet", `child ${sym}`, addr);

// Phase 4 — test tokens, orphaned predicates, old deployments (all deployed by OLD, except the three LTD tokens)
for (const [name, addr] of Object.entries({
  "test BONE": "0xcA94c8B16209CCBAfCFeab9D7649DdaEcD444007", "test USDT": "0x0048ab82cce2aF4c36d2C6e8Bf7711b8615BE277",
  "TREAT #1": "0x1E9A62b48d11907817a4855eE98a9aaC2D04122b", "TREAT #2": "0x2dFd99a39afC32f9170a7980cfDad82Ad42c84Da",
  "unverified (deployed by OLD)": "0x2b699752956e3Bf4BfFee3C391F27bd451F6b928", PriorityQueue: "0x074A2c7a642B0e3062B865544eeafB8aa57A298f",
})) transferOwnership("4", "sepolia", name, addr);
transferClaimableOwnership("4", "sepolia", "test WBTC", "0xE950c7eA44A8cd9C0db01F3392Cb284DaA75b1A9");
for (const [name, addr] of Object.entries({
  "orphaned ERC20Predicate 0x75D2": "0x75D24C3104dd3D14221a75bd52D8c4eeB01C96eD",
  "orphaned ERC20Predicate 0x15dE": "0x15dE72A7E149276D700777f0F8aa13bC7f62bAa9",
  "orphaned ERC20Predicate 0x3DC3": "0x3DC3D6f2a59bfF94C46c1ECdF6aF871fc269583c",
})) rotateRoles("4", "sepolia", name, addr, { drop: [ROLE.MANAGER] });
rotateRoles("4", "sepolia", "DummyERC721", "0xA3Ae96D03F6876Ce4a8F8aE280d99c419A614CA4", { mirror: [ROLE.PREDICATE] });
rotateRoles("4", "sepolia", "DummyMintableERC721", "0xaF74CaEab5eABA260F56A20aB029DFE09a8b57D1", { mirror: [ROLE.PREDICATE] });

const OLD_CHILD_CHAIN_MANAGER = "0x074A2c7a642B0e3062B865544eeafB8aa57A298f"; // abandoned Puppynet deployment, no mappings
transferProxyOwnership("4", "puppynet", "old ChildChainManagerProxy", OLD_CHILD_CHAIN_MANAGER);
rotateRoles("4", "puppynet", "old ChildChainManagerProxy", OLD_CHILD_CHAIN_MANAGER, { mirror: [ROLE.MAPPER, ROLE.STATE_SYNCER] });
for (const [name, addr] of Object.entries({
  DummyERC20: "0x282704687674A2adeeBC572AE2947065a0C98607", DummyMintableERC20: "0x998A1Fb3380b81d3A008c2D7D027754750Bd7291",
  DummyERC721: "0xf4A7Ab6dC0A3400f21269E0187022582c3C99969", DummyMintableERC721: "0x76033046A292e53b96c77C574FEA36450fFBdA0F",
  DummyERC1155: "0x9f65025D9B3d39BE6eef28cc6B3C4b654A913c8A", DummyMintableERC1155: "0xC0568572887E9687D7b57c1fC83332F8d1d38A6a",
  DERC20: "0x3B482d68Fafb477Fd4d9E971911D1e1551807461", DMERC20: "0xB67afe6194D05Af68C013DE94632b7f3B6Bd7fD3",
  DERC721: "0x573efA23EE0dE433BF6f31fbAEfeB38C63FFdA4b", DMERC721: "0xf029EC373a049CEdE996CdEfD6f168B0321fA314",
  "LTD #1 (third-party deploy)": "0x0345AD80a840ac443C72b75e1A95BCc823c44E51",
  "LTD #2 (third-party deploy)": "0x8e7Ddc62eB9b16A8BaE6a01f4acD10238ea4898D",
  "LTD #3 (third-party deploy)": "0x5a197666e84525182481B8D846B732c6CD2A04d0",
  TSHIB: "0xE8Ab1AC7780A8D79Cf0EC4CB6912cc49A954A8ed",
})) rotateRoles("4", "puppynet", name, addr);
rotateRoles("4", "puppynet", "SDUMMY", "0x8E1B3Eccf9212c5d687AF4bE53Bf6C73d38c871B", { mirror: [ROLE.DEPOSITOR] });
rotateRoles("4", "puppynet", "TREAT", "0x8282aC2718273282117ea7294CDb1143C6aCA19A", { mirror: [ROLE.TREAT_CUSTOM] });
for (const [name, addr] of Object.entries({
  "proxy 0x2223 (deployed by OLD)": "0x2223964783E5b3083b12e209d0f6E77fA12545eD",
  "proxy 0x08e5 (deployed by OLD)": "0x08e56a2c48e5Bf503B77cA78dE78c66b8AdCfC2E",
  DEP: "0xAbe5638d73C6c56467F01Ae3B5C3deE9dA535ac3", randyom: "0x20890bFE581D6ffB91cC8e0C4C3fd4AFB09bcDF0",
})) transferOwnership("4", "puppynet", name, addr);

// Phase 5 — 80% of each known token; native coins are swept last (5n) so OLD keeps gas until the end
for (const chain of ["sepolia", "puppynet"]) {
  for (const [sym, addr] of Object.entries(KNOWN_TOKENS[chain])) sweepToken80("5", chain, sym, addr);
}

// Phase 6 — implementation contracts (hygiene: proxies run this code against their own storage)
for (const [name, addr] of Object.entries({
  "Governance impl (live)": "0xf029EC373a049CEdE996CdEfD6f168B0321fA314", "RootChain impl (live)": "0x4ED820A5EbE09D30e1f67052437e664abaAAd73C",
  "DepositManager impl (live)": "0x05959566bC0B4A743F36e0aF030C007e65a2141A", "WithdrawManager impl (live)": "0x873e4bBFA0B62D370AF5e50dAe7312CCca811Fcb",
  StakeManagerExtension: "0x0C477AE2E8E5ce1666468e44b066542Fa46f9F72", "ValidatorShare impl (live)": "0x52e1278Bf7abb27757Efc09Fd6881605Eb926D4A",
})) transferOwnership("6", "sepolia", name, addr);
for (const addr of [
  "0xc609F1043db4b59F526408AD2B376829Da1BEB1e", "0xa93BF082464c0649978f95fb151186AC02E95bDB", "0xBC3fe656bd509e04da7423a5aF397d54A888729B",
  "0xbbaCdE15F0D391FD4eFb50cc7C9d1E804D9567C6", "0xbc3f7225C261BF0B14A5aec5Bbd7A980e4C58602", "0xD525CcFf809b5d28E1850F1136D762d2938e8b55",
  "0x9d8f75082A90e08443305795618708E026398BA3", "0xC5E788a5958b66e5F74C4CDCd0072A8adb21613F", "0x3EAD01b866Dc6927fA14aE83c036FF4490Abd888",
  "0xF4cDb3027b34a9385911C71afB7FAac51CC32702", "0xb1abe2BdCF9C0f3312B988eF9c32b73F11283372", "0x1327601d54adC15032FBC180ad1e7E1Bc69102d3",
]) transferOwnership("6", "sepolia", "stale WithdrawManager impl", addr);
for (const addr of [
  "0x6B22a6D7267f0ced8DC6e5b828Fc51B229D08327", "0xeDE356b29974443E2ff739CAE0A2237D0C1c83B3", "0xB8806DBcEFe761D692e011e5dAdfF5c802B214e2",
  "0x489EAe32030B2D0073126AE8520ECcD2e81829AC", "0xB210305Fb5f268f56235b620eD6e7623a991101b", "0xc86f6ec9c455f65655B68B36359903277C3835C4",
  "0x74843FfE925c3D55eB49342f5174f1F7a7b6F5e4", "0x3Cc3eef3FE56A10caD68e23D510d0A8BaCB61d1D", "0xe19110B8C2750E527CeBDE06f5650b5A68B3d78c",
  "0x0D2E0b9C06B5Ac49bdAfe284Ecde2812f8868399", "0x4920deb90ce6d67b26899F61A4dC21C0F673cdF9",
]) transferOwnership("6", "sepolia", "stale ValidatorShare impl", addr);

sweepNative80("5n", "sepolia", "ETH");
sweepNative80("5n", "puppynet", "BONE");

// ---------------------------------------------------------------- chain access

function readEnv(key) {
  const env = fs.readFileSync(path.join(__dirname, "..", "..", ".env"), "utf8");
  const m = env.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\s]+)`, "m"));
  return m ? m[1] : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// null on revert; retries and then throws on transport errors
async function read(c, to, fn, args = [], from) {
  const data = iface.encodeFunctionData(fn, args);
  for (let attempt = 0; ; attempt++) {
    try {
      return iface.decodeFunctionResult(fn, await c.provider.call({ to, data, ...(from ? { from } : {}) }))[0];
    } catch (e) {
      if (e.code === "CALL_EXCEPTION" || e.code === "BAD_DATA") return null;
      if (attempt >= 4) throw e;
      await sleep(800 * (attempt + 1));
    }
  }
}

async function hasRole(c, to, role, who) {
  const v = await read(c, to, "hasRole", [role, who]);
  if (v === null) throw new Error(`${c.chain} ${to}: hasRole reverted`);
  return v;
}

async function connect(chain, mode) {
  const cfg = CHAINS[chain];
  // cacheTimeout -1: ethers otherwise serves identical reads from a 250ms cache, so a post-check could see pre-tx state
  const provider = new ethers.JsonRpcProvider(cfg.rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = mode === "fork" ? 250 : 3000;
  const { chainId } = await provider.getNetwork();
  if (chainId !== cfg.chainId) throw new Error(`${chain}: RPC chainId ${chainId}, expected ${cfg.chainId}`);
  let signer = null;
  let newSigner = null;
  if (mode === "fork") {
    await provider.send("anvil_impersonateAccount", [OLD]);
    await provider.send("anvil_impersonateAccount", [NEW]);
    signer = new ethers.JsonRpcSigner(provider, OLD);
    newSigner = new ethers.JsonRpcSigner(provider, NEW);
  } else if (mode === "live") {
    const pk = readEnv("PRIVATE_KEY");
    if (!pk) throw new Error("PRIVATE_KEY missing from .env");
    signer = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`, provider);
    if (signer.address !== OLD) throw new Error(`.env PRIVATE_KEY is ${signer.address}, expected OLD ${OLD}`);
  }
  return { chain, provider, signer, newSigner };
}

// Puppynet (Bor) enforces a minimum tip that ethers' default priority fee can miss; use a legacy price above eth_gasPrice.
async function feeOverrides(c) {
  if (c.chain !== "puppynet") return {};
  const gasPrice = BigInt(await c.provider.send("eth_gasPrice", []));
  return { type: 0, gasPrice: (gasPrice * 125n) / 100n };
}

// ---------------------------------------------------------------- commands

function plan() {
  for (const phase of PHASE_ORDER) {
    const s = steps.filter((x) => x.phase === phase);
    console.log(`\n=== Phase ${phase} (${s.length} steps)`);
    for (const x of s) console.log(`  ${x.id}  ${x.chain.padEnd(8)}  ${x.to}  ${x.name}  ::  ${x.action}`);
  }
  console.log(`\n${steps.length} steps. Inert (not transferable, unusable by anyone): ${INERT_STAKE_MANAGER_IMPLS.length} StakeManager implementations.`);
}

async function run(opts) {
  const mode = process.env.MODE;
  if (mode !== "fork" && mode !== "live") throw new Error("set MODE=fork or MODE=live");
  if (mode === "live" && process.env.CONFIRM !== "ROTATE-TESTNET-ADMIN") throw new Error("a live run needs CONFIRM=ROTATE-TESTNET-ADMIN");
  const phases = opts.phases || PHASE_ORDER;
  const chains = opts.chain ? [opts.chain] : Object.keys(CHAINS);
  const todo = PHASE_ORDER.filter((p) => phases.includes(p))
    .flatMap((p) => steps.filter((s) => s.phase === p && chains.includes(s.chain)));

  const ctx = {};
  for (const chain of new Set(todo.map((s) => s.chain))) ctx[chain] = await connect(chain, mode);
  for (const c of Object.values(ctx)) {
    if ((await c.provider.getCode(NEW)) !== "0x") throw new Error(`${c.chain}: NEW has contract code`);
    console.log(`${c.chain}: OLD native balance ${ethers.formatEther(await c.provider.getBalance(OLD))}`);
  }
  if (mode === "live" && ctx.sepolia && (await ctx.sepolia.provider.getTransactionCount(NEW)) < 1) {
    throw new Error("NEW has never sent a Sepolia transaction; prove control of NEW first");
  }

  fs.mkdirSync(OUT, { recursive: true });
  const statePath = path.join(OUT, `state-${mode}.json`);
  if (opts.fresh && fs.existsSync(statePath)) fs.unlinkSync(statePath);
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { done: {} };
  const saveState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  const logPath = path.join(OUT, `run-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
  const log = (o) => fs.appendFileSync(logPath, `${JSON.stringify(o)}\n`);

  let sent = 0;
  let skipped = 0;
  const forNew = [];
  for (const s of todo) {
    const c = ctx[s.chain];
    const tag = `[${s.id}] ${s.chain.padEnd(8)} ${s.name} :: ${s.action}`;
    const already = s.kind === "transfer" ? !!state.done[s.key] : await s.done(c);
    if (already) {
      console.log(`skip  ${tag}`);
      skipped++;
      continue;
    }
    let tx = { to: s.to, data: s.data || "0x" };
    let built = null;
    if (s.build) {
      built = await s.build(c);
      if (built.skip) {
        console.log(`none  ${tag} (${built.skip})`);
        state.done[s.key] = { skipped: built.skip };
        saveState();
        continue;
      }
      tx = { to: s.to, data: built.data || "0x", value: built.value || 0n };
    }
    const from = s.from === "NEW" ? NEW : OLD;
    try {
      await c.provider.call({ ...tx, from });
    } catch (e) {
      throw new Error(`dry-run reverted: ${tag}\n  ${e.shortMessage || e.message}`);
    }
    if (s.from === "NEW" && mode === "live") {
      console.log(`TODO  ${tag}\n      send from the NEW wallet: to=${s.to} data=${tx.data} value=0`);
      forNew.push({ chain: s.chain, to: s.to, data: tx.data, what: `${s.name} :: ${s.action}` });
      continue;
    }
    const signer = s.from === "NEW" ? c.newSigner : c.signer;
    const resp = await signer.sendTransaction({ ...tx, ...(await feeOverrides(c)) });
    const rc = await resp.wait(1);
    if (!rc || rc.status !== 1) throw new Error(`tx failed: ${tag} ${resp.hash}`);
    const ok = s.kind === "transfer" ? await s.after(c, built, rc) : await s.done(c);
    log({ id: s.id, chain: s.chain, name: s.name, to: s.to, action: s.action, hash: resp.hash, block: rc.blockNumber,
      gasUsed: rc.gasUsed.toString(), amount: built && built.amount !== undefined ? built.amount.toString() : undefined, postCheck: ok });
    if (s.kind === "transfer") {
      state.done[s.key] = { hash: resp.hash, amount: built.amount.toString() };
      saveState();
    }
    if (!ok) throw new Error(`post-check failed: ${tag} ${resp.hash}`);
    console.log(`sent  ${tag}  ${resp.hash}`);
    sent++;
  }
  console.log(`\n${sent} sent, ${skipped} skipped. Log: ${logPath}`);
  if (forNew.length) {
    console.log(`\n${forNew.length} transaction(s) must be signed by the NEW wallet:`);
    for (const t of forNew) console.log(`  ${t.chain}  to=${t.to}  data=${t.data}   (${t.what})`);
  }
}

// Dry-runs every pending step on its own against current state, so all blockers show up before anything is sent.
async function scan(opts) {
  const phases = opts.phases || PHASE_ORDER;
  const chains = opts.chain ? [opts.chain] : Object.keys(CHAINS);
  const todo = steps.filter((s) => phases.includes(s.phase) && chains.includes(s.chain));
  const ctx = {};
  for (const chain of new Set(todo.map((s) => s.chain))) ctx[chain] = await connect(chain, "read");
  const res = await pool(todo, 6, async (s) => {
    const c = ctx[s.chain];
    if (s.kind !== "transfer" && (await s.done(c))) return { s, status: "done" };
    // a NEW-signed claim can only succeed once OLD's nomination (the step before it) has landed
    if (s.from === "NEW" && !same(await read(c, s.to, "pendingOwner"), NEW)) return { s, status: "skip", why: "runs after OLD's nomination" };
    let tx = { to: s.to, data: s.data || "0x" };
    if (s.build) {
      const b = await s.build(c);
      if (b.skip) return { s, status: "skip", why: b.skip };
      tx = { to: s.to, data: b.data || "0x", value: b.value || 0n };
    }
    try {
      await c.provider.call({ ...tx, from: s.from === "NEW" ? NEW : OLD });
      return { s, status: "ok" };
    } catch (e) {
      return { s, status: "REVERT", why: e.shortMessage || e.message };
    }
  });
  const count = (st) => res.filter((r) => r.status === st).length;
  console.log(`${todo.length} steps: ${count("ok")} would succeed, ${count("done")} already done, ${count("skip")} skipped, ${count("REVERT")} revert`);
  for (const r of res.filter((x) => x.status === "skip")) console.log(`skip    [${r.s.id}] ${r.s.chain.padEnd(8)} ${r.s.name} (${r.why})`);
  for (const r of res.filter((x) => x.status === "REVERT")) console.log(`REVERT  [${r.s.id}] ${r.s.chain.padEnd(8)} ${r.s.to} ${r.s.name} :: ${r.s.action}\n        ${r.why}`);
  if (count("REVERT")) process.exitCode = 1;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

const pad32 = (a) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;

async function explorerLogs(chain, topic0) {
  const base = chain === "sepolia"
    ? `https://api.etherscan.io/v2/api?chainid=11155111&apikey=${readEnv("ETHERSCAN_API_KEY")}&`
    : "https://puppyscan.shib.io/api?";
  const url = `${base}module=logs&action=getLogs&fromBlock=0&toBlock=latest&topic0=${topic0}&topic0_2_opr=and&topic2=${pad32(OLD)}&page=1&offset=1000`;
  const j = await (await fetch(url)).json();
  if (!Array.isArray(j.result)) throw new Error(`${chain} explorer logs: ${JSON.stringify(j).slice(0, 160)}`);
  return j.result;
}

async function verify() {
  const ctx = { sepolia: await connect("sepolia", "read"), puppynet: await connect("puppynet", "read") };
  const results = [];
  const expect = (chain, what, ok, detail = "") => results.push({ chain, what, ok: !!ok, detail });

  // 1. end state of every planned step
  await pool(steps.filter((s) => s.kind !== "transfer"), 6, async (s) =>
    expect(s.chain, `${s.name} ${s.to} :: ${s.action}`, await s.done(ctx[s.chain])));

  // 2. the bridge still works the way it did
  const S = ctx.sepolia;
  const P = ctx.puppynet;
  const livePredicates = { ERC20: SEPOLIA.ERC20PredicateProxy, ERC721: SEPOLIA.ERC721PredicateProxy,
    MintableERC721: SEPOLIA.MintableERC721PredicateProxy, ERC1155: SEPOLIA.ERC1155PredicateProxy, Ether: SEPOLIA.EtherPredicateProxy };
  for (const [type, pred] of Object.entries(livePredicates)) {
    expect("sepolia", `invariant: RootChainManager.typeToPredicate(${type}) == ${pred}`,
      same(await read(S, SEPOLIA.RootChainManagerProxy, "typeToPredicate", [ethers.id(type)]), pred));
    expect("sepolia", `invariant: RootChainManagerProxy still MANAGER on ${type} predicate`,
      await hasRole(S, pred, ROLE.MANAGER, SEPOLIA.RootChainManagerProxy));
  }
  expect("sepolia", "invariant: RootChainManager.childChainManagerAddress == Puppynet ChildChainManagerProxy",
    same(await read(S, SEPOLIA.RootChainManagerProxy, "childChainManagerAddress"), PUPPYNET.ChildChainManagerProxy));
  expect("sepolia", "invariant: Registry.governance == GovernanceProxy", same(await read(S, SEPOLIA.Registry, "governance"), SEPOLIA.GovernanceProxy));
  expect("sepolia", "invariant: StakeManager onlyOwner now answers to NEW", await read(S, SEPOLIA.StakeManagerProxy, "isOwner", [], NEW));
  expect("sepolia", "invariant: StakeManager onlyOwner no longer answers to OLD", (await read(S, SEPOLIA.StakeManagerProxy, "isOwner", [], OLD)) === false);
  expect("sepolia", `untouched: ${ERC20_PREDICATE_PROXY_OWNER} still proxyOwner of live ERC20 predicate`,
    same(await read(S, SEPOLIA.ERC20PredicateProxy, "proxyOwner"), ERC20_PREDICATE_PROXY_OWNER));
  for (const [sym, addr] of Object.entries({ ...BRIDGED_CHILD_TOKENS, TREAT: "0x8282aC2718273282117ea7294CDb1143C6aCA19A" })) {
    expect("puppynet", `invariant: ChildChainManagerProxy still DEPOSITOR on child ${sym}`,
      await hasRole(P, A(addr), ROLE.DEPOSITOR, PUPPYNET.ChildChainManagerProxy));
  }
  expect("puppynet", "invariant: native BONE (0x1010) owner is still ChildChain", same(await read(P, PUPPYNET.BONE, "owner"), PUPPYNET.ChildChain));
  // ChildChainManagerV2 checks its own role mapping (different layout, no grant function), so OLD's legacy
  // AccessControl grants on this proxy are dead storage; prove it by OLD being refused an admin-only call.
  let oldCanPause = true;
  try {
    await P.provider.call({ to: PUPPYNET.ChildChainManagerProxy, data: iface.encodeFunctionData("pause", []), from: OLD });
  } catch (e) {
    oldCanPause = false;
  }
  expect("puppynet", "invariant: OLD is refused pause() on the live ChildChainManager (legacy role grants are dead)", !oldCanPause);

  // 3. rediscover everything OLD was ever granted (explorer logs) and confirm OLD holds none of it now
  for (const chain of ["sepolia", "puppynet"]) {
    const c = ctx[chain];
    try {
      const grants = await explorerLogs(chain, ethers.id("RoleGranted(bytes32,address,address)"));
      const pairs = [...new Map(grants.map((l) => [`${l.address.toLowerCase()}${l.topics[1]}`, [A(l.address), l.topics[1]]])).values()];
      await pool(pairs, 6, async ([addr, role]) => {
        if (chain === "puppynet" && addr === PUPPYNET.ChildChainManagerProxy) return; // covered by the pause() invariant
        try {
          expect(chain, `discovery: OLD no longer holds ${roleName(role)} on ${addr}`, !(await hasRole(c, addr, role, OLD)));
        } catch (e) {
          expect(chain, `discovery: could not read ${roleName(role)} on ${addr}`, false, e.message);
        }
      });
      const owned = [...new Set((await explorerLogs(chain, ethers.id("OwnershipTransferred(address,address)"))).map((l) => A(l.address)))];
      await pool(owned, 6, async (addr) => {
        const o = await read(c, addr, "owner");
        const po = await read(c, addr, "proxyOwner");
        if (chain === "sepolia" && INERT_STAKE_MANAGER_IMPLS.includes(addr) && same(o, OLD)) {
          return expect(chain, `discovery: ${addr} owner=OLD (inert StakeManager impl, expected)`, true);
        }
        expect(chain, `discovery: OLD is not owner/proxyOwner of ${addr}`, !same(o, OLD) && !same(po, OLD), `owner=${o} proxyOwner=${po}`);
      });
      expect(chain, `discovery: explorer returned ${grants.length} role grants and ${owned.length} ownership grants to check`, true);
    } catch (e) {
      expect(chain, "discovery via explorer logs", false, e.message);
    }
  }

  // 4. probe every address in the published address book for any owner / proxyOwner / standard role held by OLD
  const book = await (await fetch("https://raw.githubusercontent.com/shibaone/static/main/network/testnet/puppynet/index.json")).json();
  for (const [chain, section] of [["sepolia", book.Main], ["puppynet", book.puppynet]]) {
    const addrs = new Set();
    (function walk(o) {
      for (const v of Object.values(o)) {
        if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0xe{40}$/i.test(v)) addrs.add(A(v));
        else if (v && typeof v === "object") walk(v);
      }
    })(section);
    await pool([...addrs], 6, async (addr) => {
      if (chain === "sepolia" && INERT_STAKE_MANAGER_IMPLS.includes(addr)) return;
      const held = [];
      if (same(await read(ctx[chain], addr, "owner"), OLD)) held.push("owner");
      if (same(await read(ctx[chain], addr, "proxyOwner"), OLD)) held.push("proxyOwner");
      for (const [n, r] of Object.entries(ROLE)) if ((await read(ctx[chain], addr, "hasRole", [r, OLD])) === true) held.push(n);
      if (chain === "sepolia" && IMMUTABLE_OWNER_SEPOLIA.includes(addr) && held.join() === "owner") {
        return expect(chain, `KNOWN RISK: OLD remains owner (mint/burn) of test USDC ${addr}; contract has no transfer function`, true);
      }
      if (held.length) expect(chain, `address book: OLD still holds [${held}] on ${addr}`, false);
    });
    expect(chain, `address book: probed ${addrs.size} addresses for OLD`, true);
  }

  // 5. balances
  const bal = {};
  for (const chain of ["sepolia", "puppynet"]) {
    const c = ctx[chain];
    bal[chain] = { native: { OLD: ethers.formatEther(await c.provider.getBalance(OLD)), NEW: ethers.formatEther(await c.provider.getBalance(NEW)) } };
    for (const [sym, addr] of Object.entries(KNOWN_TOKENS[chain])) {
      const o = await read(c, A(addr), "balanceOf", [OLD]);
      const n = await read(c, A(addr), "balanceOf", [NEW]);
      if ((o && o > 0n) || (n && n > 0n)) bal[chain][sym] = { OLD: String(o), NEW: String(n) };
    }
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results.filter((x) => /^(invariant|untouched|KNOWN)/.test(x.what) || x.what.includes("probed") || x.what.includes("explorer returned"))) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.chain.padEnd(8)} ${r.what}`);
  }
  console.log("\nbalances (raw units):", JSON.stringify(bal, null, 1));
  console.log(`\n${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed`);
  for (const r of failed) console.log(`FAIL  ${r.chain.padEnd(8)} ${r.what} ${r.detail}`);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `verify-${process.env.SEPOLIA_RPC ? "custom-rpc" : "live"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify({ results, balances: bal }, null, 2));
  console.log(`report: ${file}`);
  if (failed.length) process.exitCode = 1;
}

// ---------------------------------------------------------------- cli

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--phases") opts.phases = rest[++i].split(",");
    else if (rest[i] === "--chain") opts.chain = rest[++i];
    else if (rest[i] === "--fresh") opts.fresh = true;
  }
  if (cmd === "plan") plan();
  else if (cmd === "run") await run(opts);
  else if (cmd === "scan") await scan(opts);
  else if (cmd === "verify") await verify();
  else console.log("usage: rotateTestnetAdmin.js plan | scan | run [--phases 1,2] [--chain sepolia|puppynet] [--fresh] | verify");
})().catch((e) => {
  console.error(`\nABORTED: ${e.message}`);
  process.exit(1);
});
