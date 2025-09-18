window.AppConfig = {
  /**
   * Address of the deployed NFTSwap contract.
   * Update this value after deploying to Avalanche Fuji or Mainnet.
   */
  contractAddress: "0xYourContractAddress", // TODO: replace with real contract address

  /**
   * Avalanche network configuration. By default the dApp targets the Fuji testnet.
   * Change these values if you deploy on mainnet.
   */
  targetChainId: 43113,
  chainParams: {
    chainId: "0xA869", // 43113
    chainName: "Avalanche Fuji",
    nativeCurrency: {
      name: "Avalanche",
      symbol: "AVAX",
      decimals: 18,
    },
    rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
    blockExplorerUrls: ["https://testnet.snowtrace.io"],
  },

  /**
   * Public RPC endpoint used for read-only operations when the wallet is not connected.
   */
  readRpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",

  /**
   * Earliest block to use when querying historical MultiSwapOfferCreated events.
   * Setting this close to your deployment block dramatically speeds up loading.
   */
  eventQueryStartBlock: 0,

  /**
   * Override the maximum number of NFTs per side displayed in the UI. The contract
   * enforces its own limit (currently 20) and this value is updated dynamically at runtime.
   */
  maxNftsPerSide: 20,
};
