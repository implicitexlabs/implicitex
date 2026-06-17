/* ============================================================
   ImplicitEx — news-data.js
   Canonical article store. Loaded by index.html (last 3
   preview cards) and news.html (full article listing).

   Ordering: oldest first. The homepage slice takes the last
   N entries so new articles go at the bottom of this array.

   Article schema:
     id        – URL-safe slug used as anchor on news.html
     date      – human-readable display date
     dateIso   – YYYY-MM-DD for <time> datetime attribute
     category  – Platform | Policy | Regulation | Opinion | Analysis
     title     – article headline
     lede      – first paragraph shown in the preview card
     body      – array of paragraph strings (full article body,
                 including the lede as the first entry)
   ============================================================ */

var IX_NEWS = [

  {
    id:       'soft-launch-june-2026',
    date:     'June 2, 2026',
    dateIso:  '2026-06-02',
    category: 'Platform',
    title:    'Live transfer smoke complete',
    lede:     'ImplicitEx transfer execution is live on Polygon mainnet under a limited soft-launch scope. The hardened contract has been deployed, source-verified, and smoke-tested on-chain with real USDC.',
    body: [
      'ImplicitEx transfer execution is live on Polygon mainnet under a limited soft-launch scope. The hardened contract has been deployed, source-verified, and smoke-tested on-chain with real USDC.',
      'Current launch controls: 1% platform fee, 250 USDC soft-launch cap, non-custodial wallet execution, and continued production readiness review. No custody. No escrow. Funds move directly between wallets.'
    ]
  },

  /* ── Add new articles below this line, oldest → newest ── */

  {
    id:       'genius-act-treasury-reserves',
    date:     'June 17, 2026',
    dateIso:  '2026-06-17',
    category: 'Policy',
    title:    'Why short-term Treasury reserves matter for payment stablecoins',
    lede:     'Stablecoins are often described in simple terms: digital dollars moving across a blockchain. That description is useful, but incomplete. The more important question is what makes a digital dollar credible when someone receives it, holds it, or sends it again.',
    body: [
      'Stablecoins are often described in simple terms: digital dollars moving across a blockchain. That description is useful, but incomplete. The more important question is what makes a digital dollar credible when someone receives it, holds it, or sends it again.',
      'The GENIUS Act gives that question a more formal structure. It defines a payment stablecoin as a digital asset designed for payment or settlement, where the issuer is obligated to convert, redeem, or repurchase it for a fixed amount of monetary value and represents that it will maintain a stable value relative to that amount. In plain language, a payment stablecoin is not just a token with a familiar name. It is a token whose usefulness depends on redemption expectations, reserve discipline, and user confidence. [GENIUS Act \u00a7 2(22)]',
      'That is where reserve quality matters.',
      'Under the Act, a permitted payment stablecoin issuer must maintain identifiable reserves backing outstanding payment stablecoins on at least a 1-to-1 basis. The permitted reserve categories include U.S. coins and currency, money standing to the credit of an account with a Federal Reserve Bank, demand deposits at insured depository institutions, and short-duration U.S. Treasury bills, notes, or bonds. For Treasury securities, the Act focuses on short maturity: Treasury bills, notes, or bonds with a remaining maturity of 93 days or less, or issued with a maturity of 93 days or less. [GENIUS Act \u00a7 4(a)(1)(A)]',
      'That short-duration requirement is not an arbitrary technical detail. Longer-duration assets can fluctuate more sharply when interest rates change. Short-term Treasury instruments are generally easier to value, easier to sell, and closer to cash in practical liquidity terms. For a payment stablecoin, that matters because users are not buying a long-term investment product; they are using a token that is meant to function as a payment and settlement instrument.',
      'The Act also recognizes that reserves are not enough if users cannot see what backs the system. Permitted issuers must publicly disclose redemption policies, including clear procedures for timely redemption and plain-language disclosure of fees associated with purchasing or redeeming payment stablecoins. Fee changes require at least seven days\u2019 prior notice to consumers. [GENIUS Act \u00a7 4(a)(1)(B)]',
      'The disclosure requirement goes further. Issuers must publish monthly reserve composition information on their website, including the total number of outstanding payment stablecoins and the amount and composition of reserves, including average tenor and geographic custody location for each reserve category. [GENIUS Act \u00a7 4(a)(1)(C)]',
      'That is a meaningful shift from \u201ctrust us\u201d toward \u201cshow the structure.\u201d A stablecoin ecosystem becomes more reliable when users, developers, businesses, and regulators can reason about reserve composition, redemption obligations, and liquidity.',
      'The Act also limits what issuers can do with those reserves. Required reserves may not be pledged, rehypothecated, or reused except in limited circumstances, including certain liquidity operations designed to meet reasonable expectations of redemption requests. [GENIUS Act \u00a7 4(a)(2)] That point matters because the stability of a payment token is weakened when the assets backing it are reused in ways users cannot easily evaluate.',
      'Monthly certification adds another layer. The Act requires monthly examination of reserve report information by a registered public accounting firm, and the chief executive officer and chief financial officer must certify the accuracy of monthly reports to the relevant regulator. False certifications carry criminal-penalty exposure. [GENIUS Act \u00a7 4(a)(3)]',
      'For users, the practical lesson is simple: the future of payment stablecoins will not be built only on speed, fees, or branding. It will depend on reserve quality, redemption discipline, transparency, and operational reliability.',
      'That context is directly relevant to USDC transfer tools. A non-custodial interface does not issue USDC and does not custody the user\u2019s funds. But it can help users interact with USDC in a way that is clear, deliberate, and verifiable. The interface can show the sender, recipient, network, fee, estimated gas, token contract, and transaction state before the wallet is asked to approve anything.',
      'That is the lane ImplicitEx is focused on: not issuing the asset, not holding customer funds, and not asking users to trust an opaque middle layer. The goal is to provide a careful transaction workspace around wallet-to-wallet USDC transfers.',
      'Short-term Treasury reserves help explain why regulated payment stablecoins can become more stable and more useful. Clear, non-custodial transfer tools help explain how people may actually use them.',
      'Source: Public Law 119-27, Guiding and Establishing National Innovation for U.S. Stablecoins Act (GENIUS Act).'
    ]
  },

  {
    id:       'value-transfer-non-custodial-role',
    date:     'June 17, 2026',
    dateIso:  '2026-06-17',
    category: 'Analysis',
    title:    'Value transfer still matters: why non-custodial USDC tools have a real role',
    lede:     'Every economy depends on value transfer. Workers send money to family. Contractors get paid across borders. Friends split expenses. Small businesses pay vendors. Digital creators receive support from audiences they may never meet in person.',
    body: [
      'Every economy depends on value transfer. Workers send money to family. Contractors get paid across borders. Friends split expenses. Small businesses pay vendors. Digital creators receive support from audiences they may never meet in person.',
      'The rails behind those transfers have changed many times. Cash, checks, bank wires, card networks, payment apps, and digital wallets all solve the same basic problem: one person wants to move value to another person with enough speed, confidence, and evidence that both sides can understand what happened.',
      'Payment stablecoins are part of that larger story.',
      'The GENIUS Act defines a payment stablecoin as a digital asset designed for payment or settlement, where the issuer is obligated to convert, redeem, or repurchase it for a fixed amount of monetary value and represents that it will maintain a stable value relative to that fixed amount. [GENIUS Act \u00a7 2(22)] That definition matters because it frames stablecoins less as speculative crypto assets and more as settlement instruments.',
      'The Act also defines a digital asset as a digital representation of value recorded on a cryptographically secured distributed ledger. [GENIUS Act \u00a7 2(6)] In practical terms, that means the record of movement exists on shared infrastructure, not inside a private spreadsheet controlled by a single app. That does not eliminate risk, but it changes the user\u2019s relationship to transaction evidence.',
      'For wallet-to-wallet transfer, the most important design principle is control. The Act\u2019s construction around direct transfers and self-custody is notable. It states that certain provisions do not apply to the direct transfer of digital assets between two individuals acting on their own behalf and for their own lawful purposes, without an intermediary. It also addresses transactions made by means of software or hardware wallets that facilitate an individual\u2019s own custody of digital assets. [GENIUS Act \u00a7 3(h)(1)]',
      'That is the practical space non-custodial tools occupy. A non-custodial interface should not take possession of funds. It should not hide the recipient address. It should not blur the difference between preview, approval, and final transfer. It should help the user understand the transaction before the wallet is asked to sign.',
      'ImplicitEx is being developed around that model.',
      'The platform\u2019s purpose is narrow: provide a clear, direct, technical interface for USDC wallet-to-wallet transfers. The sender remains in control of the wallet. The recipient address is shown before submission. The fee is presented before confirmation. The network is identified. The tool distinguishes wallet authorization from actual fund movement. Approval alone does not send funds; the transfer step is separate.',
      'That separation matters. A trustworthy transfer interface should reduce uncertainty rather than create pressure. Users should be able to open the Transfer Portal, inspect how the tool works, and understand the flow before connecting a wallet. Connecting a wallet should be a deliberate authorization step. Submitting a transfer should be a separate action with transaction context.',
      'The GENIUS Act also makes clear that payment stablecoin issuers operate inside a broader compliance environment. Permitted payment stablecoin issuers are treated as financial institutions for Bank Secrecy Act purposes and are subject to laws relating to sanctions, anti-money laundering, customer identification, due diligence, suspicious-transaction monitoring, and technological capabilities to block, freeze, or reject impermissible transactions. [GENIUS Act \u00a7 4(a)(5)]',
      'For users, that means stablecoin transfers are not a lawless parallel universe. The industry is moving toward a framework where issuers, service providers, wallets, and interfaces each have different roles. Issuers are responsible for reserve backing, redemption policies, disclosures, and compliance. Wallets help users custody and authorize assets. Interfaces like ImplicitEx focus on the transaction experience: clarity, preview discipline, route safety, and evidence.',
      'That is a modest role, but an important one.',
      'As stablecoins become more regulated and more familiar, the quality of the interface layer will matter. People do not only need assets that are stable. They need transfer tools that are understandable. They need to know when they are previewing, when they are approving, when funds have moved, and what evidence remains after the transaction is complete.',
      'ImplicitEx is being built for that layer: non-custodial, direct, transparent USDC transfer. The long-term roadmap includes embedded transfer widgets, tools for developers building payment-aware applications, and additional services\u2014but the first principle remains simple: make wallet-to-wallet value transfer clearer, safer, and easier to verify.',
      'Source: Public Law 119-27, Guiding and Establishing National Innovation for U.S. Stablecoins Act (GENIUS Act).'
    ]
  },

  {
    id:       'what-non-custodial-means',
    date:     'June 17, 2026',
    dateIso:  '2026-06-17',
    category: 'Platform',
    title:    'What non-custodial means in a stablecoin transfer interface',
    lede:     'Non-custodial is a word that gets used a lot in crypto. It is worth being precise about what it means in practice, and what it means specifically for a USDC transfer interface.',
    body: [
      'Non-custodial is a word that gets used a lot in crypto. It is worth being precise about what it means in practice, and what it means specifically for a USDC transfer interface.',
      'Custody, in a financial context, means holding an asset on behalf of someone else. A custodial exchange holds your funds. A custodial wallet provider stores your keys. When you transfer funds through a custodial service, you are giving that service temporary or ongoing control of your assets.',
      'Non-custodial means the opposite: the platform never holds your funds. Your wallet remains under your control. The private keys that authorize transactions stay in your wallet\u2014on your device, in MetaMask, or in whatever signing environment you use. The interface can present, route, and confirm transaction details, but it cannot move your funds without your explicit wallet-level authorization.',
      'That distinction has real consequences.',
      'In a custodial system, if the platform is compromised, frozen, or insolvent, your funds are at risk. You are a creditor, not a holder. In a non-custodial system, platform risk is separate from asset risk. The interface can go down. The platform can change. None of that affects assets sitting in your wallet.',
      'The GENIUS Act draws a similar line. It explicitly distinguishes between activities that constitute issuing or offering payment stablecoins and direct individual transfers. The Act states that certain provisions do not apply to the direct transfer of digital assets between two individuals acting on their own behalf and for their own lawful purposes, without an intermediary. [GENIUS Act \u00a7 3(h)(1)] Non-custodial transfer tools sit closer to that direct-transfer model than to issuer or custodian models.',
      'ImplicitEx is designed around this principle. The platform does not hold user funds at any point in the transaction flow. When you enter a recipient address and an amount, that information is used to construct a transaction for your review. When you click to approve, your wallet\u2014not ImplicitEx\u2014signs and broadcasts the transaction. When the transfer completes, the USDC moves directly from your wallet to the recipient\u2019s wallet. The recipient amount, the 1% platform fee, and the estimated Polygon network gas cost are shown before submission. The platform fee is part of the USDC transfer calculation; network gas is paid separately by the sender\u2019s wallet in MATIC.',
      'The Transfer Portal is designed to make this flow visible. You can open it while disconnected and inspect the interface before committing to connect a wallet. Connecting a wallet is a separate, explicit step. The wallet authorization step\u2014approving the USDC spending allowance\u2014is separate from the transfer execution step. Two wallet confirmations, two distinct user intents.',
      'This two-step model exists because approval and transfer are meaningfully different actions. Approval says: this contract is permitted to move up to this amount of my USDC. Transfer says: execute this specific movement now. Collapsing those into a single click would be faster, but it would hide a distinction that users deserve to understand.',
      'Receipt evidence is also non-custodial by design. After a transfer, the transaction hash, sender, recipient, amount, fee, and block confirmation are stored locally in your browser\u2019s localStorage. No account required. No server-side record. The on-chain transaction is the authoritative record; the local receipt is a convenience layer for your own reference.',
      'ImplicitEx does not issue USDC, does not set monetary policy, and does not determine reserve composition. Those are responsibilities that fall to Circle as the issuer, governed by frameworks like the GENIUS Act. What ImplicitEx provides is a careful interface around the transfer step: the moment between holding USDC and sending it to someone else.',
      'Building that interface with non-custodial principles is not just a technical choice. It is a position on what a transfer tool should and should not do. The platform should make the transaction clear, not capture the asset. It should serve the user\u2019s intent, not intermediate their funds.',
      'Source: Public Law 119-27, Guiding and Establishing National Innovation for U.S. Stablecoins Act (GENIUS Act).'
    ]
  }

];
