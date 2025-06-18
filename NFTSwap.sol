// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract NFTSwap is ERC721Holder, ReentrancyGuard, Ownable {
    using Counters for Counters.Counter;
    
    uint256 public fee;
    uint256 public constant MAX_NFTS_PER_SIDE = 20; // Cap on NFTs per side of the trade

    // Updated events for multi-NFT swaps
    event MultiSwapOfferCreated(
        uint256 indexed offerId, 
        address indexed creator,
        address[] tokenAContracts,
        uint256[] tokenAIds,
        address[] tokenBContracts,
        uint256[] tokenBIds,
        uint256 expiresAt
    );
    
    // New event to show NFT counts
    event SwapOfferCounts(
        uint256 indexed offerId,
        uint256 tokenACount,
        uint256 tokenBCount
    );
    
    event SwapCompleted(
        uint256 indexed offerId, 
        address indexed creator,
        address indexed acceptor
    );
    
    event SwapCancelled(uint256 indexed offerId);

    // Updated struct for multi-NFT swaps
    struct SwapOffer {
        bool isActive; // Moved to the top for gas optimization
        address creator;
        address recipient;
        address[] tokenAContracts; // Array of NFT contracts creator is offering
        uint256[] tokenAIds;       // Array of token IDs creator is offering
        address[] tokenBContracts; // Array of NFT contracts creator wants
        uint256[] tokenBIds;       // Array of token IDs creator wants
        uint256 expiresAt;
    }

    Counters.Counter private _nextOfferId;
    mapping(uint256 => SwapOffer) public swapOffers;

    constructor(uint256 _initialFee) {
        _transferOwnership(msg.sender);
        fee = _initialFee;
        _nextOfferId.increment(); // Start with offerId 1
    }

    function createMultiSwapOffer(
        address[] calldata tokenAContracts,
        uint256[] calldata tokenAIds,
        address[] calldata tokenBContracts,
        uint256[] calldata tokenBIds,
        uint256 duration
    ) external payable nonReentrant {
        require(msg.value >= fee, "Insufficient fee");
        require(duration > 0, "Duration must be > 0");
        
        // Only validate that each side's arrays match each other
        // We don't require the sides to have the same number of NFTs
        require(tokenAContracts.length == tokenAIds.length, "Offered contracts/IDs length mismatch");
        require(tokenBContracts.length == tokenBIds.length, "Requested contracts/IDs length mismatch");
        
        // Enforce maximum number of NFTs per side
        require(tokenAContracts.length <= MAX_NFTS_PER_SIDE, "Too many NFTs offered");
        require(tokenBContracts.length <= MAX_NFTS_PER_SIDE, "Too many NFTs requested");
        
        // Require at least one NFT on each side
        require(tokenAContracts.length > 0, "Must offer at least one NFT");
        require(tokenBContracts.length > 0, "Must request at least one NFT");

        // Get the next offer ID
        uint256 offerId = _nextOfferId.current();
        _nextOfferId.increment();

        // Transfer all offered NFTs to the contract
        for (uint256 i = 0; i < tokenAContracts.length; i++) {
            IERC721(tokenAContracts[i]).safeTransferFrom(
                msg.sender, 
                address(this), 
                tokenAIds[i]
            );
        }

        uint256 expirationTime = block.timestamp + duration;
        
        // Create the swap offer
        swapOffers[offerId] = SwapOffer({
            isActive: true,
            creator: msg.sender,
            recipient: address(0),
            tokenAContracts: tokenAContracts,
            tokenAIds: tokenAIds,
            tokenBContracts: tokenBContracts,
            tokenBIds: tokenBIds,
            expiresAt: expirationTime
        });
        
        // Emit event with all relevant data
        emit MultiSwapOfferCreated(
            offerId,
            msg.sender,
            tokenAContracts,
            tokenAIds,
            tokenBContracts,
            tokenBIds,
            expirationTime
        );
        
        // Also emit the counts for easy tracking of multi-NFT trades
        emit SwapOfferCounts(
            offerId,
            tokenAContracts.length,
            tokenBContracts.length
        );
    }

    function acceptMultiSwapOffer(uint256 offerId) external nonReentrant {
        SwapOffer storage offer = swapOffers[offerId];
        require(offer.isActive, "Offer not active");
        require(block.timestamp <= offer.expiresAt, "Offer expired");
        
        // Verify ownership of all requested NFTs
        for (uint256 i = 0; i < offer.tokenBContracts.length; i++) {
            require(
                IERC721(offer.tokenBContracts[i]).ownerOf(offer.tokenBIds[i]) == msg.sender,
                "You don't own all requested NFTs"
            );
        }
        
        // Mark the offer inactive FIRST to prevent reentrancy
        offer.isActive = false;
        offer.recipient = msg.sender;
        
        // Transfer all requested NFTs from acceptor to creator
        for (uint256 i = 0; i < offer.tokenBContracts.length; i++) {
            IERC721(offer.tokenBContracts[i]).safeTransferFrom(
                msg.sender, 
                offer.creator, 
                offer.tokenBIds[i]
            );
        }
        
        // Transfer all offered NFTs from contract to acceptor
        for (uint256 i = 0; i < offer.tokenAContracts.length; i++) {
            IERC721(offer.tokenAContracts[i]).safeTransferFrom(
                address(this), 
                msg.sender, 
                offer.tokenAIds[i]
            );
        }
        
        // Emit completion event
        emit SwapCompleted(offerId, offer.creator, msg.sender);
        
        // Free up storage space for gas refund
        delete swapOffers[offerId];
    }

    function cancelExpiredOffer(uint256 offerId) external nonReentrant {
        SwapOffer storage offer = swapOffers[offerId];
        require(offer.isActive, "Offer not active");
        require(block.timestamp > offer.expiresAt, "Offer not expired yet");
        require(msg.sender == offer.creator, "Only creator can cancel");

        // Mark the offer inactive FIRST
        offer.isActive = false;
        
        // Return all NFTs to the creator
        for (uint256 i = 0; i < offer.tokenAContracts.length; i++) {
            IERC721(offer.tokenAContracts[i]).safeTransferFrom(
                address(this), 
                offer.creator, 
                offer.tokenAIds[i]
            );
        }
        
        // Emit cancellation event
        emit SwapCancelled(offerId);
        
        // Free up storage space for gas refund
        delete swapOffers[offerId];
    }
    
    function cancelSwapOffer(uint256 offerId) external nonReentrant {
        SwapOffer storage offer = swapOffers[offerId];
        require(offer.isActive, "Offer not active");
        require(msg.sender == offer.creator, "Only creator can cancel");

        // Mark the offer inactive FIRST
        offer.isActive = false;
        
        // Return all NFTs to the creator
        for (uint256 i = 0; i < offer.tokenAContracts.length; i++) {
            IERC721(offer.tokenAContracts[i]).safeTransferFrom(
                address(this), 
                offer.creator, 
                offer.tokenAIds[i]
            );
        }
        
        // Emit cancellation event
        emit SwapCancelled(offerId);
        
        // Free up storage space for gas refund
        delete swapOffers[offerId];
    }

    // View function to get offer details
    function getOfferDetails(uint256 offerId) external view returns (
        address creator,
        address recipient,
        address[] memory tokenAContracts,
        uint256[] memory tokenAIds,
        address[] memory tokenBContracts,
        uint256[] memory tokenBIds,
        uint256 expiresAt,
        bool isActive
    ) {
        SwapOffer storage offer = swapOffers[offerId];
        return (
            offer.creator,
            offer.recipient,
            offer.tokenAContracts,
            offer.tokenAIds,
            offer.tokenBContracts,
            offer.tokenBIds,
            offer.expiresAt,
            offer.isActive
        );
    }

    // Emergency function for recovery (should be used with caution)
    function emergencyWithdraw(address token, uint256 tokenId) external onlyOwner {
        IERC721(token).safeTransferFrom(address(this), owner(), tokenId);
    }

    // Withdraw accumulated fees
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Fee withdrawal failed");
    }

    // Update the fee amount
    function updateFee(uint256 newFee) external onlyOwner {
        fee = newFee;
    }
    
    // For backward compatibility - old offer format
    function createSwapOffer(
        address tokenA,
        uint256 tokenIdA,
        address tokenB,
        uint256 tokenIdB,
        uint256 duration
    ) external payable nonReentrant {
        require(msg.value >= fee, "Insufficient fee");
        require(duration > 0, "Duration must be > 0");

        // Convert to arrays
        address[] memory tokenAContracts = new address[](1);
        uint256[] memory tokenAIds = new uint256[](1);
        address[] memory tokenBContracts = new address[](1);
        uint256[] memory tokenBIds = new uint256[](1);
        
        tokenAContracts[0] = tokenA;
        tokenAIds[0] = tokenIdA;
        tokenBContracts[0] = tokenB;
        tokenBIds[0] = tokenIdB;
        
        // Directly implement the logic rather than calling createMultiSwapOffer
        uint256 offerId = _nextOfferId.current();
        _nextOfferId.increment();

        // Transfer the NFT to this contract
        IERC721(tokenA).safeTransferFrom(msg.sender, address(this), tokenIdA);

        uint256 expirationTime = block.timestamp + duration;
        
        // Create the swap offer
        swapOffers[offerId] = SwapOffer({
            isActive: true,
            creator: msg.sender,
            recipient: address(0),
            tokenAContracts: tokenAContracts,
            tokenAIds: tokenAIds,
            tokenBContracts: tokenBContracts,
            tokenBIds: tokenBIds,
            expiresAt: expirationTime
        });
        
        // Emit event with all relevant data
        emit MultiSwapOfferCreated(
            offerId,
            msg.sender,
            tokenAContracts,
            tokenAIds,
            tokenBContracts,
            tokenBIds,
            expirationTime
        );
    }
    
    // For backward compatibility - old offer format
    function acceptSwapOffer(uint256 offerId) external nonReentrant {
        SwapOffer storage offer = swapOffers[offerId];
        require(offer.isActive, "Offer not active");
        require(block.timestamp <= offer.expiresAt, "Offer expired");
        
        // Basic validation for backward compatibility
        require(offer.tokenBContracts.length == 1, "Not a single NFT offer");
        
        // Verify ownership of the requested NFT
        require(
            IERC721(offer.tokenBContracts[0]).ownerOf(offer.tokenBIds[0]) == msg.sender,
            "You don't own the requested NFT"
        );
        
        // Mark the offer inactive FIRST to prevent reentrancy
        offer.isActive = false;
        offer.recipient = msg.sender;
        
        // Transfer the requested NFT from acceptor to creator
        IERC721(offer.tokenBContracts[0]).safeTransferFrom(
            msg.sender, 
            offer.creator, 
            offer.tokenBIds[0]
        );
        
        // Transfer the offered NFT from contract to acceptor
        IERC721(offer.tokenAContracts[0]).safeTransferFrom(
            address(this), 
            msg.sender, 
            offer.tokenAIds[0]
        );
        
        // Emit completion event
        emit SwapCompleted(offerId, offer.creator, msg.sender);
        
        // Free up storage space for gas refund
        delete swapOffers[offerId];
    }
}
