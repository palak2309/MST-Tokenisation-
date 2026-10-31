# TokenEstate — On-Chain Real Estate Tokenisation & Staking Protocol
### MST Blockchain Buildathon MVP · Submission Ready

> **Live Application URL:** [https://palak2309-mst-tokenisation.tokenestate-palak2309.workers.dev](https://palak2309-mst-tokenisation.tokenestate-palak2309.workers.dev)  
> **GitHub Repository:** [https://github.com/palak2309/MST-Tokenisation-](https://github.com/palak2309/MST-Tokenisation-)  
> **MST Mainnet Chain ID:** `4646` (`0x1226`) · **MST Testnet Chain ID:** `91562037`

---

## 1. Executive Summary & Project Overview

**TokenEstate** is an institutional-grade on-chain real estate tokenisation, fractional investment, and yield-staking protocol built natively on the **MST Blockchain** (EVM-compatible Layer-1). 

Designed for regulatory compliance and fractional investor access, TokenEstate transforms high-value real property assets into transparent, divisible ERC-1155 digital unit tokens backed by cryptographic document fingerprints and governed by strict on-chain compliance controls.

### Core Value Proposition
- **Fractionalized Liquidity:** High-value commercial and residential real estate fractionalized into affordable units (e.g., ₹1,000 illustrative denomination).
- **Cryptographic Deed Provenance:** Property title deeds, 7/12 extracts, and encumbrance certificates are hashed via client-side Web Crypto SHA-256 and anchored immutably to on-chain tokens.
- **Role-Controlled Compliance:** Ordinary peer-to-peer secondary trading remains strictly disabled by default (`transfersEnabled = false`), preventing unauthorized or non-KYC secondary transfers.
- **Non-Custodial Staking & Yield Vaults:** Investors can custody property units into audited staking pools with flexible 0-day or locked durations, receiving pro-rata native MST yield payouts.
- **Compliant Demo Purchase Workflow:** Prospective investors can verify KYC eligibility and self-mint demo units on MST Mainnet without requiring real-money fiat payment gateways or native token transfers.

---

## 2. Problem Statement

1. **Illiquidity & High Capital Barriers:** Commercial and premium residential real estate require massive upfront capital, excluding 99% of retail investors from wealth-generating real estate yields.
2. **Title Fraud & Opaque Documentation:** Property buyers face forgeable paper deeds, multiple conflicting registrations, and lack of real-time provenance tracking.
3. **Regulatory Non-Compliance in Web3:** Most tokenisation projects issue unregulated permissionless ERC-20 tokens that violate securities laws, anti-money laundering (AML), and know-your-customer (KYC) standards.
4. **Lack of Staking Utility for Physical RWA:** Real-world assets placed on-chain often sit idle in wallets without native yield distribution or institutional custody primitives.

---

## 3. The TokenEstate Solution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             TOKENESTATE PROTOCOL                            │
└─────────────────────────────────────────────────────────────────────────────┘
          │                                                    │
          ▼                                                    ▼
┌───────────────────────────┐                        ┌────────────────────────┐
│  PropertyToken (ERC-1155) │                        │  PropertyTokenStaking  │
│  - Document Fingerprint   │  Authorized Custody    │  - 0-Day Flexible Lock │
│  - Whitelisted Investors  │ ──────────────────────►│  - Native MST Yield    │
│  - Restricted Secondary   │  Staking Exemption     │  - Pausable Safeguards │
└───────────────────────────┘                        └────────────────────────┘
          ▲                                                    ▲
          │                                                    │
┌───────────────────────────┐                        ┌────────────────────────┐
│  Client-Side SHA-256 Deed │                        │  BridgeKey Web3 Wallet │
│  Verification & Upload    │                        │  EIP-6963 Announce     │
└───────────────────────────┘                        └────────────────────────┘
```

1. **Path B Compliant Token Architecture:** Property units are issued via OpenZeppelin-standard ERC-1155 contracts (`PropertyToken.sol`) with granular roles (`DEFAULT_ADMIN_ROLE`, `ISSUER_ROLE`, `COMPLIANCE_ROLE`, `PAUSER_ROLE`).
2. **Role-Controlled Staking Exemption:** Even while secondary transfers remain globally disabled for compliance, authorized staking contracts hold a role-granted exemption allowing compliant staking and unstaking.
3. **Deterministic Deployments:** Clean deterministic CREATE contract derivations ensure exact address predictability across Mainnet and Testnet.
4. **Autonomous Dual-Network Support:** Seamless switching between MST Mainnet (Chain ID 4646) and MST Testnet (Chain ID 91562037), with zero address leakage.

---

## 4. Key Features

- **EIP-6963 Multi-Wallet Discovery:** Discovers and binds exclusively to the official **BridgeKey** browser extension (`io.bridgekey.wallet`).
- **Interactive Due-Diligence Checklist:** View and inspect deed status, mutation entries (Ferfar), 7/12 extract, city survey card, and litigation checks.
- **Live On-Chain Demo Purchase:** Whitelisted investors can connect BridgeKey, review unit price and available supply, and purchase units on MST Mainnet with 0 MST payment transfer.
- **Institutional Staking Vault:** Deposit tokenized property units into `PropertyTokenStaking`, lock for designated periods, earn native MST rewards, and unstake principal safely.
- **Circuit Breakers & Emergency Protections:** Dedicated `PAUSER_ROLE` can freeze operations instantly in an emergency, while emergency principal withdrawal protects investor funds.
- **Transparent Formula Calculators:** Real-time rental allocation and fractional investment calculators powered by deterministic financial math.

---

## 5. Technology Stack

- **Smart Contracts:** Solidity `0.8.20`, OpenZeppelin Contracts `v5.0.2` (ERC-1155, AccessControl, Pausable, ReentrancyGuard, ERC1155Holder).
- **Development & Testing:** Hardhat `v3.21.1`, Mocha, Chai Matchers, Ethers.js `v6.17.0`, Vitest `v4.1.11`.
- **Frontend & SSR Framework:** React 19, TanStack Start `1.168.60`, TanStack Router `1.170.41`, Vite 8, Tailwind CSS v4, Lucide React, Radix UI.
- **Edge Deployment & Serverless Backend:** Cloudflare Workers, Cloudflare D1 SQL Database, Wrangler `4.156.0`.
- **Blockchain Connectivity:** Native JSON-RPC to MST Mainnet and Testnet via BridgeKey Browser Extension.

---

## 6. Smart Contract Architecture

### 1. `PropertyToken.sol` (ERC-1155 Multi-Token Asset Registry)
- Holds property asset batches indexed by `uint256 tokenId`.
- Implements `purchaseDemoUnits(uint256 tokenId, uint256 amount)` for compliant demo self-minting.
- Implements `setStakingContractAuthorization(address, bool)` and `isAuthorizedStakingContract(address)` for role-governed transfer exemptions.
- Enforces supply caps (`maxSupply`) and caller whitelisting (`isEligibleInvestor`).

### 2. `PropertyTokenStaking.sol` (Yield Vault & Principal Custody)
- Safely holds property units using OpenZeppelin `ERC1155Holder`.
- Supports configurable pools per property via `configurePool(tokenId, minLock, maxLock, isEnabled)`.
- Calculates proportional reward payouts from funded native MST pools.
- Enforces strict compliance: staker must be eligible, staking vault must be authorized, and principal can be emergency-withdrawn even during paused conditions.

### 3. `PropertyDocumentRegistry.sol` (Provenance Anchoring)
- Permissionless, first-write-only registry storing `(propertyId, documentHash, submitter, timestamp)`.

---

## 7. Verified Contract Deployments

### MST Mainnet (Chain ID: `4646`)
- **RPC Endpoint:** `https://mariorpc.mstblockchain.com/`
- **Block Explorer:** `https://mstscan.com/`

| Contract | Mainnet Address | Deployment Status | Explorer Link |
|---|---|:---:|---|
| **PropertyToken** | `0x290120134219BA03C0ecd47fD35FeD6B10f03839` | **VERIFIED ON-CHAIN** | [View Contract](https://mstscan.com/address/0x290120134219BA03C0ecd47fD35FeD6B10f03839) |
| **PropertyTokenStaking** | `0x57f775299ADF622adc729d0e8854A99d657717Aa` | **VERIFIED ON-CHAIN** | [View Contract](https://mstscan.com/address/0x57f775299ADF622adc729d0e8854A99d657717Aa) |
| **PropertyDocumentRegistry** | `0x681Ef61D12372e040EE5f6e058932818aA29407F` | **VERIFIED ON-CHAIN** | [View Contract](https://mstscan.com/address/0x681Ef61D12372e040EE5f6e058932818aA29407F) |

### MST Testnet (Chain ID: `91562037`)
- **RPC Endpoint:** `https://testnetrpc.mstblockchain.com`
- **Block Explorer:** `https://testnet.mstscan.com/`

| Contract | Testnet Address | Explorer Link |
|---|---|---|
| **PropertyToken** | `0xdBD6720855bE77A514E12Fca6D513Dda2A61466E` | [View Contract](https://testnet.mstscan.com/address/0xdBD6720855bE77A514E12Fca6D513Dda2A61466E) |
| **PropertyTokenStaking** | `0xF779faDD8cf0B9c2d39140EFe7EEB0f63ea1737b` | [View Contract](https://testnet.mstscan.com/address/0xF779faDD8cf0B9c2d39140EFe7EEB0f63ea1737b) |
| **PropertyDocumentRegistry** | `0x6883929b0A46dC2f301D294719954313b979dc14` | [View Contract](https://testnet.mstscan.com/address/0x6883929b0A46dC2f301D294719954313b979dc14) |

---

## 8. Verified On-Chain Transaction Evidence

### MST Mainnet Verified Receipts
1. **Investor Funding Transfer (1.0 MST):**
   - Tx Hash: [`0x9e449217036083ab77c61089682e87492751b89fcb7f58b8d8184bb1c761c7b5`](https://mstscan.com/tx/0x9e449217036083ab77c61089682e87492751b89fcb7f58b8d8184bb1c761c7b5)
   - Block: `#21792995` · Gas: `21,000` · Fee: `0.000021 MST`
2. **Transaction 1 — Grant ISSUER_ROLE to Account 1:**
   - Tx Hash: [`0x58fa5ab4695e6c366eaab06dde04920d5ab8f31e293e71ee871e95cc455166a1`](https://mstscan.com/tx/0x58fa5ab4695e6c366eaab06dde04920d5ab8f31e293e71ee871e95cc455166a1)
   - Block: `#21795216` · Gas: `52,069` · Fee: `0.000052069 MST`
3. **Transaction 2 — Register Pune Commercial Tech Park (Token ID #1):**
   - Tx Hash: [`0x6590cddda19e1f1f9a48bafee31fb9fd44f3b5b18807f1d997fbc87a9973f623`](https://mstscan.com/tx/0x6590cddda19e1f1f9a48bafee31fb9fd44f3b5b18807f1d997fbc87a9973f623)
   - Block: `#21795280` · Gas: `194,643` · Fee: `0.000194643 MST`
   - Details: `MST-DEMO-PUNE-002`, maxSupply: 1,500, price: ₹1,000, transfersEnabled: false.
4. **Transaction 3 — Deploy PropertyTokenStaking:**
   - Tx Hash: [`0x48be2da40d4771d893b937379f143a841b21ebda69b884e03bc681fca9fa1c6b`](https://mstscan.com/tx/0x48be2da40d4771d893b937379f143a841b21ebda69b884e03bc681fca9fa1c6b)
   - Block: `#21798794` · Gas: `3,427,600` · Fee: `0.0034276 MST`
   - Details: Deployed at `0x57f775299ADF622adc729d0e8854A99d657717Aa`, underlying asset `0x290120134219BA03C0ecd47fD35FeD6B10f03839`.
5. **Transaction 4 — Authorize Staking Investor Eligibility:**
   - Tx Hash: [`0x643e87e02fa7c779105a1fbf640f4b2a29fd8a57f14d3dd66b7afdb8dd412fb3`](https://mstscan.com/tx/0x643e87e02fa7c779105a1fbf640f4b2a29fd8a57f14d3dd66b7afdb8dd412fb3)
   - Block: `#21798982` · Gas: `48,984` · Fee: `0.000048984 MST`
   - Details: `PropertyToken.setInvestorEligibility(0x57f775299ADF622adc729d0e8854A99d657717Aa, true)` verified.
6. **Transaction 5 — Authorize Staking Contract Exemption:**
   - Tx Hash: [`0xd3784e1d1942069079bc1f16a07b73eab601d8daac0352ac276ccf2a6dfb7a84`](https://mstscan.com/tx/0xd3784e1d1942069079bc1f16a07b73eab601d8daac0352ac276ccf2a6dfb7a84)
   - Block: `#21799107` · Gas: `49,005` · Fee: `0.000049005 MST`
   - Details: `PropertyToken.setStakingContractAuthorization(0x57f775299ADF622adc729d0e8854A99d657717Aa, true)` verified.
7. **Transaction 6 — Configure Staking Pool #1:**
   - Tx Hash: [`0x89ee2863d518bb8d9f97e08885bb8c22211d6c1c471a333272d76ecea112ba0b`](https://mstscan.com/tx/0x89ee2863d518bb8d9f97e08885bb8c22211d6c1c471a333272d76ecea112ba0b)
   - Block: `#21799256` · Gas: `50,500` · Fee: `0.0000505 MST`
   - Details: Token ID #1 pool active with minLock: 0s (0-day flexible), maxLock: 31,536,000s (365 days).
8. **Transaction 7 — Authorize Investor Account 3 Eligibility:**
   - Tx Hash: [`0xe6ac23e26bf1896188ac5ba09f53c60a72aa6c047e77a7a9fcefcb8ebde7c153`](https://mstscan.com/tx/0xe6ac23e26bf1896188ac5ba09f53c60a72aa6c047e77a7a9fcefcb8ebde7c153)
   - Block: `#21799311` · Gas: `48,984` · Fee: `0.000048984 MST`
   - Details: `PropertyToken.setInvestorEligibility(0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2, true)` verified.

### MST Testnet Verified Receipts
1. **Token Minting (10 Units):**
   - Tx Hash: [`0x6340e0110af64b3aeeaf8fa812ed446b6a0af9cb08cb95e9260aadf11f6acb63`](https://testnet.mstscan.com/tx/0x6340e0110af64b3aeeaf8fa812ed446b6a0af9cb08cb95e9260aadf11f6acb63)
2. **Staking Deposit (10 Units):**
   - Tx Hash: [`0x8ea933e56c543d29f3700d1514fc487e3b9307f5cd852a437676db852c24fc67`](https://testnet.mstscan.com/tx/0x8ea933e56c543d29f3700d1514fc487e3b9307f5cd852a437676db852c24fc67)
3. **Unstaking Withdrawal (10 Units):**
   - Tx Hash: [`0x8f17c093bb38b43033e1f3dd1ceda2a62c77643c440324758fffeb54869ebb78`](https://testnet.mstscan.com/tx/0x8f17c093bb38b43033e1f3dd1ceda2a62c77643c440324758fffeb54869ebb78)

---

## 9. Comprehensive Testing & Quality Assurance

Every layer of the protocol is backed by automated tests:

```bash
# Run 461 Frontend & Integration Tests
npm test

# Run 58 Solidity Mocha Smart Contract Tests
npx hardhat test --no-compile

# Run Static TypeScript Type Checks
npx tsc --noEmit

# Run ESLint Code Quality Inspection
npm run lint

# Compile Full SSR Production Build
npm run build
```

### Actual Audit Results (Zero Fabrications)
- **Vitest Unit & Integration Suite:** **461 / 461 Passed** (38 test suites, 0 failures).
- **Hardhat Mocha Contract Suite:** **58 / 58 Passed** (Path B staking, OpenZeppelin custody, eligibility, 0 failures).
- **TypeScript Compiler (`tsc`):** **Zero Type Errors** (`code 0`).
- **ESLint Linter:** **Zero Errors** (`0 errors`, 9 standard React refresh warnings).
- **Production SSR Build:** **100% Success** (`vite build` + `nitro` Cloudflare package).

---

## 10. Security & Compliance Architecture

- **Strict Access Control:** OpenZeppelin `AccessControl` isolates roles. Admin cannot mint; Issuer cannot bypass compliance; only Compliance can enable eligibility.
- **Transfers Disabled by Default:** Property units cannot be traded peer-to-peer on secondary markets (`transfersEnabled = false`), preventing non-compliant re-sales.
- **Reentrancy Guard:** Staking operations (`stake`, `unstake`, `claimRewards`) are guarded with OpenZeppelin `nonReentrant`.
- **Emergency Circuit Breaker:** Contract pausing (`whenNotPaused`) protects investor assets in abnormal conditions.
- **Secret Isolation:** Deployment credentials belong exclusively in local, git-ignored `.env` files. Private keys are never compiled into client builds, committed to Git, or exposed.

---

## 11. Known Limitations & Regulatory Disclaimers

1. **Student Buildathon / MVP Nature:** TokenEstate is a technology demonstration built for the MST Blockchain Build Sprint. It does not constitute a licensed securities offering, collective investment scheme, or escrow service.
2. **Demo Purchases:** The Mainnet "Buy Units" action self-mints illustrative demo units for protocol demonstration. No real-money fiat payment is received, no MST native payment is transferred, and no legal title deed conveyance takes place.
3. **Synthetic Fingerprints:** Sample property documents and deed hashes (e.g., `MST-DEMO-PUNE-002`) are synthetic test fingerprints illustrating document provenance architecture.

---

## 12. Submission Contacts & Links

- **Live URL:** [https://palak2309-mst-tokenisation.tokenestate-palak2309.workers.dev](https://palak2309-mst-tokenisation.tokenestate-palak2309.workers.dev)
- **GitHub Repo:** [https://github.com/palak2309/MST-Tokenisation-](https://github.com/palak2309/MST-Tokenisation-)
- **Author & Builder:** Palak Pathan (`palakpathan23@gmail.com`)
