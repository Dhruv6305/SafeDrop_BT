// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IERC20.sol";

/**
 * @title NaiveAirdrop (Vulnerable)
 * @notice Demonstrates a secondary preimage attack vulnerability in Merkle proof airdrops.
 * @dev Hashing leaves and internal nodes with identical serialization and without domain
 * separation allows an intermediate node's two child hashes to be accepted as a valid leaf.
 */
contract NaiveAirdrop {
    IERC20 public immutable token;
    bytes32 public immutable merkleRoot;
    address public immutable owner;

    mapping(address => bool) public hasClaimed;

    event ClaimAccepted(address indexed recipient, uint256 amount, bytes32 leaf);
    event ClaimRejected(address indexed recipient, uint256 amount, string reason);

    constructor(address tokenAddress, bytes32 _merkleRoot) {
        token = IERC20(tokenAddress);
        merkleRoot = _merkleRoot;
        owner = msg.sender;
    }

    /**
     * @notice Claim airdrop allocation with a Merkle proof.
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

        // VULNERABILITY 1: Leaf hashing has no domain separation tag
        bytes32 computedHash = keccak256(abi.encodePacked(recipient, amount));

        // VULNERABILITY 2: No proof length check against tree depth!
        // Sibling traversal: identical hash formulation as leaf
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
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
