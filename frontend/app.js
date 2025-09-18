(() => {
  const { ethers } = window;
  if (!ethers) {
    console.error('Ethers.js failed to load.');
    return;
  }

  const { utils, providers, Contract, BigNumber } = ethers;
  const AppConfig = window.AppConfig || {};

  const state = {
    abi: null,
    account: null,
    provider: null,
    signer: null,
    contract: null,
    readProvider: null,
    readContract: null,
    nftLimit: AppConfig.maxNftsPerSide || 20,
    offers: [],
    cachedFee: null,
    refreshing: false,
    listenersRegistered: false,
  };

  const elements = {
    connectButton: document.getElementById('connectWallet'),
    accountDisplay: document.getElementById('accountDisplay'),
    networkDisplay: document.getElementById('networkDisplay'),
    contractAddress: document.getElementById('contractAddress'),
    copyContract: document.getElementById('copyContract'),
    feeDisplay: document.getElementById('feeDisplay'),
    nftLimit: document.getElementById('nftLimit'),
    createOfferForm: document.getElementById('createOfferForm'),
    durationHours: document.getElementById('durationHours'),
    offerNFTs: document.getElementById('offerNFTs'),
    requestNFTs: document.getElementById('requestNFTs'),
    offersList: document.getElementById('offersList'),
    refreshOffers: document.getElementById('refreshOffers'),
    toast: document.getElementById('toast'),
  };

  const walletHandlers = {
    accountsChanged: null,
    chainChanged: null,
  };

  async function initialize() {
    await loadAbi();
    setupForm();
    setupButtons();
    updateContractInfo();
    await setupReadContract();
    await refreshOffers();
  }

  async function loadAbi() {
    try {
      const response = await fetch('abi/NFTSwap.json');
      if (!response.ok) {
        throw new Error('Failed to load contract ABI');
      }
      state.abi = await response.json();
    } catch (err) {
      showToast(err.message || 'Unable to load contract ABI', 'error');
      throw err;
    }
  }

  function setupForm() {
    addNftRow('offerNFTs');
    addNftRow('requestNFTs');

    elements.createOfferForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await handleCreateOffer();
    });

    document.querySelectorAll('.add-row').forEach((button) => {
      button.addEventListener('click', () => addNftRow(button.dataset.target));
    });
  }

  function setupButtons() {
    elements.connectButton.addEventListener('click', connectWallet);
    elements.refreshOffers.addEventListener('click', () => refreshOffers(true));
    elements.copyContract.addEventListener('click', handleCopyContract);
  }

  function addNftRow(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (container.children.length >= state.nftLimit) {
      showToast(`You can only include up to ${state.nftLimit} NFTs on each side.`, 'warning');
      return;
    }

    const row = document.createElement('div');
    row.className = 'nft-row';

    const contractInput = document.createElement('input');
    contractInput.type = 'text';
    contractInput.placeholder = 'NFT contract (0x...)';
    contractInput.className = 'nft-contract';
    contractInput.autocomplete = 'off';

    const tokenInput = document.createElement('input');
    tokenInput.type = 'number';
    tokenInput.placeholder = 'Token ID';
    tokenInput.min = '0';
    tokenInput.step = '1';
    tokenInput.className = 'nft-token';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-row';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      if (container.children.length === 1) {
        contractInput.value = '';
        tokenInput.value = '';
        return;
      }
      container.removeChild(row);
    });

    row.appendChild(contractInput);
    row.appendChild(tokenInput);
    row.appendChild(removeButton);
    container.appendChild(row);
  }

  function updateContractInfo() {
    const address = AppConfig.contractAddress || '';
    const isValid = utils.isAddress ? utils.isAddress(address) : /^0x[a-fA-F0-9]{40}$/.test(address);
    elements.contractAddress.textContent = address && isValid ? address : 'Update config.js';
    elements.copyContract.disabled = !isValid;
  }

  async function setupReadContract() {
    const address = AppConfig.contractAddress || '';
    if (!address || !utils.isAddress(address)) {
      showToast('Set a valid contract address in frontend/config.js to load offers.', 'warning');
      elements.feeDisplay.textContent = '—';
      return;
    }

    try {
      state.readProvider = new providers.JsonRpcProvider(AppConfig.readRpcUrl);
      state.readContract = new Contract(address, state.abi, state.readProvider);

      await updateFee();
      await updateNftLimit();
    } catch (err) {
      console.error(err);
      showToast('Unable to initialise read-only contract. Check RPC endpoint.', 'error');
    }
  }

  async function updateFee() {
    if (!state.readContract) return;
    try {
      const fee = await state.readContract.fee();
      state.cachedFee = fee;
      elements.feeDisplay.textContent = `${utils.formatEther(fee)} AVAX`;
    } catch (err) {
      console.error('Failed to read fee', err);
      elements.feeDisplay.textContent = '—';
    }
  }

  async function updateNftLimit() {
    if (!state.readContract) return;
    try {
      const limit = await state.readContract.MAX_NFTS_PER_SIDE();
      state.nftLimit = limit.toNumber();
      elements.nftLimit.textContent = state.nftLimit.toString();
    } catch (err) {
      console.warn('Failed to read MAX_NFTS_PER_SIDE, using configured value.', err);
      state.nftLimit = AppConfig.maxNftsPerSide || state.nftLimit || 20;
      elements.nftLimit.textContent = state.nftLimit.toString();
    }
  }

  async function connectWallet() {
    if (!window.ethereum) {
      showToast('Install MetaMask or a compatible wallet to continue.', 'error');
      return;
    }

    if (!AppConfig.contractAddress || !utils.isAddress(AppConfig.contractAddress)) {
      showToast('Set a valid contract address in frontend/config.js before connecting.', 'warning');
      return;
    }

    try {
      const provider = new providers.Web3Provider(window.ethereum, 'any');
      await provider.send('eth_requestAccounts', []);

      let network = await provider.getNetwork();
      if (AppConfig.targetChainId && network.chainId !== AppConfig.targetChainId) {
        await switchNetwork();
        network = await provider.getNetwork();
      }

      const signer = provider.getSigner();
      const account = await signer.getAddress();

      state.provider = provider;
      state.signer = signer;
      state.account = account;
      state.chainId = network.chainId;
      state.contract = new Contract(AppConfig.contractAddress, state.abi, signer);

      updateAccountDisplay();
      updateNetworkDisplay(network);
      elements.connectButton.textContent = 'Wallet Connected';
      elements.connectButton.disabled = false;
      registerWalletListeners();

      showToast('Wallet connected.', 'success');
    } catch (err) {
      console.error(err);
      showToast(parseEthersError(err) || 'Wallet connection failed.', 'error');
    }
  }

  async function switchNetwork() {
    const { chainParams } = AppConfig;
    if (!chainParams) {
      throw new Error('Target network configuration missing.');
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainParams.chainId }],
      });
      showToast(`Switched to ${chainParams.chainName}.`, 'success');
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [chainParams],
        });
      } else {
        throw err;
      }
    }
  }

  function registerWalletListeners() {
    if (!window.ethereum || state.listenersRegistered) return;

    walletHandlers.accountsChanged = async (accounts) => {
      if (!accounts || accounts.length === 0) {
        disconnectWallet();
      } else {
        state.account = accounts[0];
        if (state.provider) {
          state.signer = state.provider.getSigner();
          state.contract = new Contract(AppConfig.contractAddress, state.abi, state.signer);
        }
        updateAccountDisplay();
      }
    };

    walletHandlers.chainChanged = async (chainIdHex) => {
      const chainId = parseInt(chainIdHex, 16);
      state.chainId = chainId;
      if (window.ethereum) {
        state.provider = new providers.Web3Provider(window.ethereum, 'any');
        state.signer = state.provider.getSigner();
        if (AppConfig.contractAddress && utils.isAddress(AppConfig.contractAddress)) {
          state.contract = new Contract(AppConfig.contractAddress, state.abi, state.signer);
        }
        const network = await state.provider.getNetwork();
        updateNetworkDisplay(network);
        await updateFee();
        await updateNftLimit();
      } else {
        updateNetworkDisplay({ chainId });
      }

      if (AppConfig.targetChainId && chainId !== AppConfig.targetChainId) {
        showToast('You switched to an unsupported network.', 'warning');
      } else {
        await refreshOffers();
      }
    };

    window.ethereum.on('accountsChanged', walletHandlers.accountsChanged);
    window.ethereum.on('chainChanged', walletHandlers.chainChanged);
    state.listenersRegistered = true;
  }

  function disconnectWallet() {
    state.account = null;
    state.provider = null;
    state.signer = null;
    state.contract = null;
    elements.connectButton.textContent = 'Connect Wallet';
    elements.accountDisplay.textContent = 'Not connected';
  }

  async function handleCopyContract() {
    if (!AppConfig.contractAddress || !utils.isAddress(AppConfig.contractAddress)) return;
    try {
      await navigator.clipboard.writeText(AppConfig.contractAddress);
      showToast('Contract address copied to clipboard.', 'success');
    } catch (err) {
      console.error('Clipboard write failed', err);
    }
  }

  function updateAccountDisplay() {
    if (!state.account) {
      elements.accountDisplay.textContent = 'Not connected';
      return;
    }
    elements.accountDisplay.textContent = shortenAddress(state.account);
  }

  function updateNetworkDisplay(network) {
    if (!network) {
      elements.networkDisplay.textContent = '—';
      return;
    }

    const chainId = network.chainId || state.chainId;
    let label = `Chain ID ${chainId}`;
    if (AppConfig.chainParams && parseInt(AppConfig.chainParams.chainId, 16) === chainId) {
      label = `${AppConfig.chainParams.chainName} (${chainId})`;
    }
    elements.networkDisplay.textContent = label;
  }

  async function handleCreateOffer() {
    if (!state.contract) {
      showToast('Connect your wallet before creating an offer.', 'warning');
      return;
    }

    const submitButton = elements.createOfferForm.querySelector('button.primary');
    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Submitting…';

    try {
      const offers = readNftInputs('offerNFTs');
      const requests = readNftInputs('requestNFTs');
      if (offers.contracts.length === 0 || requests.contracts.length === 0) {
        throw new Error('You must specify at least one NFT on each side.');
      }

      const durationHours = parseInt(elements.durationHours.value, 10);
      if (!Number.isFinite(durationHours) || durationHours <= 0) {
        throw new Error('Duration must be a positive number of hours.');
      }
      const durationSeconds = BigNumber.from(durationHours.toString()).mul(3600);

      const fee = await state.contract.fee();
      state.cachedFee = fee;

      const tx = await state.contract.createMultiSwapOffer(
        offers.contracts,
        offers.tokenIds,
        requests.contracts,
        requests.tokenIds,
        durationSeconds,
        { value: fee }
      );

      showToast(`Transaction submitted: ${shortenHash(tx.hash)}`, 'info');
      await tx.wait();
      showToast('Swap offer created successfully.', 'success');
      elements.createOfferForm.reset();
      resetNftInputs();
      await refreshOffers();
    } catch (err) {
      console.error(err);
      showToast(parseEthersError(err) || 'Failed to create offer.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }

  function resetNftInputs() {
    elements.offerNFTs.innerHTML = '';
    elements.requestNFTs.innerHTML = '';
    addNftRow('offerNFTs');
    addNftRow('requestNFTs');
  }

  function readNftInputs(containerId) {
    const container = document.getElementById(containerId);
    const rows = Array.from(container.querySelectorAll('.nft-row'));
    const contracts = [];
    const tokenIds = [];

    rows.forEach((row) => {
      const contractValue = row.querySelector('.nft-contract').value.trim();
      const tokenValue = row.querySelector('.nft-token').value.trim();
      if (!contractValue && !tokenValue) {
        return;
      }
      if (!utils.isAddress(contractValue)) {
        throw new Error(`Invalid NFT contract address: ${contractValue}`);
      }
      if (!tokenValue) {
        throw new Error('Token ID is required for each NFT.');
      }
      const checksumAddress = utils.getAddress(contractValue);
      const tokenId = BigNumber.from(tokenValue).toString();
      contracts.push(checksumAddress);
      tokenIds.push(tokenId);
    });

    return { contracts, tokenIds };
  }

  async function refreshOffers(fromButton) {
    if (!state.readContract || state.refreshing) {
      if (!state.readContract) {
        elements.offersList.innerHTML =
          '<p class="muted">Add your contract address in <code>frontend/config.js</code> to load offers.</p>';
      }
      return;
    }

    state.refreshing = true;
    elements.offersList.innerHTML = '<p class="muted">Loading offers…</p>';

    try {
      const filter = state.readContract.filters.MultiSwapOfferCreated();
      const startBlockConfig = AppConfig.eventQueryStartBlock;
      let startBlock = 0;
      if (typeof startBlockConfig === 'number' && Number.isFinite(startBlockConfig)) {
        startBlock = startBlockConfig;
      } else if (typeof startBlockConfig === 'string' && startBlockConfig.trim().length) {
        const parsed = Number(startBlockConfig);
        if (!Number.isNaN(parsed)) {
          startBlock = parsed;
        }
      }
      const logs = await state.readContract.queryFilter(filter, startBlock, 'latest');

      const offers = await Promise.all(
        logs.map(async (log) => {
          const offerId = log.args.offerId.toNumber();
          const details = await state.readContract.getOfferDetails(log.args.offerId);
          return mapOffer(offerId, details);
        })
      );

      state.offers = offers.filter((offer) => offer.isActive);
      state.offers.sort((a, b) => a.expiresAt - b.expiresAt);
      renderOffers();

      if (fromButton) {
        showToast('Offers refreshed.', 'success');
      }
    } catch (err) {
      console.error('Failed to load offers', err);
      elements.offersList.innerHTML =
        '<p class="muted">Unable to load offers. Check your RPC URL and start block.</p>';
    } finally {
      state.refreshing = false;
    }
  }

  function mapOffer(offerId, raw) {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = raw.expiresAt.toNumber();
    const isExpired = expiresAt <= now;
    const offer = {
      offerId,
      creator: raw.creator,
      recipient: raw.recipient,
      tokenA: raw.tokenAContracts.map((address, index) => ({
        contract: address,
        tokenId: raw.tokenAIds[index].toString(),
      })),
      tokenB: raw.tokenBContracts.map((address, index) => ({
        contract: address,
        tokenId: raw.tokenBIds[index].toString(),
      })),
      expiresAt,
      isActive: raw.isActive,
      isExpired,
    };
    return offer;
  }

  function renderOffers() {
    elements.offersList.innerHTML = '';

    if (!state.offers.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No active swap offers yet.';
      elements.offersList.appendChild(empty);
      return;
    }

    state.offers.forEach((offer) => {
      elements.offersList.appendChild(createOfferCard(offer));
    });
  }

  function createOfferCard(offer) {
    const card = document.createElement('div');
    card.className = 'offer-card';

    const header = document.createElement('div');
    header.className = 'offer-header';

    const title = document.createElement('h3');
    title.textContent = `Offer #${offer.offerId}`;
    header.appendChild(title);

    const badges = document.createElement('div');
    const isMine = state.account && offer.creator.toLowerCase() === state.account.toLowerCase();
    if (isMine) {
      badges.appendChild(createBadge('You created this', 'self'));
    }
    if (offer.isExpired) {
      badges.appendChild(createBadge('Expired', 'expired'));
    }
    if (offer.recipient && offer.recipient !== ethers.constants.AddressZero) {
      badges.appendChild(createBadge('Accepted', 'recipient'));
    }
    if (badges.children.length) {
      header.appendChild(badges);
    }

    const meta = document.createElement('div');
    meta.className = 'offer-meta';
    meta.appendChild(createMeta('Creator', shortenAddress(offer.creator)));
    meta.appendChild(createMeta('Escrow NFTs', `${offer.tokenA.length}`));
    meta.appendChild(createMeta('Requested NFTs', `${offer.tokenB.length}`));
    meta.appendChild(createMeta('Expires', formatTimestamp(offer.expiresAt)));
    meta.appendChild(createMeta('Time left', formatCountdown(offer.expiresAt)));

    const body = document.createElement('div');
    body.className = 'offer-body';

    body.appendChild(createNftGroup('Escrowed NFTs', offer.tokenA));
    body.appendChild(createNftGroup('Requested NFTs', offer.tokenB));

    const actions = document.createElement('div');
    actions.className = 'offer-actions';

    if (!isMine) {
      const accept = document.createElement('button');
      accept.className = 'primary';
      accept.textContent = 'Accept Offer';
      accept.disabled = offer.isExpired || !state.contract;
      accept.addEventListener('click', () => acceptOffer(offer.offerId));
      actions.appendChild(accept);
    }

    if (isMine) {
      const cancel = document.createElement('button');
      cancel.className = 'secondary';
      cancel.textContent = offer.isExpired ? 'Cancel (expired)' : 'Cancel Offer';
      cancel.addEventListener('click', () =>
        offer.isExpired ? cancelExpiredOffer(offer.offerId) : cancelOffer(offer.offerId)
      );
      actions.appendChild(cancel);
    }

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(body);
    if (actions.children.length) {
      card.appendChild(actions);
    }
    return card;
  }

  function createBadge(label, type) {
    const badge = document.createElement('span');
    badge.className = `badge ${type}`;
    badge.textContent = label;
    return badge;
  }

  function createMeta(label, value) {
    const wrapper = document.createElement('span');
    wrapper.innerHTML = `<strong>${label}:</strong> ${value}`;
    return wrapper;
  }

  function createNftGroup(title, nfts) {
    const group = document.createElement('div');
    const heading = document.createElement('h4');
    heading.textContent = title;
    group.appendChild(heading);

    if (!nfts.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'None';
      group.appendChild(empty);
      return group;
    }

    const chips = document.createElement('div');
    chips.className = 'nft-chip-group';
    nfts.forEach((item) => {
      const chip = document.createElement('span');
      chip.className = 'nft-chip';
      chip.textContent = `${shortenAddress(item.contract)} · #${item.tokenId}`;
      chips.appendChild(chip);
    });
    group.appendChild(chips);
    return group;
  }

  async function acceptOffer(offerId) {
    if (!state.contract) {
      showToast('Connect your wallet before accepting offers.', 'warning');
      return;
    }

    try {
      const tx = await state.contract.acceptMultiSwapOffer(offerId);
      showToast(`Accepting offer… ${shortenHash(tx.hash)}`, 'info');
      await tx.wait();
      showToast('Offer accepted! NFTs have been swapped.', 'success');
      await refreshOffers();
    } catch (err) {
      console.error(err);
      showToast(parseEthersError(err) || 'Failed to accept offer.', 'error');
    }
  }

  async function cancelOffer(offerId) {
    if (!state.contract) {
      showToast('Connect your wallet before cancelling offers.', 'warning');
      return;
    }

    try {
      const tx = await state.contract.cancelSwapOffer(offerId);
      showToast(`Cancelling offer… ${shortenHash(tx.hash)}`, 'info');
      await tx.wait();
      showToast('Offer cancelled and NFTs returned.', 'success');
      await refreshOffers();
    } catch (err) {
      console.error(err);
      showToast(parseEthersError(err) || 'Failed to cancel offer.', 'error');
    }
  }

  async function cancelExpiredOffer(offerId) {
    if (!state.contract) {
      showToast('Connect your wallet before cancelling offers.', 'warning');
      return;
    }

    try {
      const tx = await state.contract.cancelExpiredOffer(offerId);
      showToast(`Cancelling expired offer… ${shortenHash(tx.hash)}`, 'info');
      await tx.wait();
      showToast('Expired offer cancelled and NFTs returned.', 'success');
      await refreshOffers();
    } catch (err) {
      console.error(err);
      showToast(parseEthersError(err) || 'Failed to cancel expired offer.', 'error');
    }
  }

  function shortenAddress(address) {
    if (!address) return '—';
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  function shortenHash(hash) {
    if (!hash) return '';
    return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
  }

  function formatTimestamp(seconds) {
    if (!seconds) return '—';
    const date = new Date(seconds * 1000);
    return date.toLocaleString();
  }

  function formatCountdown(targetSeconds) {
    const now = Math.floor(Date.now() / 1000);
    const diff = targetSeconds - now;
    if (diff <= 0) {
      return 'Expired';
    }
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  function parseEthersError(error) {
    if (!error) return null;
    if (error?.error?.message) return error.error.message;
    if (error?.data?.message) return error.data.message;
    if (error?.reason) return error.reason;
    if (error?.message) return error.message.split('\n')[0];
    return null;
  }

  let toastTimeout;
  function showToast(message, type = 'info') {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.className = '';
    elements.toast.classList.add(type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info');
    elements.toast.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 4200);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshOffers();
    }
  });

  initialize();
})();
