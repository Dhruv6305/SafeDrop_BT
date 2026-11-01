// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IERC20.sol";

/**
 * @title HardenedAirdrop (Secure)
 * @notice Implements defenses against secondary preimage attacks in Merkle airdrops.
 * @dev Defenses implemented based on Songsom et al. (2025):
 * 1. Domain Separation: Disjoint prefixes for leaves ("LEAF:") and nodes ("NODE:").
 * 2. Proof-Length Validation: Proof length must strictly match tree depth.
 */
contract HardenedAirdrop {
    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;
    uint256 public immutable treeDepth;
    address public immutable owner;

    mapping(address => bool) public hasClaimed;

    event ClaimAccepted(address indexed recipient, uint256 amount, bytes32 leaf);
    event ClaimRejected(address indexed recipient, uint256 amount, string reason);

    constructor(
        address tokenAddress,
        bytes32 _merkleRoot,
        uint256 _treeDepth
    ) {
        token = IERC20(tokenAddress);
        merkleRoot = _merkleRoot;
        treeDepth = _treeDepth;
        owner = msg.sender;
    }

    /**
     * @notice Claim airdrop allocation with domain-separated Merkle proof.
     * @param recipient The claimant's address
     * @param amount The token amount to claim
     * @param proof Sibling hashes from leaf to root
     */
    function claim(
        address recipient,
        uint256 amount,
        bytes32[] calldata proof
    ) external returns (bool) {
        require(!hasClaimed[recipient], "Already claimed");

        // DEFENSE 1: Strict proof-length validation
        // Forged proofs starting at internal nodes are shorter than tree depth!
        require(proof.length == treeDepth, "Invalid proof length: does not match tree depth");

        // DEFENSE 2: Domain separation for leaf nodes
        bytes32 computedHash = keccak256(
            bytes.concat("LEAF:", abi.encodePacked(recipient, amount))
        );

        // DEFENSE 3: Domain separation for internal nodes ("NODE:")
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(
                    bytes.concat("NODE:", abi.encodePacked(computedHash, proofElement))
                );
            } else {
                computedHash = keccak256(
                    bytes.concat("NODE:", abi.encodePacked(proofElement, computedHash))
                );
            }
        }

        require(computedHash == merkleRoot, "Invalid Merkle proof");

        hasClaimed[recipient] = true;
        require(token.transfer(recipient, amount), "Token transfer failed");

        emit ClaimAccepted(recipient, amount, computedHash);
        return true;
    }

    /**
     * @notice Emergency withdrawal of unclaimed tokens by owner.
     */
    function withdrawRemaining(address to) external {
        require(msg.sender == owner, "Only owner");
        uint256 balance = token.balanceOf(address(this));
        require(token.transfer(to, balance), "Transfer failed");
    }
}
