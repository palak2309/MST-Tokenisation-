# TokenEstate — Official 2.5-Minute Demo Video Script & Walkthrough

> **Hackathon Sprint:** MST Blockchain Buildathon (October 2026)  
> **Live App:** https://palak2309-mst-tokenisation.tokenestate-palak2309.workers.dev  
> **Explorer:** https://mstscan.com/ / https://testnet.mstscan.com/  
> **Target Duration:** 2 minutes 30 seconds

---

## Pre-Recording Checklist

1. **Browser Setup:**
   - Chrome / Brave browser with clean 1920x1080 resolution (100% scale).
   - [BridgeKey Wallet Extension](https://chromewebstore.google.com/detail/bridgekey/bfjojdcfenehemjgjlepdjomkpginlkg) installed and pinned in toolbar.
   - BridgeKey unlocked with Investor Account 3 (`0x120CdE3f7326C5689C8f7bE7163fD601b8C1DBc2`) or Admin Account 1.
2. **Network Setup:**
   - Pre-configure MST Mainnet (`Chain ID: 4646`, `RPC: https://mariorpc.mstblockchain.com/`).
   - Pre-configure MST Testnet (`Chain ID: 91562037`, `RPC: https://testnetrpc.mstblockchain.com`).
3. **Open Tabs:**
   - Tab 1: TokenEstate Live App (`https://palak2309-mst-tokenisation.tokenestate-palak2309.workers.dev`)
   - Tab 2: MSTScan Mainnet Token Contract (`https://mstscan.com/address/0x290120134219BA03C0ecd47fD35FeD6B10f03839`)
   - Tab 3: MSTScan Testnet Staking Contract (`https://testnet.mstscan.com/address/0xF779faDD8cf0B9c2d39140EFe7EEB0f63ea1737b`)

---

## Video Script & Storyboard (0:00 – 2:30)

### Scene 1: Introduction & Problem Context (0:00 – 0:25)
- **Visual:** TokenEstate Landing Page / Marketplace (`/`). Camera slowly pans over verified commercial property cards.
- **Narrator (Voiceover):**
  > *"Welcome to TokenEstate. Real estate is the world's largest asset class, valued at over 300 trillion dollars. Yet for everyday investors, it remains completely illiquid, capital-intensive, and prone to title fraud.  
  > Built natively on the MST Blockchain, TokenEstate bridges institutional real estate to Web3 through compliant ERC-1155 tokenisation, cryptographic deed fingerprinting, and non-custodial yield staking."*

---

### Scene 2: Property Due-Diligence & Cryptographic Deed Verification (0:25 – 0:50)
- **Visual:** Click on `"Commercial Tech Park, Tower A"` (`MST-DEMO-PUNE-002`). Open the Property Details modal. Highlight the Document Checklist and the SHA-256 fingerprint matching card.
- **Narrator (Voiceover):**
  > *"Every property on TokenEstate is anchored by immutable provenance. Here in Baner, Pune, our Commercial Tech Park features registered sale deeds, municipal property cards, and 7/12 land records.  
  > Documents are never uploaded to a centralized server. Instead, our client-side Web Crypto engine hashes them locally and verifies the exact 32-byte cryptographic fingerprint against the blockchain. If a single pixel or word is altered, the verification fails."*

---

### Scene 3: Web3 Wallet Connection & Network Isolation (0:50 – 1:10)
- **Visual:** Click **"Connect BridgeKey"** button in header. BridgeKey pop-up announces via EIP-6963 and connects Account 3. Switch between MST Testnet and MST Mainnet via the Network Switcher pill.
- **Narrator (Voiceover):**
  > *"TokenEstate integrates seamlessly with BridgeKey using EIP-6963 multi-provider discovery. Notice our strict dual-network architecture: when toggling between MST Testnet and MST Mainnet, contract addresses are completely isolated, ensuring test assets never bleed into production."*

---

### Scene 4: Compliant Demo Purchase Workflow (1:10 – 1:40)
- **Visual:** Click **"Buy Units"** on Property #1. The Purchase Modal opens. Show the Token ID (#1), total supply (1,500), unit price (₹1,000 reference), and quantity selector set to 10 units. Click **"Confirm Demo Purchase"**. BridgeKey signs the transaction.
- **Narrator (Voiceover):**
  > *"To demonstrate our issuance mechanism without regulatory hurdles or fiat payment gateways, we designed the Path B Demo Purchase workflow.  
  > The investor selects 10 units. The contract verifies their KYC eligibility on-chain and issues the units directly to their BridgeKey address. Notice that zero MST is transferred: it is an informational demo issuance that enforces supply caps and leaves secondary peer-to-peer trading safely disabled."*

---

### Scene 5: Investor Dashboard & Staking Vault (1:40 – 2:10)
- **Visual:** Navigate to `/staking`. Show the newly minted 10 units in the investor's balance. Click **"Approve Staking"**, then click **"Stake Units"** (0-day flexible duration). The card updates to show Staked Balance: 10 units. Click **"Unstake"** to demonstrate instant withdrawal.
- **Narrator (Voiceover):**
  > *"Tokenized units don't just sit idle. In our Staking Dashboard, investors can custody their property tokens into our audited `PropertyTokenStaking` vault.  
  > Our role-controlled staking exemption allows tokens to enter custody even while general secondary transfers are disabled. With flexible 0-day lock support, investors can deposit, accrue proportional yield from native rental pools, and withdraw their principal safely at any time."*

---

### Scene 6: MSTScan Block Explorer Verification & Conclusion (2:10 – 2:30)
- **Visual:** Switch to MSTScan explorer tab. Highlight the verified contract at `0x290120134219BA03C0ecd47fD35FeD6B10f03839`, the Token ID #1 registration transaction `0x6590cddda19e1f1f9a48bafee31fb9fd44f3b5b18807f1d997fbc87a9973f623`, and the 100% passing test suite in terminal.
- **Narrator (Voiceover):**
  > *"All operations are live, verified, and verifiable on MSTScan. With 461 automated tests passing, OpenZeppelin access controls, and full Cloudflare edge deployment, TokenEstate provides the blueprint for compliant Real World Asset tokenisation on MST Blockchain.  
  > Thank you, and verify before you invest."*

---

## Recording & Export Settings

- **Framerate:** 60 FPS or 30 FPS.
- **Resolution:** 1080p (1920x1080).
- **Format:** MP4 (H.264 / AAC).
- **Audio:** Crisp microphone, normalized to -14 LUFS.
