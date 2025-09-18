# W3Bscrow NFT Swap DApp

A lightweight front-end for the `NFTSwap` smart contract that lets collectors create
and accept NFT escrow trades on Avalanche (Fuji testnet by default). The UI is built
with vanilla HTML/CSS/JavaScript and uses Ethers.js to talk to the blockchain.

## Features

- Connect with MetaMask (or any EIP-1193 wallet) on Avalanche
- Create multi-NFT escrow offers (up to the contract limit per side)
- View live on-chain offers by querying `MultiSwapOfferCreated` events
- Accept or cancel offers directly from the browser
- Automatic handling of the escrow fee and contract limits

## Prerequisites

1. Deploy `NFTSwap.sol` to Avalanche Fuji or Mainnet and note the contract address.
2. Update [`frontend/config.js`](frontend/config.js) with:
   - `contractAddress`: the deployed contract address
   - `targetChainId` and `chainParams`: switch to `43114`/Avalanche Mainnet if needed
   - `readRpcUrl` and `eventQueryStartBlock`: RPC endpoint and the deployment block
3. Add the selected Avalanche network to MetaMask if it isn't already present.

## Running the dApp locally

The front-end is a static site, so any static file server works. Example using Node:

```bash
cd frontend
npx serve .
# or: npx http-server -c-1
```

You can also use Python's built-in server:

```bash
cd frontend
python -m http.server 4173
```

Then open the reported URL (e.g. `http://localhost:4173`) in a browser with MetaMask
installed. Connect your wallet, make sure you're on the configured Avalanche network,
and interact with the contract.

## Project structure

```
frontend/
├── abi/NFTSwap.json     # Contract ABI (trimmed to the methods/events used by the UI)
├── app.js               # Ethers.js powered logic and UI rendering
├── config.js            # Network and contract configuration
├── index.html           # Main HTML shell
└── styles.css           # Styling for the dashboard
```

## Notes

- The UI queries past `MultiSwapOfferCreated` events starting from
  `eventQueryStartBlock`. Set this close to your deployment block to keep loading
  fast.
- The escrow fee is read from the contract, so updates on-chain are reflected in the
  UI without code changes.
- Only the contract creator can cancel their offer; ensure the connected account
  matches the on-chain creator when attempting to cancel.
