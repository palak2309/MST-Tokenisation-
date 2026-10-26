# Property Verification & Fractional Investment Platform

*Verify Before You Invest.* — a student blockchain buildathon prototype. Not a legal verification service or investment marketplace.

## Run
```
bun install
bun run dev
bunx vitest run   # formula tests
```
Works fully in **Demo Mode** with fictional data — no wallet, database or chain required.

## Pages
Dashboard · Property Verification · Fractional Investment · Rental Income Calculator · Blockchain Activity · About the Prototype

## Implemented
- In-browser SHA-256 hashing (Web Crypto), file type/size validation (PDF/PNG/JPG/WEBP, 10 MB)
- Hash comparison: Match / Mismatch / No Registered Reference
- Due-diligence checklist with editable statuses, activity timeline
- Fractional share (`contribution / pool`) and units calculator
- Rental calculator (`net = gross − operating − maintenance − vacancy`; `allocation = net × share`)
- MetaMask connection via ethers.js; `src/lib/blockchain.ts` service with submit/pending/success/error states
- Solidity contract `contracts/PropertyDocumentRegistry.sol` (emits `DocumentRegistered`)

## Simulated
- All properties, documents, values, investors
- Registrations and contributions in Demo Mode (in-memory, labelled “Simulated”, refs `DEMO-xxxx`)

## Going live on MST testnet
1. Verify the official MST network config, wallet compatibility, testnet, faucet and explorer.
2. Compile/test/deploy the contract with Hardhat (`npx hardhat init`, copy the contract into `contracts/`). Keep deployer keys in Hardhat env only.
3. Copy `.env.example` to `.env`. The supplied MST chain ID, registry address, and explorer are prefilled; verify these values before using a real transaction. The app uses the connected browser wallet for reads and writes, and enables live registry access when the chain ID and contract address are set. No RPC URL is required.

No network parameters, addresses or transaction hashes are invented in this codebase.
