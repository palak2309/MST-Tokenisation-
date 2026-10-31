# TokenEstate — Final Hackathon Submission Dossier
### MST Blockchain MVP Build Sprint · October 2026

---

## 1. Project Overview

- **Project Name:** TokenEstate
- **Tagline:** Institutional-Grade On-Chain Real Estate Tokenisation, Title Provenance & Staking Protocol on MST Blockchain.
- **Track / Category:** Real World Assets (RWA) / DeFi Infrastructure / EVM Smart Contracts
- **Builder / Submitter:** Palak Pathan (`palakpathan23@gmail.com`)
- **Live Deployed Web Application:** [https://palak2309-mst-tokenisation.tokenestate-palak2309.workers.dev](https://palak2309-mst-tokenisation.tokenestate-palak2309.workers.dev)
- **Open-Source GitHub Repository:** [https://github.com/palak2309/MST-Tokenisation-](https://github.com/palak2309/MST-Tokenisation-)

---

## 2. Executive Summary (Short Description)

TokenEstate is an on-chain real estate tokenisation, document provenance, and fractional yield-staking platform built natively on the **MST Blockchain** (Chain ID: 4646). 

Using OpenZeppelin-standard ERC-1155 smart contracts (`PropertyToken.sol`) and audited custody staking vaults (`PropertyTokenStaking.sol`), TokenEstate enables commercial and residential properties to be fractionalized into transparent units while strictly maintaining regulatory compliance. 

Key innovations include:
1. **Client-Side SHA-256 Deed Verification:** Physical sale deeds and land records (7/12 extracts) are hashed locally in the browser and verified against on-chain fingerprints without central server exposure.
2. **Restricted Secondary Market Exemption:** General peer-to-peer transfers remain strictly disabled by default (`transfersEnabled = false`) to satisfy securities and KYC regulations, while authorized staking contracts receive role-granted exemptions for non-custodial yield deposits.
3. **Compliant Demo Purchase Mechanism:** Investors can self-mint demo property units on MST Mainnet with 0 MST payment transfer to test fractional allocations safely.
4. **EIP-6963 Multi-Wallet Integration:** Seamless connection to the official BridgeKey wallet across both MST Mainnet and Testnet.

---

## 3. Verified Smart Contract Addresses

### MST Mainnet (`Chain ID: 4646`, EVM Paris)
- **RPC URL:** `https://mariorpc.mstblockchain.com/`
- **Block Explorer:** `https://mstscan.com/`

| Contract | Address | Verification Status | Explorer Link |
|---|---|:---:|---|
| **PropertyToken (ERC-1155)** | `0x290120134219BA03C0ecd47fD35FeD6B10f03839` | **DEPLOYED & ACTIVE** | [MSTScan Address](https://mstscan.com/address/0x290120134219BA03C0ecd47fD35FeD6B10f03839) |
| **PropertyTokenStaking** | `0x57f775299ADF622adc729d0e8854A99d657717Aa` | **DEPLOYED & ACTIVE** | [MSTScan Address](https://mstscan.com/address/0x57f775299ADF622adc729d0e8854A99d657717Aa) |
| **PropertyDocumentRegistry** | `0x681Ef61D12372e040EE5f6e058932818aA29407F` | **DEPLOYED & ACTIVE** | [MSTScan Address](https://mstscan.com/address/0x681Ef61D12372e040EE5f6e058932818aA29407F) |

### MST Testnet (`Chain ID: 91562037`)
- **RPC URL:** `https://testnetrpc.mstblockchain.com`
- **Block Explorer:** `https://testnet.mstscan.com/`

| Contract | Address | Explorer Link |
|---|---|---|
| **PropertyToken** | `0xdBD6720855bE77A514E12Fca6D513Dda2A61466E` | [MSTScan Testnet](https://testnet.mstscan.com/address/0xdBD6720855bE77A514E12Fca6D513Dda2A61466E) |
| **PropertyTokenStaking** | `0xF779faDD8cf0B9c2d39140EFe7EEB0f63ea1737b` | [MSTScan Testnet](https://testnet.mstscan.com/address/0xF779faDD8cf0B9c2d39140EFe7EEB0f63ea1737b) |
| **PropertyDocumentRegistry** | `0x6883929b0A46dC2f301D294719954313b979dc14` | [MSTScan Testnet](https://testnet.mstscan.com/address/0x6883929b0A46dC2f301D294719954313b979dc14) |

---

## 4. Verified On-Chain Transaction Evidence

### MST Mainnet Transactions
1. **Account 3 Gas Funding Transfer (1.0 MST):**  
   Hash: [`0x9e449217036083ab77c61089682e87492751b89fcb7f58b8d8184bb1c761c7b5`](https://mstscan.com/tx/0x9e449217036083ab77c61089682e87492751b89fcb7f58b8d8184bb1c761c7b5)  
   Block: `#21792995` · Gas: `21,000` · Fee: `0.000021 MST` · Status: `SUCCESS`

2. **Transaction 1 — Grant ISSUER_ROLE to Account 1:**  
   Hash: [`0x58fa5ab4695e6c366eaab06dde04920d5ab8f31e293e71ee871e95cc455166a1`](https://mstscan.com/tx/0x58fa5ab4695e6c366eaab06dde04920d5ab8f31e293e71ee871e95cc455166a1)  
   Block: `#21795216` · Gas: `52,069` · Fee: `0.000052069 MST` · Status: `SUCCESS`

3. **Transaction 2 — Register Pune Property (`MST-DEMO-PUNE-002`, Token ID #1):**  
   Hash: [`0x6590cddda19e1f1f9a48bafee31fb9fd44f3b5b18807f1d997fbc87a9973f623`](https://mstscan.com/tx/0x6590cddda19e1f1f9a48bafee31fb9fd44f3b5b18807f1d997fbc87a9973f623)  
   Block: `#21795280` · Gas: `194,643` · Fee: `0.000194643 MST` · Status: `SUCCESS`  
   *Parameters:* maxSupply = `1,500`, unitPrice = `100,000 paise` (₹1,000), transfersEnabled = `false`.

4. **Transaction 3 — Deploy PropertyTokenStaking:**  
   Hash: [`0x48be2da40d4771d893b937379f143a841b21ebda69b884e03bc681fca9fa1c6b`](https://mstscan.com/tx/0x48be2da40d4771d893b937379f143a841b21ebda69b884e03bc681fca9fa1c6b)  
   Block: `#21798794` · Gas: `3,427,600` · Fee: `0.0034276 MST` · Status: `SUCCESS`  
   *Parameters:* propertyToken = `0x290120134219BA03C0ecd47fD35FeD6B10f03839`, admin = `0xEF9fE181ed6659096895bb54f71487B67E3b262b`.  
   *Address:* `0x57f775299ADF622adc729d0e8854A99d657717Aa` · *Bytecode:* `30,284` chars · Immutables & AccessControl verified on-chain.

### MST Testnet Full Lifecycle Transactions
1. **Property Token Issuance (10 units):**  
   [`0x6340e0110af64b3aeeaf8fa812ed446b6a0af9cb08cb95e9260aadf11f6acb63`](https://testnet.mstscan.com/tx/0x6340e0110af64b3aeeaf8fa812ed446b6a0af9cb08cb95e9260aadf11f6acb63)
2. **Staking Deposit (10 units, 0-day lock):**  
   [`0x8ea933e56c543d29f3700d1514fc487e3b9307f5cd852a437676db852c24fc67`](https://testnet.mstscan.com/tx/0x8ea933e56c543d29f3700d1514fc487e3b9307f5cd852a437676db852c24fc67)
3. **Unstaking Withdrawal (10 units):**  
   [`0x8f17c093bb38b43033e1f3dd1ceda2a62c77643c440324758fffeb54869ebb78`](https://testnet.mstscan.com/tx/0x8f17c093bb38b43033e1f3dd1ceda2a62c77643c440324758fffeb54869ebb78)

---

## 5. Sprint Requirements Verification Matrix

| Requirement | Implementation Detail | Status |
|---|---|:---:|
| **EVM Smart Contracts on MST** | Solidity 0.8.20, OpenZeppelin ERC-1155, AccessControl, Pausable, ReentrancyGuard | **PASS** |
| **Real World Asset Tokenisation** | Multi-token fractional real estate with legal deed SHA-256 fingerprint anchoring | **PASS** |
| **Regulatory Compliance Primitives** | Secondary transfers locked by default (`transfersEnabled = false`); KYC whitelist required | **PASS** |
| **Yield & Staking Architecture** | ERC1155Holder custody vault with flexible 0-day lock and native MST reward distribution | **PASS** |
| **Compliant Demo Purchases** | Informational self-minting for KYC investors without fiat gateway or MST token transfers | **PASS** |
| **EIP-6963 BridgeKey Wallet Support** | Direct integration with `io.bridgekey.wallet`, automatic provider discovery | **PASS** |
| **Dual-Network Isolation** | Mainnet (4646) and Testnet (91562037) address configs strictly separated; 0 address leaks | **PASS** |
| **Edge Deployment & Cloudflare SSR** | Cloudflare Workers + D1 database live deployment on workers.dev | **PASS** |
| **Automated Testing & Type Safety** | 461 Vitest unit/integration tests + 58 Hardhat mocha contract tests (100% passing) | **PASS** |

---

## 6. Testing & Code Quality Audit

- **Vitest Unit & Integration Suite:** `461 / 461 Passed` (38 test files, 100% pass rate).
- **Hardhat Smart Contract Suite:** `58 / 58 Passed` (Mocha, EVM local simulation).
- **TypeScript Static Typecheck (`tsc`):** `0 errors` (Strict mode).
- **ESLint Code Quality:** `0 errors` (Clean compliance).
- **Production Build (`vite build`):** `0 errors` (SSR client + Cloudflare Worker bundles generated).

---

## 7. Submission Checklist for Reviewer

- [x] Working Live Deployment on Cloudflare Workers
- [x] Complete Open-Source Repository on GitHub with full commit history
- [x] Verified On-Chain Transactions on MSTScan (Mainnet & Testnet)
- [x] Comprehensive Architectural Documentation in `README.md`
- [x] Detailed 2.5-minute Video Walkthrough Script in `DEMO_VIDEO_SCRIPT.md`
- [x] Zero Private Keys or Secrets in Git (Strict `.gitignore` enforcement)
- [x] Prepared Non-Interactive Scripts for Remaining Mainnet Transactions
