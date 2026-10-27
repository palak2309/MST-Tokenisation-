# Property Verification & Fractional Investment Platform

*Verify Before You Invest.* This student buildathon prototype demonstrates property-document fingerprinting and fractional-investment calculations. It is not a legal verification service or an investment marketplace.

## Project setup

Requirements: [Bun](https://bun.sh/) and a modern browser. Install and enable the [BridgeKey browser extension](https://chromewebstore.google.com/detail/bridgekey/bfjojdcfenehemjgjlepdjomkpginlkg) to connect a wallet or use live registry operations. Demo Mode runs without BridgeKey.

```powershell
bun install
bun run dev
```

Open the local URL reported by Vite. To use the supplied MST Testnet configuration, create a local environment file if you do not already have one:

```powershell
Copy-Item .env.example .env
```

If `.env` already exists, do not overwrite it; add or update the profile variables you need. The `.env.example` contains the project's supplied Testnet and Mainnet network values. Confirm the network, chain ID, contract deployment and explorer against official MST sources before using a wallet or sending a transaction. The frontend reads the `VITE_MST_*` values at build time; these are public configuration and must never contain private keys, seed phrases or other secrets. Local `.env` files are ignored by Git; keep `.env.example` as the safe configuration template.

For Demo Mode, run without a local `.env`, or leave `VITE_MST_CHAIN_ID` and `VITE_MST_CONTRACT_ADDRESS` empty in your local file. Simulated records are in-memory/session-only and labelled Simulated; they are not blockchain transactions.

## Local Solidity compile and tests

The Solidity contract uses Hardhat locally with compiler version `0.8.20`. Install the npm dependencies (including the pinned development-only Hardhat packages) and run:

```powershell
npm install
npm run compile:contract
npm run test:contract
```

These commands compile the contract and run its automated tests on Hardhat's local in-memory network. They do not connect to MST Testnet or Mainnet, use a wallet, or send transactions. Generated Hardhat artifacts and cache files are ignored by Git.

## Existing MST Testnet configuration

Choose one explicit profile by setting `VITE_MST_NETWORK` in your local `.env`. The tracked `.env.example` contains both profiles:

| Setting | Supplied value |
| --- | --- |
| Testnet chain ID | `91562037` |
| Testnet registry address | `0x6883929b0A46dC2f301D294719954313b979dc14` |
| Testnet RPC | `https://testnetrpc.mstblockchain.com` |
| Testnet explorer | `https://testnet.mstscan.com/` |
| Mainnet chain ID | `4646` |
| Mainnet registry address | **Not deployed/configured** |
| Mainnet RPC | `https://mariorpc.mstblockchain.com/` |
| Mainnet explorer | `https://mstscan.com/` |

The app uses the BridgeKey provider announced by EIP-6963 with the exact RDNS `io.bridgekey.wallet` for registry reads and writes. It never falls back to `window.ethereum` or another wallet. Network-specific settings are read from the matching `VITE_MST_TESTNET_*` or `VITE_MST_MAINNET_*` variables. The Testnet profile also accepts the prior generic `VITE_MST_*` variables for backward compatibility; those legacy variables are never used by Mainnet. The RPC URL is recorded in the selected profile, while current contract reads and writes use BridgeKey's provider.

When `VITE_MST_NETWORK=mainnet`, the app uses only the Mainnet chain ID, RPC URL, explorer and Mainnet contract-address variable. Because no Mainnet contract address is configured, live Mainnet registration and on-chain registry verification are disabled and the UI explains why. Document comparisons in Demo Mode remain clearly labelled as simulated. The Testnet address is never reused on Mainnet.

## How verification works

1. Install and enable BridgeKey, then choose **Connect BridgeKey**. The app discovers it through EIP-6963 and selects only a provider announcing RDNS `io.bridgekey.wallet`; if no such provider announces, the connection is rejected with an install/enable message.
2. Select the network matching `VITE_MST_NETWORK` manually in BridgeKey. For Testnet, select chain ID `91562037`; for Mainnet, select chain ID `4646`. The app checks the selected chain and does not switch networks automatically. Approve the account-access request in BridgeKey.
3. Select a property and document, then upload an allowed PDF or image (maximum 10 MB). The file is read locally in the browser and hashed as its raw bytes with Web Crypto SHA-256. The document itself is not uploaded.
4. **Register** submits the property ID and 32-byte SHA-256 fingerprint to the registry contract. A live write requires wallet confirmation and a successful transaction receipt. In Demo Mode, registration is simulated only and stored for the current session.
5. **Compare** checks the uploaded fingerprint against the selected reference fingerprint. A live “Match” requires valid identical SHA-256 fingerprints and an existing record for that fingerprint on the configured chain and property ID. A match proves byte-for-byte fingerprint equality only; it does not prove property ownership, document authenticity, or legal validity.

EIP-6963 metadata is used to select the provider, not to cryptographically prove the extension's authenticity. Never share a seed phrase or private key with the app or anyone else. If BridgeKey is missing, disabled, or does not announce the expected RDNS, the app will not connect to another wallet.

The contract stores the property ID, fingerprint, submitter and registration timestamp, not document contents. Registration is permissionless and first-write-only: it does not verify that a submitter owns or is authorized to represent a property, and a record cannot be replaced through this contract. The same browser SHA-256 helper is used by both verification and the on-chain registry panel.

## Feature status

### Implemented

- Responsive dashboard and property-verification experience.
- In-browser SHA-256 fingerprinting and file type/size checks.
- Fingerprint comparison against a registered reference, with Match, Mismatch or No Registered Reference results.
- Optional wallet connection, configured-chain checking, registry reads and document registration through `src/lib/blockchain.ts`.
- Solidity document registry in `contracts/PropertyDocumentRegistry.sol`.
- Due-diligence checklist, activity timeline, fractional-share calculator and rental-income calculator.

### Simulated

- Sample properties, documents, values and investors are fictional.
- Demo registrations, investment contributions and editable checklist/activity records are illustrative; Demo Mode records are not persisted on-chain.
- References with `DEMO-` prefixes are simulated identifiers, not transaction hashes.

### Unfinished / not established

- Official validation of the supplied MST Testnet chain settings and deployment at the supplied registry address.
- Mainnet contract deployment, public demo hosting and buildathon submission evidence.
- The prototype does not connect to government property records, confirm legal ownership, custody investment funds, issue tokenized shares or provide a live investment marketplace.

## Buildathon submission evidence

Do not treat placeholders below as deployment evidence. Replace them only with verified values when available.

- **MST Testnet transaction hash:** Not yet provided.
- **Testnet explorer transaction link:** Not yet provided. The configured explorer base is shown above; confirm it before linking any transaction.
- **Mainnet contract address:** Not deployed / not provided.
- **Mainnet explorer contract link:** Not available.
- **Public demo URL:** Not deployed / not provided.

Review the MST Buildathon 2.0 guide for its exact deliverables and deadlines. If required, remaining manual work includes verifying the official network configuration and wallet compatibility, deploying and verifying the contract using the prescribed process, making a real test transaction and capturing its explorer evidence, deploying a public demo, and documenting any required Mainnet deployment/address. No deployment, transaction, or publication has been performed by this project update.

## Mainnet deployment preparation

The Solidity source is `contracts/PropertyDocumentRegistry.sol`. A local Hardhat compile-and-test workflow and an opt-in MST Mainnet deployment script are provided. Solidity compiler version `0.8.20` is pinned in `hardhat.config.ts`. The deployment script refuses to run unless its Mainnet chain ID, RPC URL, and signer are configured, confirms the RPC-reported chain ID is `4646`, and requires the exact phrase `DEPLOY MST MAINNET` before sending. After a successful receipt, it checks that bytecode exists at the deployed address before printing the transaction hash and address.

### Mainnet deployment prerequisites — manual action only

**Do not run the deployment command until you are ready to send a real Mainnet transaction.** This project’s BridgeKey provider is injected into the browser; it is not available to a Node.js script. The deployment script therefore uses a separate, local deployer wallet through Hardhat’s `MST_MAINNET_PRIVATE_KEY` configuration variable. This is a private key, not a BridgeKey connection or signing request.

For safer key handling:

- Create a separate deployer wallet, not your primary wallet, and fund it only with the amount needed for deployment.
- Enter its private key only into the local terminal prompt below. It is held temporarily in the PowerShell process environment so Hardhat can sign; it is never saved in `.env`, a `VITE_*` variable, source code, or the repository. Environment variables are still accessible to processes running as your user, so close other untrusted processes and clear the variable after use.
- Never paste the key into chat, a README, source control, or a frontend environment variable. If you do not accept this signing method, do not run the deployment script; use a separately reviewed BridgeKey-compatible deployment tool instead.

First install dependencies and validate the source locally. These commands do not connect to MST:

```powershell
npm install
npm run compile:contract
npm run test:contract
```

Only when deliberately ready for the live deployment, run the following from the repository root in PowerShell. The RPC and chain ID are explicit; the script also checks the RPC's actual chain ID before it asks for confirmation.

```powershell
$env:MST_MAINNET_CHAIN_ID = '4646'
$env:MST_MAINNET_RPC_URL = 'https://mariorpc.mstblockchain.com/'
$secureKey = Read-Host 'Enter the dedicated deployer private key (input hidden)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:MST_MAINNET_PRIVATE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  npm run deploy:mainnet
} finally {
  Remove-Item Env:\MST_MAINNET_PRIVATE_KEY -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secureKey, pointer -ErrorAction SilentlyContinue
}
```

The script prompts for the exact text `DEPLOY MST MAINNET`; anything else cancels without sending. Do not execute it just to test setup. A successful deployment still requires you to independently verify the printed transaction and deployed bytecode on the official MST Mainnet explorer, then manually set `VITE_MST_MAINNET_CONTRACT_ADDRESS` in your local ignored `.env` to the verified address. The frontend Mainnet contract address remains blank until you complete that step. This workflow does not deploy to Testnet and never substitutes the Testnet contract address.

After deployment is complete and verified, set `VITE_MST_NETWORK=mainnet` and place the actual deployed address in the local, ignored `VITE_MST_MAINNET_CONTRACT_ADDRESS`. Do not copy the Testnet address into that setting. Keep `VITE_MST_MAINNET_CONTRACT_ADDRESS` empty until the real deployment is confirmed; registration and registry verification stay disabled while it is empty.

For local Mainnet preparation, add or set the following values in `.env` (preserve the existing Testnet values):

```dotenv
VITE_MST_NETWORK=mainnet
VITE_MST_MAINNET_NETWORK_NAME=MST Mainnet
VITE_MST_MAINNET_CHAIN_ID=4646
VITE_MST_MAINNET_RPC_URL=https://mariorpc.mstblockchain.com/
VITE_MST_MAINNET_EXPLORER_URL=https://mstscan.com/
VITE_MST_MAINNET_CONTRACT_ADDRESS=
```

Restart the development server after editing `.env`. With the address empty, Mainnet registration and on-chain lookup remain disabled.

- **MST Mainnet contract address:** Not deployed / not configured.
- **MST Mainnet deployment transaction hash:** Not available.

## Available checks

```powershell
bun run test
bun run lint
bunx tsc --noEmit
bun run build
```
